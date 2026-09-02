import type { MessageKey } from '@shared/locales/en-US';

export type GroupBy = 'none' | 'folder' | 'tag';

export interface GraphPreferences {
  mode: 'global' | 'local'
  depth: number
  includeOrphans: boolean
  includeUnresolved: boolean
  arrows: boolean
  labels: boolean
  groupBy: GroupBy
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

type GraphTogglePref = { [K in keyof GraphPreferences]: GraphPreferences[K] extends boolean ? K : never }[keyof GraphPreferences];

export interface GraphToggleControl {
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
  { prefKey: 'arrows', labelKey: 'graph.show_arrows', default: true },
  { prefKey: 'labels', labelKey: 'graph.show_labels', default: true },
];

export const GRAPH_CLEAR_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'clearResetsTag' || control.prefKey === 'clearClosesPanel');
export const GRAPH_SHOW_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'includeOrphans' || control.prefKey === 'includeUnresolved');
export const GRAPH_APPEARANCE_TOGGLES = GRAPH_SETTINGS_TOGGLES.filter((control) => control.prefKey === 'arrows' || control.prefKey === 'labels');