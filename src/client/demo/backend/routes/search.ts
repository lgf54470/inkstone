import { Hono, type Context } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import { deriveExcerpt, extractWikiLinks, normalizeLinkKey, wikiNoteTarget } from '@shared/markdown-utils'
import type { GraphResponse, Note, SearchResponse } from '@shared/types'
import { applyTagNodes } from '@shared/graph-tag-nodes'
import { graphFilterMatches, parseGraphFilter, type GraphFilterExpression } from '@shared/graph-filter-expression'
import { folderPathsById } from '@shared/folder-path'
import { listFolders, summarize } from '../../state'

interface GraphLinkRecord {
  source: string
  target: string | null
  key: string
  title: string
}

function searchNotes(c: Context, state: DemoState): Response {
  const started = performance.now()
  const query = (c.req.query('q') ?? '').trim()
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit')) || 50))
  const needle = query.toLocaleLowerCase()
  const results = [...state.notes.values()]
    .filter((note) => note.deletedAt === null && `${note.title}\n${note.content}`.toLocaleLowerCase().includes(needle))
    .slice(0, limit)
    .map((note) => ({ note: summarize(note), snippet: deriveExcerpt(note.content, 140), score: 1 }))
  const response: SearchResponse = {
    results,
    mode: 'like',
    took: Math.max(0, performance.now() - started),
    query: { text: query, tags: [], folder: null, starred: null, archived: null },
  }
  return c.json(response)
}

function collectGraphRecords(state: DemoState): { active: Note[]; linkRecords: GraphLinkRecord[] } {
  const active = [...state.notes.values()]
    .filter((note) => note.deletedAt === null && !note.isArchived)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const byTitle = new Map<string, Note>()
  for (const note of active) {
    const key = normalizeLinkKey(note.title)
    if (!byTitle.has(key)) byTitle.set(key, note)
  }
  const linkRecords = active.flatMap((note) => extractWikiLinks(note.content).map((link) => ({
    source: note.id,
    target: byTitle.get(link.key)?.id ?? null,
    key: link.key,
    title: wikiNoteTarget(link.target),
  })))
  return { active, linkRecords }
}

function buildGraphEdges(linkRecords: GraphLinkRecord[]): {
  uniqueEdges: Array<{ source: string; target: string }>
  degree: Map<string, number>
  incoming: Map<string, number>
  outgoing: Map<string, number>
} {
  const allEdges = linkRecords
    .filter((link): link is typeof link & { target: string } => Boolean(link.target && link.target !== link.source))
    .map((link) => ({ source: link.source, target: link.target }))
  const uniqueEdges = [...new Map(allEdges.map((edge) => [`${edge.source}>${edge.target}`, edge])).values()]
  const degree = new Map<string, number>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const edge of uniqueEdges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  }
  return { uniqueEdges, degree, incoming, outgoing }
}

/** Which end of a link the walk may step to, in the demo backend as in the route (G-44). */
function neighborhoodEdges(direction: string): Array<'in' | 'out'> {
  return direction === 'incoming' ? ['in'] : direction === 'outgoing' ? ['out'] : ['in', 'out']
}

function localNeighborhood(
  centerId: string,
  depth: number,
  uniqueEdges: Array<{ source: string; target: string }>,
  direction: string,
): Set<string> {
  const sides = neighborhoodEdges(direction)
  const result = new Set([centerId])
  let frontier = new Set([centerId])
  for (let level = 0; level < depth; level++) {
    const next = new Set<string>()
    for (const edge of uniqueEdges) {
      if (sides.includes('out') && frontier.has(edge.source) && !result.has(edge.target)) next.add(edge.target)
      if (sides.includes('in') && frontier.has(edge.target) && !result.has(edge.source)) next.add(edge.source)
    }
    for (const id of next) result.add(id)
    frontier = next
  }
  return result
}

interface GraphNoteFilter {
  expression: GraphFilterExpression
  folderId: string
  tags: string[]
  tagsMatch: 'all' | 'any'
  includeOrphans: boolean
  excluded: Set<string>
  allowed: Set<string>
  degree: Map<string, number>
  folderPaths: Map<string, string>
}

function filterGraphNotes(active: Note[], options: GraphNoteFilter): Note[] {
  const { allowed, degree, excluded, folderId, folderPaths, includeOrphans, tags, tagsMatch, expression } = options
  return active.filter((note) => allowed.has(note.id) && !excluded.has(note.id)
    && graphFilterMatches({
      title: note.title,
      folderPath: note.folderId ? folderPaths.get(note.folderId) ?? null : null,
      tags: note.tags.map((name) => ({ name })),
    }, expression)
    && (!folderId || note.folderId === folderId)
    && (!tags.length || (tagsMatch === 'all'
      ? tags.every((name) => note.tags.some((item) => item.toLocaleLowerCase() === name))
      : tags.some((name) => note.tags.some((item) => item.toLocaleLowerCase() === name))))
    && (includeOrphans || (degree.get(note.id) ?? 0) > 0))
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || b.updatedAt - a.updatedAt)
}

