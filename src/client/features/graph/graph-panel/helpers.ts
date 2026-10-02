import type { GraphNode, GraphResponse } from '@shared/types'
import { LIMITS } from '@shared/constants'
import { organizerColorOrNull } from '@shared/organizer-colors'
import { truncateText } from '@shared/text-utils'
import { graphFilterMatches, parseGraphFilter } from '@shared/graph-filter-expression'
import { GRAPH_COLOR_GROUP_LIMIT, GRAPH_FORCE_RANGE, GRAPH_PINNED_MAX, type GraphColorGroup, type GraphPreferences, type GroupBy } from '../../../lib/graph-settings'
import { COLOR_GROUP_QUERY_MAX, DEFAULT_PREFERENCES, GRAPH_CAMERA_PADDING, GRAPH_LABEL_MAX, GRAPH_PREFS_KEY, GRAPH_TAG_PALETTE_SIZE } from './constants'
import type { CanvasNode, CanvasState } from './types'

/** A Crockford base-32 ULID, which is what this app hands out for note and folder ids. */
const GRAPH_NODE_ID = /^[0-9a-hjkmnp-tv-z]{26}$/

export function graphScaleAfterWheel(scale: number, deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return scale
  return Math.min(4, Math.max(0.2, scale * (deltaY > 0 ? 0.92 : 1.08)))
}

export type GraphArrowDirection = 'up' | 'down' | 'left' | 'right'

const ARROW_AXIS: Record<GraphArrowDirection, [number, number]> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
}

/**
 * The node an arrow key should land on: the one lying the way the key points, which is what a reader
 * means by "right" and what the response order cannot answer — that order is degree and time, not
 * place (G-23). A candidate in the arrow's half-plane is scored by its distance divided by how
 * squarely it sits on the axis, so a node straight ahead beats a nearer one off to the side; the
 * floor keeps a node barely past the axis from winning on distance alone. Returns -1 when nothing
 * lies that way, so the caller can leave the selection where it is.
 */
export function pickNeighborInDirection(nodes: readonly CanvasNode[], fromIndex: number, direction: GraphArrowDirection): number {
  const from = nodes[fromIndex]
  if (!from) return -1
  const [axisX, axisY] = ARROW_AXIS[direction]
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < nodes.length; index++) {
    if (index === fromIndex) continue
    const node = nodes[index]!
    const dx = node.x - from.x
    const dy = node.y - from.y
    const ahead = dx * axisX + dy * axisY
    if (ahead <= 0) continue
    const distance = Math.hypot(dx, dy)
    const score = distance / Math.max(0.25, ahead / distance)
    if (score < bestScore || (score === bestScore && distance < bestDistance)) {
      best = index
      bestScore = score
      bestDistance = distance
    }
  }
  return best
}

/**
 * Pans the camera just far enough to hold the node the keyboard reached, so an arrow key never moves
 * the selection off screen (G-23). Only the offset changes: the layout's own coordinates and the
 * zoom the reader chose are theirs. Before the canvas has been measured there is no viewport to
 * bring anything into, so the state is left alone.
 */
