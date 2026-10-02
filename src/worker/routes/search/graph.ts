import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import { truncateText } from '@shared/text-utils'
import { wikiNoteTarget } from '@shared/markdown-utils'
import { parseGraphFilter, type GraphFilterTerm } from '@shared/graph-filter-expression'
import type { GraphResponse } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidId } from '../../lib/id'
import { clampInt } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { excludedNoteClause, GRAPH_EDGE_CANDIDATE_LIMIT, GRAPH_QUERY_MAX_CHARS, GRAPH_UNRESOLVED_ALLOWANCE, GRAPH_UNRESOLVED_MAX, parseExcludedNoteIds } from './helpers'
import { escapeLike } from './helpers'
import { applyUnresolvedNodes } from './graph-nodes'
import { consumeGraphReadBudget } from './read-budget'
import { applyTagNodes } from '@shared/graph-tag-nodes'

// D1 refuses a statement with more than 100 bound variables, and the edge query binds the user once
// plus the note ids on both sides of the join (and its own LIMIT), so a page of notes has to be
// walked in chunks: the graph asks for up to 350 notes, which as one statement is a 500-too-many-
// variables error instead of a graph. 40 keeps the widest of the two queries at 82 bindings.
const GRAPH_NOTE_ID_CHUNK = 40

interface GraphParams {
  userId: string
  mode: 'local' | 'global'
  centerId: string | null
  depth: number
  limit: number
  query: string
  folderId: string
  tags: string[]
  tagsMatch: 'all' | 'any'
  includeOrphans: boolean
  includeUnresolved: boolean
  showTagNodes: boolean
  excluded: string[]
  rawCenter: string
  rawFolderId: string
  legacyTag: string
}

type GraphRow = {
  id: string
  title: string
  folder_id: string | null
  folder_name: string | null
  folder_color: string | null
  degree: number
  in_degree: number
  out_degree: number
}

type GraphLinkRow = {
  source_note_id: string
  target_note_id: string | null
  target_key: string
  target_title: string
}

type GraphTagRow = { note_id: string; name: string; color: string | null }

// Link degrees are aggregated once per user (single pass over links) and
// joined by note id, instead of three correlated sub-probes per note row.
const degreeJoin = `
  LEFT JOIN (
    SELECT note_id,
           SUM(is_endpoint) AS degree,
           SUM(is_target) AS in_degree,
           SUM(is_source) AS out_degree
    FROM (
      SELECT l.source_note_id AS note_id, 1 AS is_endpoint, 0 AS is_target, 1 AS is_source
        FROM links l
        JOIN notes adj ON adj.id = l.target_note_id AND adj.user_id = l.user_id
          AND adj.deleted_at IS NULL AND adj.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
      UNION ALL
      SELECT l.target_note_id AS note_id, 1, 1, 0
        FROM links l
        JOIN notes adj ON adj.id = l.source_note_id AND adj.user_id = l.user_id
          AND adj.deleted_at IS NULL AND adj.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
    ) GROUP BY note_id
  ) d ON d.note_id = n.id`

const degreeColumns = `COALESCE(d.degree, 0) AS degree,
  COALESCE(d.in_degree, 0) AS in_degree, COALESCE(d.out_degree, 0) AS out_degree`

export function registerSearchGraphRoutes(searchRoutes: Hono<AppBindings>): void {
  searchRoutes.get('/graph', requireAuth, graphHandler)
}

async function graphHandler(c: Context<AppBindings>): Promise<Response> {
  const params = parseGraphParams(c)
  // Charged after the request line has been read, so a malformed query answers 400 without spending
  // the account's read budget, and before the queries, so a runaway loop is what meets the 429.
  await consumeGraphReadBudget(c.env.DB, params.userId)
  const { filters, filterBinds } = buildGraphFilters(params)
  const { rows, totalNodes } = params.mode === 'local'
    ? await runLocalGraphQuery(c.env.DB, params, filters, filterBinds)
    : await runGlobalGraphQuery(c.env.DB, params, filters, filterBinds)
  const noteLimit = params.includeUnresolved ? Math.max(1, params.limit - GRAPH_UNRESOLVED_ALLOWANCE) : params.limit
  let truncated = rows.length > noteLimit || totalNodes > noteLimit
  const pageRows = rows.slice(0, noteLimit)
  const graph = await loadGraphEdgesAndTags(c.env.DB, params.userId, pageRows, params.includeUnresolved)
  if (graph.truncated) truncated = true
  if (graph.unresolved.size >= GRAPH_UNRESOLVED_MAX) truncated = true
  const body = buildGraphBody(pageRows, graph.edges, graph.unresolved, graph.tagsByNote, {
    mode: params.mode,
    centerId: params.mode === 'local' ? params.centerId : null,
    depth: params.depth,
    totalNodes,
    truncated,
    limit: params.limit,
    showTagNodes: params.showTagNodes,
  })
  return c.json(body)
}

