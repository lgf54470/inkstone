import type { AccentName, BackgroundName, DateRangeFilter, EditorLayout, RelativeFilter, SortKey, SortOrder, ThemePref, UiDensity, ViewKind } from '@shared/types';



export type PanelName =
  | 'command'
  | 'search'
  | 'settings'
  | 'shortcuts'
  | 'graph'
  | 'versions'
  | 'share'
  | 'share-hub'
  | 'blog-hub'
  | 'blog-publish'
  | 'templates'
  | 'info'
  | 'folders'
  | 'tags'



export type WorkspacePane = 'primary' | 'secondary'



export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'danger' | 'warning'
  /** Marks an undo toast: accent icon/tint in the UI and a short vibration cue. */
  kind?: 'undo'
  action?: { label: string; run: () => void }
  duration: number
}



export interface UiState {

  navWidth: number
  listWidth: number
  navCollapsed: boolean
  listCollapsed: boolean

  navDrawerOpen: boolean
  splitRatio: number | null
  workspaceSplitRatio: number | null
  workspacePrimaryNoteId: string | null
  workspaceSecondaryNoteId: string | null
  activeWorkspacePane: WorkspacePane
  workspacePaneLayouts: Record<WorkspacePane, EditorLayout>
  mobilePane: 'nav' | 'list' | 'editor' | 'preview'


  view: ViewKind
  folderId: string | null
  tag: string | null
  sort: SortKey
  order: SortOrder
  density: UiDensity
  expandedFolders: string[]


  activeNoteId: string | null
  selectedIds: string[]
  selectedTags: string[]
  /** How multi-selected tags filter the note list and palette: any or all. */
  selectedTagsMatch: 'any' | 'all'
  /** Inclusive date range (YYYY-MM-DD keys) the note list is filtered to, set from the sidebar calendar. */
  dateFilter: DateRangeFilter | null
  /** When set, `dateFilter` is the live-materialized window of this rolling filter. */
  relativeFilter: RelativeFilter | null
  /** Unified note-list search query; part of the persisted filter combo cleared by `clearAllFilters`. */
  listQuery: string
  /** Sort the user left behind when entering a calendar folder view, restored on exit. */
  calendarSortOverride: { sort: SortKey; order: SortOrder } | null
  /** External jump request for the sidebar heatmap calendar (from the settings preview); consumed by SidebarCalendar. */
  calendarJump: { year: number; month: number; nonce: number } | null
  recentNoteIds: string[]


  panel: PanelName | null
  outlineOpen: boolean
  backlinksOpen: boolean
  toasts: ToastItem[]
  lightbox: { src: string; alt: string } | null


  theme: ThemePref
  accent: AccentName
  background: BackgroundName
  fontScale: number


  setLayout: (patch: Partial<Pick<UiState, 'navWidth' | 'listWidth' | 'splitRatio' | 'workspaceSplitRatio'>>) => void
  setWorkspacePaneLayout: (pane: WorkspacePane, layout: EditorLayout) => void
  setWorkspaceNote: (pane: WorkspacePane, id: string | null, activate?: boolean) => void
  activateWorkspacePane: (pane: WorkspacePane) => void
  closeSecondaryNote: () => void
  removeWorkspaceNote: (id: string) => void
  toggleNav: () => void
  toggleNavDrawer: (open?: boolean) => void
  toggleList: () => void
  setMobilePane: (pane: UiState['mobilePane']) => void
  openView: (view: ViewKind, options?: { folderId?: string | null; tag?: string | null }) => void
  toggleTagSelection: (tag: string) => void
  selectTags: (tags: string[]) => void
  clearTagSelection: () => void
  setSelectedTagsMatch: (match: 'any' | 'all') => void
  setDateFilter: (value: DateRangeFilter | null) => void
  setRelativeFilter: (value: RelativeFilter | null) => void
  setListQuery: (query: string) => void
  /** Clears the full filter combo (query, date/relative, tags) with an undo toast restoring the exact previous combination. */
  clearAllFilters: () => void
  requestCalendarJump: (year: number, month: number) => void
  setSort: (sort: SortKey, order?: SortOrder) => void
  setDensity: (density: UiDensity) => void
  toggleFolder: (id: string) => void
  expandFolder: (id: string) => void
  setActiveNote: (id: string | null) => void
  setSelected: (ids: string[]) => void
  toggleSelected: (id: string, additive: boolean) => void
  openPanel: (panel: PanelName) => void
  closePanel: () => void
  togglePanel: (panel: PanelName) => void
  toggleOutline: () => void
  toggleBacklinks: () => void
  setLightbox: (value: UiState['lightbox']) => void
  toast: (input: Omit<ToastItem, 'id' | 'duration' | 'tone'> & { tone?: ToastItem['tone']; duration?: number }) => string
  dismissToast: (id: string) => void
  applyAppearance: (patch: { theme?: ThemePref; accent?: AccentName; background?: BackgroundName; fontScale?: number }) => void
}