export function ensureNodeVisible(state: CanvasState, node: CanvasNode): void {
  if (!state.width || !state.height) return
  const margin = GRAPH_CAMERA_PADDING + node.r * state.scale
  const screenX = node.x * state.scale + state.offsetX
  const screenY = node.y * state.scale + state.offsetY
  if (screenX < margin) state.offsetX += margin - screenX
  else if (screenX > state.width - margin) state.offsetX -= screenX - (state.width - margin)
  if (screenY < margin) state.offsetY += margin - screenY
  else if (screenY > state.height - margin) state.offsetY -= screenY - (state.height - margin)
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
      depth: boundedPreference(stored.depth, DEFAULT_PREFERENCES.depth, LIMITS.graphDepthMin, LIMITS.graphDepthMax),
      limit: boundedPreference(stored.limit, DEFAULT_PREFERENCES.limit, LIMITS.graphNodeLimitMin, LIMITS.graphNodeLimitMax),
      includeOrphans: booleanPreference(stored.includeOrphans, DEFAULT_PREFERENCES.includeOrphans),
      includeUnresolved: booleanPreference(stored.includeUnresolved, DEFAULT_PREFERENCES.includeUnresolved),
      showTagNodes: booleanPreference(stored.showTagNodes, DEFAULT_PREFERENCES.showTagNodes),
      arrows: booleanPreference(stored.arrows, DEFAULT_PREFERENCES.arrows),
      labels: booleanPreference(stored.labels, DEFAULT_PREFERENCES.labels),
      groupBy: stored.groupBy === 'folder' || stored.groupBy === 'tag' ? stored.groupBy : 'none',
      colorGroups: colorGroupsPreference(stored.colorGroups),
      folderId: typeof stored.folderId === 'string' && GRAPH_NODE_ID.test(stored.folderId)
        ? stored.folderId
        : '',
      tag: typeof stored.tag === 'string' ? truncateText(stored.tag.trim(), 60) : '',
      tagsMatch: stored.tagsMatch === 'all' ? 'all' : 'any',
      pinnedNodeIds: idListPreference(stored.pinnedNodeIds, GRAPH_PINNED_MAX, true),
      excludedNoteIds: idListPreference(stored.excludedNoteIds, LIMITS.graphExcludedMax, false),
      exportWithoutTitles: booleanPreference(stored.exportWithoutTitles, DEFAULT_PREFERENCES.exportWithoutTitles),
      exportTransparentBackground: booleanPreference(stored.exportTransparentBackground, DEFAULT_PREFERENCES.exportTransparentBackground),
      clearResetsTag: booleanPreference(stored.clearResetsTag, DEFAULT_PREFERENCES.clearResetsTag),
      clearClosesPanel: booleanPreference(stored.clearClosesPanel, DEFAULT_PREFERENCES.clearClosesPanel),
      repulsion: boundedPreference(stored.repulsion, DEFAULT_PREFERENCES.repulsion, GRAPH_FORCE_RANGE.repulsion.min, GRAPH_FORCE_RANGE.repulsion.max),
      linkDistance: boundedPreference(stored.linkDistance, DEFAULT_PREFERENCES.linkDistance, GRAPH_FORCE_RANGE.linkDistance.min, GRAPH_FORCE_RANGE.linkDistance.max),
      nodeScale: boundedPreference(stored.nodeScale, DEFAULT_PREFERENCES.nodeScale, GRAPH_FORCE_RANGE.nodeScale.min, GRAPH_FORCE_RANGE.nodeScale.max),
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

/**
 * An id list a reader can hold as a preference. Only two things can name a node on the canvas: a note's
 * ULID or a tag's `tag:` key, and a list entry that is neither did not come from this app — it is dropped
 * rather than trusted, and the list is capped so a stored value cannot outgrow what the route accepts
 * (G-07, G-42).
 */
function idListPreference(value: unknown, max: number, allowTagKeys: boolean): string[] {
  const candidates = Array.isArray(value) ? value as unknown[] : []
  const ids: string[] = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    if (!GRAPH_NODE_ID.test(candidate) && !(allowTagKeys && candidate.startsWith('tag:'))) continue
    if (!ids.includes(candidate)) ids.push(candidate)
    if (ids.length >= max) break
  }
  return ids
}

/**
 * The list after the reader adds or removes one id. A fresh entry goes last so the stored order follows
 * the order the reader made them in, and removing one drops every copy rather than just the last.
 */
export function nextIdList(current: readonly string[], id: string, added: boolean): string[] {
  const others = current.filter((existing) => existing !== id)
  return added ? [...others, id] : others
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

/**
 * Which of the ten graph tag colours a name lands on. The slot is theme-independent, so a flip
 * changes the values behind the slots and never which tag wears which.
 */
export function tagHashIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % GRAPH_TAG_PALETTE_SIZE
}

/** The token a slot's colour lives in, so the DOM legend can name it and let the theme paint it. */
export function graphTagTokenName(index: number): string {
  return `--graph-tag-${index + 1}`
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

/** A tag with no colour of its own takes the slot's value from the palette the surface paints with. */
function tagFallbackColor(name: string, palette: readonly string[]): string {
  return palette[tagHashIndex(name)] ?? palette[0]!
}

function tagNodeColor(name: string, color: string | null, palette: readonly string[]): string {
  return organizerColorOrNull(color) ?? tagFallbackColor(name, palette)
}

/**
 * The rule each node is painted by, keyed by node id: the first rule whose filter line the note matches
 * wins, so the order the user set is the order of precedence. A rule with a blank filter line is skipped
 * rather than treated as a wildcard, or adding a row would repaint the whole graph before it is filled in.
 * Tag nodes keep their own colour: the one the tag manager assigned, or the graph's token for the
 * slot their name falls on.
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

export interface NodeColorOptions {
  groupBy: GroupBy
  /** What a node is painted when nothing else claims it, read from the theme. */
  fallback: string
  /** The ten tag colours of the theme on screen, in slot order. */
  tagPalette: readonly string[]
}