function parseGraphParams(c: Context<AppBindings>): GraphParams {
  const rawCenter = (c.req.query('center') ?? '').trim()
  const rawFolderId = (c.req.query('folderId') ?? '').trim()
  const legacyTag = (c.req.query('tag') ?? '').trim()
  const tags = [...new Set((c.req.query('tags') ?? '').split(',').map((item) => item.trim()).filter(Boolean))]
    .slice(0, LIMITS.tagSelectionMax)
  if (tags.length === 0 && legacyTag) tags.push(legacyTag)
  const params: GraphParams = {
    userId: c.get('userId'),
    mode: c.req.query('mode') === 'local' ? 'local' : 'global',
    centerId: rawCenter && isValidId(rawCenter) ? rawCenter : null,
    depth: clampInt(c.req.query('depth'), LIMITS.graphDepthMin, LIMITS.graphDepthMax, LIMITS.graphDepthDefault),
    limit: clampInt(c.req.query('limit'), LIMITS.graphNodeLimitMin, LIMITS.graphNodeLimitMax, LIMITS.graphNodeLimitDefault),
    query: (c.req.query('q') ?? '').trim(),
    folderId: rawFolderId && isValidId(rawFolderId) ? rawFolderId : '',
    tags,
    tagsMatch: c.req.query('tagsMatch') === 'all' ? 'all' : 'any',
    includeOrphans: c.req.query('includeOrphans') !== '0',
    includeUnresolved: c.req.query('includeUnresolved') === '1',
    showTagNodes: c.req.query('tagNodes') === '1',
    excluded: parseExcludedNoteIds(c.req.query('excluded'), isValidId, LIMITS.graphExcludedMax),
    rawCenter,
    rawFolderId,
    legacyTag,
  }
  validateGraphParams(params)
  return params
}

function validateGraphParams(params: GraphParams): void {
  if (params.rawCenter && !params.centerId) {
    throw new ApiError(400, 'bad_request', 'The center note id is not a valid note id')
  }
  if (params.rawFolderId && !params.folderId) {
    throw new ApiError(400, 'bad_request', 'The folder id is not a valid folder id')
  }
  if (params.query.length > GRAPH_QUERY_MAX_CHARS) {
    throw new ApiError(400, 'bad_request', `The graph search query cannot exceed ${GRAPH_QUERY_MAX_CHARS} characters`)
  }
  if (params.legacyTag.length > LIMITS.tagNameMaxLength) {
    throw new ApiError(400, 'bad_request', `The graph tag cannot exceed ${LIMITS.tagNameMaxLength} characters`)
  }
  if (params.tags.some((item) => item.length > LIMITS.tagNameMaxLength)) {
    throw new ApiError(400, 'bad_request', `The graph tag cannot exceed ${LIMITS.tagNameMaxLength} characters`)
  }
  if (params.mode === 'local' && !params.centerId) {
    throw new ApiError(400, 'bad_request', 'A center note is required for the local graph')
  }
}

function buildGraphFilters(params: GraphParams): { filters: string[]; filterBinds: unknown[] } {
  const filters: string[] = ['n.user_id = ?', 'n.deleted_at IS NULL', 'n.is_archived = 0']
  const filterBinds: unknown[] = [params.userId]
  const expression = parseGraphFilter(params.query)
  if (expression.text) {
    filters.push(`n.title LIKE ? ESCAPE '\\' COLLATE NOCASE`)
    filterBinds.push(`%${escapeLike(expression.text)}%`)
  }
  for (const term of expression.terms) appendFilterTerm(filters, filterBinds, term)
  // A local graph keeps the note it is built around, whatever the reader took out of the overview (G-42).
  const exclusion = excludedNoteClause(params.excluded, params.mode === 'local' ? params.centerId : null)
  if (exclusion) {
    filters.push(exclusion.filter)
    filterBinds.push(exclusion.bind)
  }
  if (params.folderId) {
    filters.push('n.folder_id = ?')
    filterBinds.push(params.folderId)
  }
  if (params.tags.length) {
    // `tagsMatch=all` intersects the tag filters, otherwise any match qualifies.
    if (params.tagsMatch === 'all') {
      for (const tag of params.tags) {
        filters.push(`EXISTS (
          SELECT 1 FROM note_tags nt_filter
          JOIN tags t_filter ON t_filter.id = nt_filter.tag_id AND t_filter.user_id = n.user_id
          WHERE nt_filter.note_id = n.id AND t_filter.name = ? COLLATE NOCASE
        )`)
        filterBinds.push(tag)
      }
    }
    else {
      filters.push(`EXISTS (
        SELECT 1 FROM note_tags nt_filter
        JOIN tags t_filter ON t_filter.id = nt_filter.tag_id AND t_filter.user_id = n.user_id
        WHERE nt_filter.note_id = n.id AND t_filter.name COLLATE NOCASE IN (${params.tags.map(() => '?').join(', ')})
      )`)
      filterBinds.push(...params.tags)
    }
  }
  if (!params.includeOrphans) {
    filters.push(`EXISTS (
      SELECT 1 FROM links connected
      WHERE connected.user_id = n.user_id AND connected.target_note_id IS NOT NULL
        AND (connected.source_note_id = n.id OR connected.target_note_id = n.id)
    )`)
  }
  return { filters, filterBinds }
}

