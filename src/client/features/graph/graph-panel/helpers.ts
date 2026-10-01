import type { GraphNode, GraphResponse } from '@shared/types'
import { organizerColorOrNull } from '@shared/organizer-colors'
import { truncateText } from '@shared/text-utils'
import { graphFilterMatches, parseGraphFilter } from '@shared/graph-filter-expression'
import { GRAPH_COLOR_GROUP_LIMIT, type GraphColorGroup, type GraphPreferences, type GroupBy } from '../../../lib/graph-settings'
import { COLOR_GROUP_QUERY_MAX, DEFAULT_PREFERENCES, GRAPH_LABEL_MAX, GRAPH_PREFS_KEY } from './constants'
import type { CanvasNode } from './types'

export function graphScaleAfterWheel(scale: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return scale
  return Math.min(4, Math.max(0.2, scale * (deltaY > 0 ? 0.92 : 1.08)))
}

export function graphPrefsStorageKey(userId?: string | null): string {
  return userId ? `${GRAPH_PREFS_KEY}.${userId}` : GRAPH_PREFS_KEY
}

export function loadPreferences(userId?: string | null): GraphPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
  try {
    const key = graphPrefsStorageKey(userId)
    const raw = localStorage.getItem(key) ?? (userId ? localStorage.getItem(GRAPH_PREFS_KEY) : null)
    const stored = JSON.parse(raw ?? '{}') as Partial<GraphPreferences>
    return {
      mode: stored.mode === 'local' ? 'local' : 'global',
      depth: boundedPreference(stored.depth, DEFAULT_PREFERENCES.depth, 1, 3),
      includeOrphans: booleanPreference(stored.includeOrphans, DEFAULT_PREFERENCES.includeOrphans),
      includeUnresolved: booleanPreference(stored.includeUnresolved, DEFAULT_PREFERENCES.includeUnresolved),
      showTagNodes: booleanPreference(stored.showTagNodes, DEFAULT_PREFERENCES.showTagNodes),
      arrows: booleanPreference(stored.arrows, DEFAULT_PREFERENCES.arrows),
      labels: booleanPreference(stored.labels, DEFAULT_PREFERENCES.labels),
      groupBy: stored.groupBy === 'folder' || stored.groupBy === 'tag' ? stored.groupBy : 'none',
      colorGroups: colorGroupsPreference(stored.colorGroups),
      folderId: typeof stored.folderId === 'string' && /^[0-9a-hjkmnp-tv-z]{26}$/.test(stored.folderId)
        ? stored.folderId
        : '',
      tag: typeof stored.tag === 'string' ? truncateText(stored.tag.trim(), 60) : '',
      tagsMatch: stored.tagsMatch === 'all' ? 'all' : 'any',
      clearResetsTag: booleanPreference(stored.clearResetsTag, DEFAULT_PREFERENCES.clearResetsTag),
      clearClosesPanel: booleanPreference(stored.clearClosesPanel, DEFAULT_PREFERENCES.clearClosesPanel),
      repulsion: boundedPreference(stored.repulsion, DEFAULT_PREFERENCES.repulsion, 300, 1800),
      linkDistance: boundedPreference(stored.linkDistance, DEFAULT_PREFERENCES.linkDistance, 40, 150),
      nodeScale: boundedPreference(stored.nodeScale, DEFAULT_PREFERENCES.nodeScale, 0.7, 1.8),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function boundedPreference(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function booleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Anything can sit under this key in storage, so a rule survives only with a palette colour and a filter line. */
function colorGroupsPreference(value: unknown): GraphColorGroup[] {
  const candidates = Array.isArray(value) ? value as Array<Partial<GraphColorGroup>> : []
  const groups: GraphColorGroup[] = []
  for (const item of candidates) {
    const color = organizerColorOrNull(item.color)
    const query = typeof item.query === 'string' ? truncateText(item.query.trim(), COLOR_GROUP_QUERY_MAX) : ''
    if (color && query && typeof item.id === 'string') groups.push({ id: item.id, query, color })
    if (groups.length >= GRAPH_COLOR_GROUP_LIMIT) break
  }
  return groups
}

const TAG_FALLBACK_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
]

export function tagHashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % TAG_FALLBACK_PALETTE.length
  return TAG_FALLBACK_PALETTE[index]!
}

/**
 * The colour each tag carries, read off the notes that hold it: a tag node and the notes linked to it
 * arrive in the same response, so the palette never has to ask for the colour separately.
 */
export function tagColorsByName(nodes: GraphResponse['nodes']): Map<string, string | null> {
  const colors = new Map<string, string | null>()
  for (const node of nodes) {
    for (const tag of node.tags) {
      const key = tag.name.toLowerCase()
      const known = colors.get(key)
      if (known === undefined || (known === null && tag.color)) colors.set(key, tag.color)
    }
  }
  return colors
}

function tagNodeColor(name: string, color: string | null): string {
  return organizerColorOrNull(color) ?? tagHashColor(name)
}

/**
 * The rule each node is painted by, keyed by node id: the first rule whose filter line the note matches
 * wins, so the order the user set is the order of precedence. A rule with a blank filter line is skipped
 * rather than treated as a wildcard, or adding a row would repaint the whole graph before it is filled in.
 * Tag nodes keep their own palette: their colour is what a tag looks like everywhere else in the app.
 */
export function colorGroupsByNodeId(
  nodes: readonly GraphNode[],
  groups: readonly GraphColorGroup[],
): Map<string, { label: string; color: string }> {
  const rules = groups.flatMap((group) => {
    const color = organizerColorOrNull(group.color)
    const expression = parseGraphFilter(group.query)
    return color && (expression.text || expression.terms.length) ? [{ color, label: group.query, expression }] : []
  })
  const byId = new Map<string, { label: string; color: string }>()
  if (!rules.length) return byId
  for (const node of nodes) {
    if (node.kind === 'tag') continue
    const matched = rules.find((rule) => graphFilterMatches({
      title: node.title,
      folderName: node.folderName,
      tags: node.tags,
    }, rule.expression))
    if (matched) byId.set(node.id, { label: matched.label, color: matched.color })
  }
  return byId
}

export function nodeColor(node: CanvasNode, groupBy: GroupBy, fallback: string): string {
  if (node.colorGroup) return node.colorGroup
  if (node.kind === 'tag') return tagNodeColor(node.title, node.tagColor)
  if (groupBy === 'folder') return organizerColorOrNull(node.folderColor) ?? fallback
  if (groupBy === 'tag') {
    const firstTag = node.tags[0]
    if (!firstTag) return fallback
    return organizerColorOrNull(firstTag.color) ?? tagHashColor(firstTag.name)
  }
  return fallback
}

/** The words under a node: a tag carries its sigil, and every title is cut to the width that can be drawn. */
export function graphNodeLabel(node: CanvasNode): string {
  const text = node.kind === 'tag' ? `#${node.title}` : node.title
  return text.length > GRAPH_LABEL_MAX ? `${truncateText(text, GRAPH_LABEL_MAX)}…` : text
}

/** A node nobody links to is only worth a title once the graph is zoomed in far enough to read it. */
export function graphLabelVisible(node: CanvasNode, scale: number): boolean {
  return node.degree >= 1 || scale >= 1.1
}

function extractNodeLegend(
  node: GraphResponse['nodes'][number],
  groupBy: GroupBy,
  tagColors: Map<string, string | null>,
): { label: string; color: string } | null {
  if (node.kind === 'tag') {
    return { label: node.title, color: tagNodeColor(node.title, tagColors.get(node.title.toLowerCase()) ?? null) }
  }
  if (groupBy === 'folder' && node.folderName) {
    const color = organizerColorOrNull(node.folderColor)
    return color ? { label: node.folderName, color } : null
  }
  if (groupBy === 'tag' && node.tags[0]) {
    const tag = node.tags[0]
    return { label: tag.name, color: organizerColorOrNull(tag.color) ?? tagHashColor(tag.name) }
  }
  return null
}

export function buildColorLegends(
  nodes: GraphResponse['nodes'],
  groupBy: GroupBy,
  colorGroups: readonly GraphColorGroup[] = [],
): Array<{ label: string; color: string }> {
  const ruleColors = colorGroupsByNodeId(nodes, colorGroups)
  if (groupBy === 'none' && !ruleColors.size && !nodes.some((node) => node.kind === 'tag')) return []
  const tagColors = tagColorsByName(nodes)
  const map = new Map<string, string>()
  for (const entry of ruleColors.values()) {
    if (!map.has(entry.label)) map.set(entry.label, entry.color)
  }
  for (const node of nodes) {
    const entry = extractNodeLegend(node, groupBy, tagColors)
    if (entry && !map.has(entry.label)) map.set(entry.label, entry.color)
  }
  return [...map.entries()].slice(0, 10).map(([label, color]) => ({ label, color }))
}

/** Tag memberships are drawn like links but are not wiki links, so the stats line leaves them out. */
export function countWikiLinkEdges(data: GraphResponse): number {
  const tagIds = new Set(data.nodes.filter((node) => node.kind === 'tag').map((node) => node.id))
  if (!tagIds.size) return data.edges.length
  return data.edges.filter((edge) => !tagIds.has(edge.source) && !tagIds.has(edge.target)).length
}

export function normalizedResponse(response: GraphResponse): GraphResponse {
  const nodes = response.nodes.map((node) => ({
    ...node,
    kind: node.kind ?? 'note',
    inDegree: node.inDegree ?? 0,
    outDegree: node.outDegree ?? 0,
    folderId: node.folderId ?? null,
    folderName: node.folderName ?? null,
    folderColor: node.folderColor ?? null,
    tags: node.tags ?? [],
  }))
  return {
    nodes,
    edges: response.edges,
    meta: response.meta ?? {
      mode: 'global', centerId: null, depth: 1,
      totalNodes: nodes.length, totalEdges: response.edges.length,
      truncated: false, limit: nodes.length,
    },
  }
}