export function nodeColor(node: CanvasNode, { groupBy, fallback, tagPalette }: NodeColorOptions): string {
  if (node.colorGroup) return node.colorGroup
  if (node.kind === 'tag') return tagNodeColor(node.title, node.tagColor, tagPalette)
  if (groupBy === 'folder') return organizerColorOrNull(node.folderColor) ?? fallback
  if (groupBy === 'tag') {
    const firstTag = node.tags[0]
    if (!firstTag) return fallback
    return organizerColorOrNull(firstTag.color) ?? tagFallbackColor(firstTag.name, tagPalette)
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

/** A tag with no colour of its own is named by its token, so the legend follows the theme on its own. */
function tagLegendColor(name: string, color: string | null): string {
  return organizerColorOrNull(color) ?? `var(${graphTagTokenName(tagHashIndex(name))})`
}

/** A legend row names a colour and carries the filter line that selects exactly the nodes drawn in it. */
function extractNodeLegend(
  node: GraphResponse['nodes'][number],
  groupBy: GroupBy,
  tagColors: Map<string, string | null>,
): { label: string; color: string; query: string } | null {
  if (node.kind === 'tag') {
    return { label: node.title, color: tagLegendColor(node.title, tagColors.get(node.title.toLowerCase()) ?? null), query: `tag:${node.title}` }
  }
  if (groupBy === 'folder' && node.folderName) {
    const color = organizerColorOrNull(node.folderColor)
    return color ? { label: node.folderName, color, query: `path:${node.folderName}` } : null
  }
  if (groupBy === 'tag' && node.tags[0]) {
    const tag = node.tags[0]
    return { label: tag.name, color: tagLegendColor(tag.name, tag.color), query: `tag:${tag.name}` }
  }
  return null
}

export interface ColorLegendItem {
  label: string
  color: string
  /** The filter line this row stands for: a rule's own query, or the tag/folder term naming the group. */
  query: string
}

export function buildColorLegends(
  nodes: GraphResponse['nodes'],
  groupBy: GroupBy,
  colorGroups: readonly GraphColorGroup[] = [],
): ColorLegendItem[] {
  const ruleColors = colorGroupsByNodeId(nodes, colorGroups)
  if (groupBy === 'none' && !ruleColors.size && !nodes.some((node) => node.kind === 'tag')) return []
  const tagColors = tagColorsByName(nodes)
  const map = new Map<string, ColorLegendItem>()
  for (const entry of ruleColors.values()) {
    // A rule is labelled by its own filter line, so the row it draws can hand that line back.
    if (!map.has(entry.label)) map.set(entry.label, { label: entry.label, color: entry.color, query: entry.label })
  }
  for (const node of nodes) {
    const entry = extractNodeLegend(node, groupBy, tagColors)
    if (entry && !map.has(entry.label)) map.set(entry.label, entry)
  }
  return [...map.values()].slice(0, 10)
}

/**
 * The nodes the search box hit, worked out on the graph that is already on screen (G-14). The same filter
 * grammar the server runs decides the set, so the fading and the `tag:` / `path:` a reader writes mean one
 * thing. A tag node answers for its own name, since the notes filed under it are what it stands for.
 * Returns null for an empty line: with no search running, nothing on the canvas is asked to fade.
 */
export function graphSearchHits(nodes: readonly GraphNode[], query: string): Set<string> | null {
  const expression = parseGraphFilter(query)
  if (!expression.text && !expression.terms.length) return null
  const hits = new Set<string>()
  for (const node of nodes) {
    const tags = node.kind === 'tag' ? [{ name: node.title }] : node.tags
    if (graphFilterMatches({ title: node.title, folderName: node.folderName, tags }, expression)) hits.add(node.id)
  }
  return hits
}

export function graphNodeCounts(nodes: readonly GraphNode[]): { notes: number; tags: number; unresolved: number } {
  let notes = 0, tags = 0, unresolved = 0
  for (const node of nodes) {
    if (node.kind === 'tag') tags++
    else if (node.kind === 'unresolved') unresolved++
    else notes++
  }
  return { notes, tags, unresolved }
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