/** One qualified term of the filter line: `tag:` / `path:` must match, `-tag:` / `-path:` must not. */
function appendFilterTerm(filters: string[], filterBinds: unknown[], term: GraphFilterTerm): void {
  if (term.kind === 'tag') {
    filters.push(`${term.isExcluded ? 'NOT ' : ''}EXISTS (
      SELECT 1 FROM note_tags nt_term
      JOIN tags t_term ON t_term.id = nt_term.tag_id AND t_term.user_id = n.user_id
      WHERE nt_term.note_id = n.id AND t_term.name = ? COLLATE NOCASE
    )`)
    filterBinds.push(term.value)
    return
  }
  // A note without a folder has no path to exclude, so the negation reads the missing name as blank.
  filters.push(term.isExcluded
    ? `COALESCE(f.name, '') NOT LIKE ? ESCAPE '\\' COLLATE NOCASE`
    : `f.name LIKE ? ESCAPE '\\' COLLATE NOCASE`)
  filterBinds.push(`%${escapeLike(term.value)}%`)
}

async function runLocalGraphQuery(
  db: D1Database,
  params: GraphParams,
  filters: string[],
  filterBinds: unknown[],
): Promise<{ rows: GraphRow[]; totalNodes: number }> {
  const neighborhood = `WITH RECURSIVE neighborhood(id, depth, path) AS (
    SELECT ? AS id, 0 AS depth, ',' || ? || ',' AS path
    UNION
    SELECT adjacent.id,
      neighborhood.depth + 1,
      neighborhood.path || adjacent.id || ','
    FROM neighborhood
    JOIN links l ON l.user_id = ? AND l.target_note_id IS NOT NULL
      AND (l.source_note_id = neighborhood.id OR l.target_note_id = neighborhood.id)
    JOIN notes adjacent ON adjacent.id = CASE
      WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END
      AND adjacent.user_id = l.user_id AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0
    WHERE neighborhood.depth < ? AND INSTR(neighborhood.path, ',' || adjacent.id || ',') = 0
  ), nearby AS (SELECT id, MIN(depth) AS depth FROM neighborhood GROUP BY id)`
  const prefixBinds = [params.centerId, params.centerId, params.userId, params.depth]
  const result = await db.prepare(
    `${neighborhood}
     SELECT n.id, n.title, n.folder_id, f.name AS folder_name, f.color AS folder_color,
       ${degreeColumns}, nearby.depth
     FROM nearby JOIN notes n ON n.id = nearby.id
     LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     ${degreeJoin}
     WHERE ${filters.join(' AND ')}
     ORDER BY nearby.depth ASC, COALESCE(d.degree, 0) DESC, n.updated_at DESC, n.id ASC LIMIT ?`,
  ).bind(...prefixBinds, params.userId, params.userId, ...filterBinds, params.limit + 1).all<GraphRow>()
  if (result.results.length <= params.limit) {
    return { rows: result.results, totalNodes: result.results.length }
  }
  const count = await db.prepare(
    // A `path:` term names the joined folder, so the count reads the same joins as the page.
    `${neighborhood} SELECT COUNT(*) AS count FROM nearby JOIN notes n ON n.id = nearby.id
     LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     WHERE ${filters.join(' AND ')}`,
  ).bind(...prefixBinds, ...filterBinds).first<{ count: number }>()
  return { rows: result.results, totalNodes: Number(count?.count ?? result.results.length) }
}

