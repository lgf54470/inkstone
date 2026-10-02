import type { GraphPreferences } from '../../../lib/graph-settings'

export const FALLBACK_EDGE_COLOR = 'rgba(127,127,127,.35)'
export const FALLBACK_NODE_COLOR = '#777'
export const FALLBACK_ACCENT_COLOR = '#4f46e5'
export const FALLBACK_TEXT_COLOR = '#555'
export const FALLBACK_BG_COLOR = '#18181b'

export const PHYSICS_FRAME_LIMIT = 360
export const GRAPH_SETTLE_FRAME = 70
export const GRAPH_PREFS_KEY = 'inkstone.graph.preferences.v1'
export const COLOR_GROUP_QUERY_MAX = 120

/** Ten slots for tag colours, the width of the --graph-tag-* token block. */
export const GRAPH_TAG_PALETTE_SIZE = 10

/** A title is cut to this many characters, however it is drawn. */
export const GRAPH_LABEL_MAX = 18
export const GRAPH_LABEL_FONT_SIZE = 11
/** How much of the viewport an arrow-keyed node keeps around itself when the camera follows it. */
export const GRAPH_CAMERA_PADDING = 24

/** How far a pointer may travel before a press stops counting as a click and becomes a drag. The same line
 * decides that letting go opens nothing and that the node has left the place its preview card hangs
 * from, so the two can never disagree about where the click ends (G-16). */
export const GRAPH_CLICK_TRAVEL_MAX = 4

export const GRAPH_LABEL_OFFSET = 12
export const GRAPH_LABEL_HALO = 3
export const GRAPH_EDGE_ALPHA = 0.42
export const GRAPH_LABEL_ALPHA = 0.72
export const GRAPH_PIN_ALPHA = 0.8
/** A search that locates its matches leaves the rest of the graph on screen: lighter than the hover
 * focus, which hides the whole field, because these nodes are the context the match sits in (G-14). */
export const GRAPH_SEARCH_DIM_ALPHA = 0.22
export const GRAPH_SEARCH_DIM_EDGE_ALPHA = 0.12
export const GRAPH_ARROW_SIZE = 5
export const GRAPH_TAG_RING_GAP = 2
export const GRAPH_TAG_RING_WIDTH = 1.5
export const FALLBACK_FONT_FAMILY = 'sans-serif'

export const DEFAULT_PREFERENCES: GraphPreferences = {
  mode: 'global',
  depth: 1,
  includeOrphans: true,
  includeUnresolved: true,
  showTagNodes: false,
  arrows: true,
  labels: true,
  groupBy: 'none',
  colorGroups: [],
  folderId: '',
  tag: '',
  tagsMatch: 'any',
  clearResetsTag: true,
  clearClosesPanel: true,
  repulsion: 900,
  linkDistance: 76,
  nodeScale: 1,
}
