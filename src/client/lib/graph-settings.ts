import { LIMITS } from '@shared/constants'
import type { MessageKey } from '@shared/locales/en-US'

export type GroupBy = 'none' | 'folder' | 'tag'

export type GraphLinkDirection = 'both' | 'incoming' | 'outgoing'

/**
 * The three directions a local graph can walk, with the words each one is offered by. The drawer renders
 * this list and `loadPreferences` validates against it, so a choice the route does not know cannot be
 * stored (G-44).
 */
export const GRAPH_LINK_DIRECTIONS: ReadonlyArray<{ value: GraphLinkDirection, labelKey: MessageKey }> = [
  { value: 'both', labelKey: 'graph.direction_both' },
  { value: 'incoming', labelKey: 'graph.direction_incoming' },
  { value: 'outgoing', labelKey: 'graph.direction_outgoing' },
]

/** One colour rule: notes whose filter line matches are drawn in `color` whatever `groupBy` says. */
export interface GraphColorGroup {
  id: string
  query: string
  color: string
}

/** Each rule is a filter line the reader has to hold in mind, and the legend has room for a handful. */
export const GRAPH_COLOR_GROUP_LIMIT = 5

/** How many pins a page can carry: past a screenful the picture is no longer the reader's own. */
export const GRAPH_PINNED_MAX = 200

export interface GraphPreferences {
  mode: 'global' | 'local'
  depth: number
  /** How many nodes to ask the server for, inside the bounds it clamps to (G-21). */
  limit: number
  includeOrphans: boolean
  includeUnresolved: boolean
  /** Draw each tag as a node of its own, pulling notes that share it into one cluster. */
  showTagNodes: boolean
  /**
   * The nodes the reader pinned, by id: a pin is a decision about the picture, so it outlives the panel
   * that drew it (G-07 step 2). Ids only — a name would collide with a note renamed since.
   */
  pinnedNodeIds: string[]
  /**
   * Notes the reader took out of the graph. Ids, for the same reason as a pin: a title would follow a
   * rename and un-take a note the reader never put back (G-42).
   */
  excludedNoteIds: string[]
  /** Which side of a link the local graph walks around the note it is built on (G-44). */
  direction: GraphLinkDirection
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
  /** Leave the note titles out of the exported file: a pasted picture carries whatever the canvas shows (G-05). */
  exportWithoutTitles: boolean
  /** Export without a ground colour, so the picture sits on whatever surface it is pasted onto (G-45). */
  exportTransparentBackground: boolean
  repulsion: number
  linkDistance: number
  nodeScale: number
}

export type GraphTogglePref = { [K in keyof GraphPreferences]: GraphPreferences[K] extends boolean ? K : never }[keyof GraphPreferences]

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
  { prefKey: 'exportWithoutTitles', labelKey: 'graph.export_without_titles', hintKey: 'graph.export_without_titles_hint', default: false },
  { prefKey: 'exportTransparentBackground', labelKey: 'graph.export_transparent_background', hintKey: 'graph.export_transparent_background_hint', default: false },
]

/**
 * The boolean defaults, keyed by preference. `DEFAULT_PREFERENCES` spreads this rather than writing the
 * seven values out again, so the manifest is the only place a default is decided (G-36).
 */
export const GRAPH_TOGGLE_DEFAULTS = Object.fromEntries(
  GRAPH_SETTINGS_TOGGLES.map((control) => [control.prefKey, control.default]),
) as Record<GraphTogglePref, boolean>

export const GRAPH_CLEAR_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'clearResetsTag' || control.prefKey === 'clearClosesPanel')
export const GRAPH_SHOW_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'includeOrphans' || control.prefKey === 'includeUnresolved' || control.prefKey === 'showTagNodes')
export const GRAPH_APPEARANCE_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'arrows' || control.prefKey === 'labels')
export const GRAPH_EXPORT_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'exportWithoutTitles' || control.prefKey === 'exportTransparentBackground')

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