async function runGlobalGraphQuery(
  db: D1Database,
  params: GraphParams,
  filters: string[],
  filterBinds: unknown[],
): Promise<{ rows: GraphRow[]; totalNodes: number }> {
  const result = await db.prepare(
    `SELECT n.id, n.title, n.folder_id, f.name AS folder_name, f.color AS folder_color,
       ${degreeColumns}
     FROM notes n LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     ${degreeJoin}
     WHERE ${filters.join(' AND ')}
     ORDER BY COALESCE(d.degree, 0) DESC, n.updated_at DESC, n.id ASC LIMIT ?`,
  ).bind(params.userId, params.userId, ...filterBinds, params.limit + 1).all<GraphRow>()
  if (result.results.length <= params.limit) {
    return { rows: result.results, totalNodes: result.results.length }
  }
  const count = await db.prepare(
    `SELECT COUNT(*) AS count FROM notes n
     LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     WHERE ${filters.join(' AND ')}`,
  ).bind(...filterBinds).first<{ count: number }>()
  return { rows: result.results, totalNodes: Number(count?.count ?? result.results.length) }
}

async function loadGraphEdgesAndTags(
  db: D1Database,
  userId: string,
  rows: GraphRow[],
  includeUnresolved: boolean,
): Promise<{
  edges: GraphResponse['edges']
  unresolved: Map<string, { title: string; sources: Set<string> }>
  tagsByNote: Map<string, Array<{ name: string; color: string | null }>>
  truncated: boolean
}> {
  const ids = [...new Set(rows.map((row) => row.id))]
  if (!ids.length) {
    return { edges: [], unresolved: new Map(), tagsByNote: new Map(), truncated: false }
  }
  const { linkResult, tagResult, truncated: cut } = await loadGraphLinkRows(db, userId, ids)
  const { edges, unresolved, truncated } = buildGraphEdges(linkResult.results, includeUnresolved)
  return { edges, unresolved, tagsByNote: groupTagsByNote(tagResult), truncated: truncated || cut }
}

