import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import { wikiNoteTarget } from '@shared/markdown-utils'
import type { GraphResponse } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidId } from '../../lib/id'
import { clampInt } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { GRAPH_EDGE_CANDIDATE_LIMIT } from './helpers'
import { escapeLike } from './helpers'

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

const degreeSelect = `
  (SELECT COUNT(*) FROM links ld WHERE ld.user_id = ? AND ld.target_note_id IS NOT NULL
    AND (ld.source_note_id = n.id OR ld.target_note_id = n.id)) AS degree,
  (SELECT COUNT(*) FROM links li WHERE li.user_id = ? AND li.target_note_id = n.id) AS in_degree,
  (SELECT COUNT(*) FROM links lo WHERE lo.user_id = ? AND lo.source_note_id = n.id
    AND lo.target_note_id IS NOT NULL) AS out_degree`

export function registerSearchGraphRoutes(searchRoutes: Hono<AppBindings>): void {
  searchRoutes.get('/graph', requireAuth, graphHandler)
}

async function graphHandler(c: Context<AppBindings>): Promise<Response> {
  const params = parseGraphParams(c)
  const { filters, filterBinds } = buildGraphFilters(params)
  const { rows, totalNodes } = params.mode === 'local'
    ? await runLocalGraphQuery(c.env.DB, params, filters, filterBinds)
    : await runGlobalGraphQuery(c.env.DB, params, filters, filterBinds)
  const noteLimit = params.includeUnresolved ? Math.max(1, params.limit - 50) : params.limit
  let truncated = rows.length > noteLimit || totalNodes > noteLimit
  const pageRows = rows.slice(0, noteLimit)
  const graph = await loadGraphEdgesAndTags(c.env.DB, params.userId, pageRows, params.includeUnresolved)
  if (graph.truncated) truncated = true
  if (graph.unresolved.size >= 50) truncated = true
  const body = buildGraphBody(pageRows, graph.edges, graph.unresolved, graph.tagsByNote, {
    mode: params.mode,
    centerId: params.mode === 'local' ? params.centerId : null,
    depth: params.depth,
    totalNodes,
    truncated,
    limit: params.limit,
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
    depth: clampInt(c.req.query('depth'), 1, 3, 1),
    limit: clampInt(c.req.query('limit'), 50, 600, 350),
    query: (c.req.query('q') ?? '').trim(),
    folderId: rawFolderId && isValidId(rawFolderId) ? rawFolderId : '',
    tags,
    tagsMatch: c.req.query('tagsMatch') === 'all' ? 'all' : 'any',
    includeOrphans: c.req.query('includeOrphans') !== '0',
    includeUnresolved: c.req.query('includeUnresolved') === '1',
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
  if (params.query.length > 200) {
    throw new ApiError(400, 'bad_request', 'The graph search query cannot exceed 200 characters')
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
  if (params.query) {
    filters.push(`n.title LIKE ? ESCAPE '\\' COLLATE NOCASE`)
    filterBinds.push(`%${escapeLike(params.query)}%`)
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
          WHERE nt_filter.note_id = n.id AND t_filter.name = ?${filterBinds.length + 1} COLLATE NOCASE
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

async function runLocalGraphQuery(
  db: D1Database,
  params: GraphParams,
  filters: string[],
  filterBinds: unknown[],
): Promise<{ rows: GraphRow[]; totalNodes: number }> {
  const neighborhood = `WITH RECURSIVE neighborhood(id, depth) AS (
    SELECT ? AS id, 0 AS depth
    UNION
    SELECT CASE WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END,
      neighborhood.depth + 1
    FROM neighborhood
    JOIN links l ON l.user_id = ? AND l.target_note_id IS NOT NULL
      AND (l.source_note_id = neighborhood.id OR l.target_note_id = neighborhood.id)
    JOIN notes adjacent ON adjacent.id = CASE
      WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END
      AND adjacent.user_id = l.user_id AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0
    WHERE neighborhood.depth < ?
  ), nearby AS (SELECT id, MIN(depth) AS depth FROM neighborhood GROUP BY id)`
  const prefixBinds = [params.centerId, params.userId, params.depth]
  const result = await db.prepare(
    `${neighborhood}
     SELECT n.id, n.title, n.folder_id, f.name AS folder_name, f.color AS folder_color,
       ${degreeSelect}, nearby.depth
     FROM nearby JOIN notes n ON n.id = nearby.id
     LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY nearby.depth ASC, degree DESC, n.updated_at DESC, n.id ASC LIMIT ?`,
  ).bind(...prefixBinds, params.userId, params.userId, params.userId, ...filterBinds, params.limit + 1).all<GraphRow>()
  const count = await db.prepare(
    `${neighborhood} SELECT COUNT(*) AS count FROM nearby JOIN notes n ON n.id = nearby.id
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
       ${degreeSelect}
     FROM notes n LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY degree DESC, n.updated_at DESC, n.id ASC LIMIT ?`,
  ).bind(params.userId, params.userId, params.userId, ...filterBinds, params.limit + 1).all<GraphRow>()
  const count = await db.prepare(
    `SELECT COUNT(*) AS count FROM notes n WHERE ${filters.join(' AND ')}`,
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
  const { linkResult, tagResult } = await loadGraphLinkRows(db, userId, ids, includeUnresolved)
  const { edges, unresolved, truncated } = buildGraphEdges(linkResult.results, includeUnresolved)
  return { edges, unresolved, tagsByNote: groupTagsByNote(tagResult), truncated }
}

async function loadGraphLinkRows(
  db: D1Database,
  userId: string,
  ids: string[],
  includeUnresolved: boolean,
): Promise<{
  linkResult: { results: Array<{
    source_note_id: string
    target_note_id: string | null
    target_key: string
    target_title: string
  }> }
  tagResult: { results: Array<{ note_id: string; name: string; color: string | null }> }
}> {
  const placeholders = ids.map(() => '?').join(',')
  const [linkResult, tagResult] = await Promise.all([
    db.prepare(
      `SELECT source_note_id, target_note_id, target_key, target_title FROM links
       WHERE user_id = ? AND source_note_id IN (${placeholders})
         AND (target_note_id IN (${placeholders})${includeUnresolved ? ' OR target_note_id IS NULL' : ''})
       ORDER BY source_note_id ASC, target_key ASC LIMIT ?`,
    ).bind(userId, ...ids, ...ids, GRAPH_EDGE_CANDIDATE_LIMIT + 1).all<{
      source_note_id: string
      target_note_id: string | null
      target_key: string
      target_title: string
    }>(),
    db.prepare(
      `SELECT nt.note_id, t.name, t.color FROM note_tags nt
       JOIN tags t ON t.id = nt.tag_id AND t.user_id = ?
       WHERE nt.note_id IN (${placeholders}) ORDER BY t.name COLLATE NOCASE ASC`,
    ).bind(userId, ...ids).all<{ note_id: string; name: string; color: string | null }>(),
  ])
  return { linkResult, tagResult }
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
      if (!includeUnresolved || unresolved.size >= 50 && !unresolved.has(link.target_key)) continue
      const current = unresolved.get(link.target_key) ?? {
        title: wikiNoteTarget(link.target_title),
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
  },
): GraphResponse {
  const nodes: GraphResponse['nodes'] = graphNodes(rows, tagsByNote)
  applyUnresolved(nodes, edges, unresolved)
  return {
    nodes,
    edges,
    meta: {
      mode: meta.mode,
      centerId: meta.centerId,
      depth: meta.depth,
      totalNodes: meta.totalNodes + unresolved.size,
      totalEdges: edges.length,
      truncated: meta.truncated,
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

function applyUnresolved(
  nodes: GraphResponse['nodes'],
  edges: GraphResponse['edges'],
  unresolved: Map<string, { title: string; sources: Set<string> }>,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  for (const [key, missing] of unresolved) {
    const id = `unresolved:${key}`
    nodes.push({
      id,
      title: missing.title,
      kind: 'unresolved',
      degree: missing.sources.size,
      inDegree: missing.sources.size,
      outDegree: 0,
      folderId: null,
      folderName: null,
      folderColor: null,
      tags: [],
    })
    for (const source of missing.sources) {
      edges.push({ source, target: id })
      const sourceNode = nodeById.get(source)
      if (sourceNode) {
        sourceNode.degree++
        sourceNode.outDegree++
      }
    }
  }
}