function graphNoteFilter(
  c: Context,
  allowed: Set<string>,
  degree: Map<string, number>,
  folderPaths: Map<string, string>,
): GraphNoteFilter {
  const legacyTag = (c.req.query('tag') ?? '').trim().toLocaleLowerCase()
  const tags = [...new Set((c.req.query('tags') ?? '').split(',').map((item) => item.trim().toLocaleLowerCase()).filter(Boolean))]
  if (tags.length === 0 && legacyTag) tags.push(legacyTag)
  return {
    expression: parseGraphFilter(c.req.query('q') ?? ''),
    folderId: c.req.query('folderId') ?? '',
    tags,
    tagsMatch: c.req.query('tagsMatch') === 'all' ? 'all' : 'any',
    includeOrphans: c.req.query('includeOrphans') !== '0',
    excluded: new Set((c.req.query('excluded') ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    allowed,
    degree,
    folderPaths,
  }
}

function buildGraphNodes(
  state: DemoState,
  shown: Note[],
  degree: Map<string, number>,
  incoming: Map<string, number>,
  outgoing: Map<string, number>,
  folderPaths: Map<string, string>,
): GraphResponse['nodes'] {
  const folders = new Map(listFolders(state).map((folder) => [folder.id, folder]))
  return shown.map((note) => ({
    id: note.id,
    title: note.title,
    kind: 'note' as const,
    degree: degree.get(note.id) ?? 0,
    inDegree: incoming.get(note.id) ?? 0,
    outDegree: outgoing.get(note.id) ?? 0,
    folderId: note.folderId,
    folderPath: note.folderId ? folderPaths.get(note.folderId) ?? null : null,
    folderColor: note.folderId ? folders.get(note.folderId)?.color ?? null : null,
    tags: note.tags.map((name) => ({ name, color: state.tagColors.get(name) ?? null })),
  }))
}

function collectUnresolvedLinks(
  linkRecords: GraphLinkRecord[],
  shownIds: Set<string>,
  nodes: GraphResponse['nodes'],
  edges: Array<{ source: string; target: string }>,
): number {
  const unresolved = new Map<string, { title: string; sources: Set<string> }>()
  for (const link of linkRecords) {
    if (link.target !== null || !shownIds.has(link.source)) continue
    if (unresolved.size >= 50 && !unresolved.has(link.key)) continue
    const missing = unresolved.get(link.key) ?? { title: link.title, sources: new Set<string>() }
    missing.sources.add(link.source)
    unresolved.set(link.key, missing)
  }
  for (const [key, missing] of unresolved) {
    const id = `unresolved:${key}`
    nodes.push({ id, title: missing.title, kind: 'unresolved', degree: missing.sources.size,
      inDegree: missing.sources.size, outDegree: 0, folderId: null, folderPath: null,
      folderColor: null, tags: [] })
    for (const source of missing.sources) edges.push({ source, target: id })
  }
  return unresolved.size
}

function graphResponse(c: Context, state: DemoState): Response {
  const mode = c.req.query('mode') === 'local' ? 'local' : 'global'
  const centerId = c.req.query('center') || null
  // The same bounds the worker clamps to and the settings offer, so the demo cannot answer a request the
  // real app would refuse (G-21).
  const depth = Math.max(LIMITS.graphDepthMin, Math.min(LIMITS.graphDepthMax, Number(c.req.query('depth')) || LIMITS.graphDepthDefault))
  const limit = Math.max(LIMITS.graphNodeLimitMin, Math.min(LIMITS.graphNodeLimitMax, Number(c.req.query('limit')) || LIMITS.graphNodeLimitDefault))
  const includeUnresolved = c.req.query('includeUnresolved') === '1'
  const showTagNodes = c.req.query('tagNodes') === '1'

  const { active, linkRecords } = collectGraphRecords(state)
  const { uniqueEdges, degree, incoming, outgoing } = buildGraphEdges(linkRecords)
  let allowed = new Set(active.map((note) => note.id))
  if (mode === 'local' && centerId) {
    allowed = localNeighborhood(centerId, depth, uniqueEdges, c.req.query('direction') ?? 'both')
  }
  const folderPaths = folderPathsById(listFolders(state))
  const filtered = filterGraphNotes(active, graphNoteFilter(c, allowed, degree, folderPaths))
  const shown = filtered.slice(0, limit)
  const shownIds = new Set(shown.map((note) => note.id))
  const edges = uniqueEdges.filter((edge) => shownIds.has(edge.source) && shownIds.has(edge.target))
  const nodes = buildGraphNodes(state, shown, degree, incoming, outgoing, folderPaths)
  const unresolvedCount = includeUnresolved
    ? collectUnresolvedLinks(linkRecords, shownIds, nodes, edges)
    : 0
  const tagNodes = showTagNodes
    ? applyTagNodes(nodes, edges, new Map(shown.map((note) => [note.id, note.tags.map((name) => ({ name }))])))
    : { added: 0, dropped: 0 }
  return c.json({
    nodes,
    edges,
    meta: {
      mode,
      centerId: mode === 'local' ? centerId : null,
      depth,
      totalNodes: filtered.length + unresolvedCount + tagNodes.added + tagNodes.dropped,
      totalEdges: edges.length,
      truncated: filtered.length > limit || tagNodes.dropped > 0,
      limit,
    },
  })
}

export function registerSearchRoutes(app: Hono, state: DemoState): void {
  app.get('/api/search', (c) => searchNotes(c, state))
  app.post('/api/search/reindex', (c) => c.json({ ok: true as const, indexed: state.notes.size }))
  app.get('/api/graph', (c) => graphResponse(c, state))
}