async function loadGraphLinkRows(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<{
  linkResult: { results: GraphLinkRow[] }
  tagResult: { results: GraphTagRow[] }
  truncated: boolean
}> {
  const statements: D1PreparedStatement[] = []
  for (let index = 0; index < ids.length; index += GRAPH_NOTE_ID_CHUNK) {
    const chunk = ids.slice(index, index + GRAPH_NOTE_ID_CHUNK)
    const placeholders = chunk.map(() => '?').join(',')
    // A chunk asks for the links leaving its own notes only: binding the page on the target side as
    // well would not fit a statement a second time. Which of those links stay in the page is decided
    // below instead, because a link that leaves the page and comes back in a later chunk would be
    // dropped by a per-chunk target list. Each statement still carries its own LIMIT — the request's
    // edge candidate budget plus one row — because one note can hold more links than the whole graph
    // shows (a 2 MiB note keeps every `[[…]]` in it) and an unbounded statement hands D1's entire
    // answer to the Worker. The extra row is what tells a statement that fits from one that was cut:
    // a cut leaves rows unread, so the page hears truncated rather than looking complete.
    statements.push(
      db.prepare(
        `SELECT source_note_id, target_note_id, target_key, target_title FROM links
         WHERE user_id = ? AND source_note_id IN (${placeholders})
         ORDER BY target_key ASC LIMIT ?`,
      ).bind(userId, ...chunk, GRAPH_EDGE_CANDIDATE_LIMIT + 1),
      db.prepare(
        `SELECT nt.note_id, t.name, t.color FROM note_tags nt
         JOIN tags t ON t.id = nt.tag_id AND t.user_id = ?
         WHERE nt.note_id IN (${placeholders}) ORDER BY t.name COLLATE NOCASE ASC`,
      ).bind(userId, ...chunk),
    )
  }
  const batchResults = await db.batch<GraphLinkRow | GraphTagRow>(statements)
  const { linkRows, tagRows, truncated } = collectGraphLinkRows(batchResults, new Set(ids))
  // Each chunk was ordered on its own, so the rows are put back into the order a single statement
  // would have produced: the edge cap keeps whichever rows come first, and those should not depend
  // on how the id list happened to be split. Tags are grouped per note, so they need no reordering.
  linkRows.sort((a, b) => (
    a.source_note_id === b.source_note_id
      ? (a.target_key < b.target_key ? -1 : a.target_key > b.target_key ? 1 : 0)
      : (a.source_note_id < b.source_note_id ? -1 : 1)
  ))
  return { linkResult: { results: linkRows }, tagResult: { results: tagRows }, truncated }
}

function collectGraphLinkRows(
  batchResults: Array<{ results?: Array<GraphLinkRow | GraphTagRow> }>,
  pageIds: Set<string>,
): { linkRows: GraphLinkRow[]; tagRows: GraphTagRow[]; truncated: boolean } {
  const linkRows: GraphLinkRow[] = []
  const tagRows: GraphTagRow[] = []
  let truncated = false
  for (let i = 0; i < batchResults.length; i += 2) {
    const linkResult = (batchResults[i]?.results ?? []) as GraphLinkRow[]
    const tagResult = (batchResults[i + 1]?.results ?? []) as GraphTagRow[]
    // A statement that came back holding its LIMIT's worth of rows was cut: more links exist for its
    // notes and were never read, so the page cannot promise that the edges it shows are all there is.
    if (linkResult.length > GRAPH_EDGE_CANDIDATE_LIMIT) truncated = true
    for (const row of linkResult) {
      // Unresolved links (no target note) stay in: they become nodes of their own when the caller
      // asked for them and are skipped otherwise. Everything else has to end inside the page.
      if (row.target_note_id === null || pageIds.has(row.target_note_id)) linkRows.push(row)
    }
    tagRows.push(...tagResult)
  }
  return { linkRows, tagRows, truncated }
}

function buildGraphEdges(
  linkRows: Array<{
    source_note_id: string
    target_note_id: string | null
    target_key: string
    target_title: string
  }>,
  includeUnresolved: boolean,
): {
  edges: GraphResponse['edges']
  unresolved: Map<string, { title: string; sources: Set<string> }>
  truncated: boolean
} {
  const edges: GraphResponse['edges'] = []
  const unresolved = new Map<string, { title: string; sources: Set<string> }>()
  let truncated = false
  if (linkRows.length > GRAPH_EDGE_CANDIDATE_LIMIT) truncated = true
  const seen = new Set<string>()
  for (const link of linkRows.slice(0, GRAPH_EDGE_CANDIDATE_LIMIT)) {
    if (link.target_note_id === null) {
      if (!includeUnresolved || (unresolved.size >= GRAPH_UNRESOLVED_MAX && !unresolved.has(link.target_key))) continue
      const current = unresolved.get(link.target_key) ?? {
        title: truncateText(wikiNoteTarget(link.target_title), LIMITS.titleMaxLength),
        sources: new Set<string>(),
      }
      current.sources.add(link.source_note_id)
      unresolved.set(link.target_key, current)
      continue
    }
    if (link.source_note_id === link.target_note_id) continue
    const key = `${link.source_note_id}>${link.target_note_id}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ source: link.source_note_id, target: link.target_note_id })
  }
  return { edges, unresolved, truncated }
}

function groupTagsByNote(
  tagResult: { results: Array<{ note_id: string; name: string; color: string | null }> },
): Map<string, Array<{ name: string; color: string | null }>> {
  const tagsByNote = new Map<string, Array<{ name: string; color: string | null }>>()
  for (const item of tagResult.results) {
    const values = tagsByNote.get(item.note_id) ?? []
    values.push({ name: item.name, color: item.color })
    tagsByNote.set(item.note_id, values)
  }
  return tagsByNote
}

function buildGraphBody(
  rows: GraphRow[],
  edges: GraphResponse['edges'],
  unresolved: Map<string, { title: string; sources: Set<string> }>,
  tagsByNote: Map<string, Array<{ name: string; color: string | null }>>,
  meta: {
    mode: 'local' | 'global'
    centerId: string | null
    depth: number
    totalNodes: number
    truncated: boolean
    limit: number
    showTagNodes: boolean
  },
): GraphResponse {
  const nodes: GraphResponse['nodes'] = graphNodes(rows, tagsByNote)
  applyUnresolvedNodes(nodes, edges, unresolved)
  const tagNodes = meta.showTagNodes ? applyTagNodes(nodes, edges, tagsByNote) : { added: 0, dropped: 0 }
  return {
    nodes,
    edges,
    meta: {
      mode: meta.mode,
      centerId: meta.centerId,
      depth: meta.depth,
      totalNodes: meta.totalNodes + unresolved.size + tagNodes.added + tagNodes.dropped,
      totalEdges: edges.length,
      truncated: meta.truncated || tagNodes.dropped > 0,
      limit: meta.limit,
    },
  }
}

function graphNodes(
  rows: GraphRow[],
  tagsByNote: Map<string, Array<{ name: string; color: string | null }>>,
): GraphResponse['nodes'] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: 'note',
    degree: Number(row.degree),
    inDegree: Number(row.in_degree),
    outDegree: Number(row.out_degree),
    folderId: row.folder_id,
    folderName: row.folder_name,
    folderColor: row.folder_color,
    tags: tagsByNote.get(row.id) ?? [],
  }))
}
