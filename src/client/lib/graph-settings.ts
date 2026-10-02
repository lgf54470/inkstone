import { LIMITS } from '@shared/constants'
import type { MessageKey } from '@shared/locales/en-US'

export type GroupBy = 'none' | 'folder' | 'tag'

/** One colour rule: notes whose filter line matches are drawn in `color` whatever `groupBy` says. */
export interface GraphColorGroup {
  id: string
  query: string
  color: string
}

/** Each rule is a filter line the reader has to hold in mind, and the legend has room for a handful. */
export const GRAPH_COLOR_GROUP_LIMIT = 5

export interface GraphPreferences {
  mode: 'global' | 'local'
  depth: number
  /** How many nodes to ask the server for, inside the bounds it clamps to (G-21). */
  limit: number
  includeOrphans: boolean
  includeUnresolved: boolean
  /** Draw each tag as a node of its own, pulling notes that share it into one cluster. */
  showTagNodes: boolean
  arrows: boolean
  labels: boolean
  groupBy: GroupBy
  colorGroups: GraphColorGroup[]
  folderId: string
  tag: string
  /** How the tag filter combines: any tag (union) or all tags (intersection). */
  tagsMatch: 'any' | 'all'
  /** Whether clearing the sidebar selection also resets the graph's own tag filter. */
  clearResetsTag: boolean
  /** Whether clearing the sidebar selection also closes the graph panel. */
  clearClosesPanel: boolean
  repulsion: number
  linkDistance: number
  nodeScale: number
}

type GraphTogglePref = { [K in keyof GraphPreferences]: GraphPreferences[K] extends boolean ? K : never }[keyof GraphPreferences]

/** The link depths a graph can be asked for, in the order both depth controls list them (G-21). */
export const GRAPH_DEPTHS: number[] = Array.from(
  { length: LIMITS.graphDepthMax - LIMITS.graphDepthMin + 1 },
  (_unused, index) => LIMITS.graphDepthMin + index,
)


interface GraphToggleControl {
  prefKey: GraphTogglePref
  labelKey: MessageKey
  hintKey?: MessageKey
  default: boolean
}

/** The graph settings toggles: the single source of truth for the panel, docs, and tests. */
export const GRAPH_SETTINGS_TOGGLES: ReadonlyArray<GraphToggleControl> = [
  { prefKey: 'clearResetsTag', labelKey: 'graph.clear_resets_tag', hintKey: 'graph.clear_resets_tag_hint', default: true },
  { prefKey: 'clearClosesPanel', labelKey: 'graph.clear_closes_panel', hintKey: 'graph.clear_closes_panel_hint', default: true },
  { prefKey: 'includeOrphans', labelKey: 'graph.show_orphans', default: true },
  { prefKey: 'includeUnresolved', labelKey: 'graph.show_unresolved', default: true },
  { prefKey: 'showTagNodes', labelKey: 'graph.show_tags', default: false },
  { prefKey: 'arrows', labelKey: 'graph.show_arrows', default: true },
  { prefKey: 'labels', labelKey: 'graph.show_labels', default: true },
]

export const GRAPH_CLEAR_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'clearResetsTag' || control.prefKey === 'clearClosesPanel')
export const GRAPH_SHOW_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'includeOrphans' || control.prefKey === 'includeUnresolved' || control.prefKey === 'showTagNodes')
export const GRAPH_APPEARANCE_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'arrows' || control.prefKey === 'labels')

/**
 * The three force sliders: their bounds, their step and their default, in one table. The drawer draws
 * its sliders from this and `loadPreferences` clamps stored values with it, so a slider cannot offer a
 * number the reader's own stored preference would later refuse (G-32).
 */
export interface GraphRangeControl {
  prefKey: 'repulsion' | 'linkDistance' | 'nodeScale'
  labelKey: MessageKey
  min: number
  max: number
  step: number
  default: number
}

export const GRAPH_FORCE_RANGES: ReadonlyArray<GraphRangeControl> = [
  { prefKey: 'repulsion', labelKey: 'graph.repulsion', min: 300, max: 1800, step: 50, default: 900 },
  { prefKey: 'linkDistance', labelKey: 'graph.link_distance', min: 40, max: 150, step: 5, default: 76 },
  { prefKey: 'nodeScale', labelKey: 'graph.node_size', min: 0.7, max: 1.8, step: 0.1, default: 1 },
]

/** Looked up by preference key, which is how the panel and the storage reader share one row. */
export const GRAPH_FORCE_RANGE = Object.fromEntries(
  GRAPH_FORCE_RANGES.map((control) => [control.prefKey, control]),
) as Record<GraphRangeControl['prefKey'], GraphRangeControl>