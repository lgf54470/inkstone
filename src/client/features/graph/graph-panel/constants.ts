import type { GraphPreferences } from '../../../lib/graph-settings'

export const FALLBACK_EDGE_COLOR = 'rgba(127,127,127,.35)'
export const FALLBACK_NODE_COLOR = '#777'
export const FALLBACK_ACCENT_COLOR = '#4f46e5'
export const FALLBACK_TEXT_COLOR = '#555'

export const PHYSICS_FRAME_LIMIT = 360
export const GRAPH_PREFS_KEY = 'inkstone.graph.preferences.v1'

export const DEFAULT_PREFERENCES: GraphPreferences = {
  mode: 'global',
  depth: 1,
  includeOrphans: true,
  includeUnresolved: true,
  arrows: true,
  labels: true,
  groupBy: 'none',
  folderId: '',
  tag: '',
  tagsMatch: 'any',
  clearResetsTag: true,
  clearClosesPanel: true,
  repulsion: 900,
  linkDistance: 76,
  nodeScale: 1,
}
