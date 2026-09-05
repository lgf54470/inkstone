import { create } from 'zustand';
import type { AccentName, BackgroundName, ThemePref } from '@shared/types';
import { LIMITS } from '@shared/constants';
import { isVirtualFolderId } from '../../lib/calendar-tree';
import { t } from '../../lib/i18n';
import { DEFAULTS, loadPersisted, activatedNoteFields, persist, primePersistCache } from './state';
import type { ToastItem, UiState } from './types';
import { applyThemeToDom } from './theme';



export let toastSeq = 0

export const useUi = create<UiState>((set, get) => ({

  ...DEFAULTS,

  selectedIds: [],

  navDrawerOpen: false,

  panel: null,

  outlineOpen: false,

  backlinksOpen: false,

  toasts: [],

  lightbox: null,

  mobilePane: 'list',

  ...loadPersisted(),


  setLayout: (patch) => set(patch),

  setWorkspacePaneLayout: (pane, layout) => set((state) => ({
    workspacePaneLayouts: { ...state.workspacePaneLayouts, [pane]: layout },
  })),

  setWorkspaceNote: (pane, id, activate = true) => set((state) => {
    if (pane === 'secondary') {
      if (!id) {
        const primaryId = state.workspacePrimaryNoteId ??
          (state.activeWorkspacePane === 'primary' ? state.activeNoteId : null)
        return {
          workspacePrimaryNoteId: null,
          workspaceSecondaryNoteId: null,
          ...activatedNoteFields(state, primaryId, 'primary'),
        }
      }
      const primaryId = state.workspaceSecondaryNoteId
        ? state.workspacePrimaryNoteId
        : state.activeNoteId
      return {
        workspacePrimaryNoteId: primaryId,
        workspaceSecondaryNoteId: id,
        outlineOpen: false,
        ...(activate ? activatedNoteFields(state, id, 'secondary') : {}),
      }
    }

    if (!id && state.workspaceSecondaryNoteId) {
      return {
        workspacePrimaryNoteId: null,
        workspaceSecondaryNoteId: null,
        ...activatedNoteFields(state, state.workspaceSecondaryNoteId, 'primary'),
      }
    }
    if (state.workspaceSecondaryNoteId) {
      return {
        workspacePrimaryNoteId: id,
        ...(activate ? activatedNoteFields(state, id, 'primary') : {}),
      }
    }
    return activatedNoteFields(state, id, 'primary')
  }),

  activateWorkspacePane: (pane) => set((state) => {
    const targetId = pane === 'secondary'
      ? state.workspaceSecondaryNoteId
      : state.workspaceSecondaryNoteId
        ? state.workspacePrimaryNoteId
        : state.activeNoteId
    if (!targetId) return state
    return {
      ...activatedNoteFields(state, targetId, pane),
      outlineOpen: false,
    }
  }),

  closeSecondaryNote: () => set((state) => {
    if (!state.workspaceSecondaryNoteId) return state
    const primaryId = state.workspacePrimaryNoteId ??
      (state.activeWorkspacePane === 'primary' ? state.activeNoteId : null)
    return {
      workspacePrimaryNoteId: null,
      workspaceSecondaryNoteId: null,
      ...activatedNoteFields(state, primaryId, 'primary'),
    }
  }),

  removeWorkspaceNote: (id) => set((state) => {
    const primaryId = state.workspacePrimaryNoteId
    const secondaryId = state.workspaceSecondaryNoteId
    if (primaryId === id && secondaryId === id) {
      return {
        workspacePrimaryNoteId: null,
        workspaceSecondaryNoteId: null,
        ...activatedNoteFields(state, null, 'primary'),
      }
    }
    if (primaryId === id && secondaryId) {
      return {
        workspacePrimaryNoteId: null,
        workspaceSecondaryNoteId: null,
        ...activatedNoteFields(state, secondaryId, 'primary'),
      }
    }
    if (secondaryId === id) {
      const remainingId = primaryId ?? (state.activeWorkspacePane === 'primary' ? state.activeNoteId : null)
      return {
        workspacePrimaryNoteId: null,
        workspaceSecondaryNoteId: null,
        ...activatedNoteFields(state, remainingId, 'primary'),
      }
    }
    if (!secondaryId && state.activeNoteId === id) {
      return activatedNoteFields(state, null, 'primary')
    }
    return state
  }),

  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),

  toggleNavDrawer: (open) => set((s) => ({ navDrawerOpen: open ?? !s.navDrawerOpen })),

  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),

  setMobilePane: (mobilePane) => set({ mobilePane }),


  openView: (view, options) =>
    set((s) => {
      const folderId = options?.folderId ?? null
      const enteringCalendar = view === 'folder' && isVirtualFolderId(folderId)
      return {
        view,
        folderId,
        tag: options?.tag ?? null,
        selectedIds: [],
        dateFilter: null,
        // Keep the multi-select when entering a folder view so it stacks with
        // the folder filter; any other navigation clears the selection.
        selectedTags: view === 'folder' ? s.selectedTags : [],
        mobilePane: 'list',
        navDrawerOpen: false,
        ...(enteringCalendar
            ? {
                calendarSortOverride: s.calendarSortOverride ?? { sort: s.sort, order: s.order },
                sort: 'created',
                order: 'desc',
            }
            : s.calendarSortOverride
                ? {
                    calendarSortOverride: null,
                    sort: s.calendarSortOverride.sort,
                    order: s.calendarSortOverride.order,
                }
                : {}),
      }
    }),


  toggleTagSelection: (tag) =>
    set((s) => {
      if (s.selectedTags.includes(tag))
        return { selectedTags: s.selectedTags.filter((item) => item !== tag) };
      if (s.selectedTags.length >= LIMITS.tagSelectionMax)
        return s;
      return { selectedTags: [...s.selectedTags, tag] };
    }),


  clearTagSelection: () => set({ selectedTags: [] }),


  selectTags: (tags) =>
    set((s) => ({
      selectedTags: [...new Set([...s.selectedTags, ...tags])].slice(0, LIMITS.tagSelectionMax),
    })),


  setSelectedTagsMatch: (match) => set({ selectedTagsMatch: match }),


  setDateFilter: (value) => set({ dateFilter: value }),

  setRelativeFilter: (value) => set({ relativeFilter: value }),

  setListQuery: (query) => set({ listQuery: query }),


  clearAllFilters: () => {
    const state = get()
    const snapshot = {
      listQuery: state.listQuery,
      dateFilter: state.dateFilter,
      relativeFilter: state.relativeFilter,
      selectedTags: state.selectedTags,
      selectedTagsMatch: state.selectedTagsMatch,
    }
    set({ listQuery: '', dateFilter: null, relativeFilter: null, selectedTags: [], selectedTagsMatch: 'any' })
    toastWithUndo(t('notes.filters_cleared'), () => set(snapshot))
  },


  requestCalendarJump: (year, month) => set((s) => ({
    calendarJump: { year, month, nonce: (s.calendarJump?.nonce ?? 0) + 1 },
  })),


  setSort: (sort, order) => set((s) => ({ sort, order: order ?? s.order })),

  setDensity: (density) => set({ density }),


  toggleFolder: (id) =>
    set((s) => ({
      expandedFolders: s.expandedFolders.includes(id)
        ? s.expandedFolders.filter((f) => f !== id)
        : [...s.expandedFolders, id],
    })),


  expandFolder: (id) =>
    set((s) =>
      s.expandedFolders.includes(id) ? s : { expandedFolders: [...s.expandedFolders, id] },
    ),


  setActiveNote: (id) => {
    const state = get()
    const pane = state.workspaceSecondaryNoteId ? state.activeWorkspacePane : 'primary'
    state.setWorkspaceNote(pane, id)
  },


  setSelected: (ids) => set({ selectedIds: ids }),


  toggleSelected: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedIds: [id] }
      return {
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      }
    }),


  openPanel: (panel) => set({ panel }),

  closePanel: () => set({ panel: null }),

  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),

  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),

  toggleBacklinks: () => set((s) => ({ backlinksOpen: !s.backlinksOpen })),

  setLightbox: (lightbox) => set({ lightbox }),


  toast: (input) => {
    const id = `t${++toastSeq}`
    const item: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      tone: input.tone ?? 'default',
      kind: input.kind,
      action: input.action,
      duration: input.duration ?? (input.tone === 'danger' ? 6000 : 3800),
    }
    if (item.kind === 'undo' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
      navigator.vibrate(10)
    set((s) => ({ toasts: [...s.toasts.slice(-4), item] }))
    return id
  },


  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),


  applyAppearance: (patch) => {
    const current = get()
    const next: Record<string, ThemePref | AccentName | BackgroundName | number> = {}
    let hasChanged = false
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      const value = patch[key]
      if (value === undefined || value === current[key]) continue
      next[key] = value
      hasChanged = true
    }
    if (!hasChanged) return
    set(next as unknown as typeof patch)
    applyThemeToDom(get())
  }
}));

primePersistCache(useUi.getState())
useUi.subscribe(persist)



/**
 * Post a toast carrying a one-click undo action; the single helper behind every store-level undo flow.
 * `duration` overrides the default window (dangerous actions pass a longer one via their caller).
 */
export function toastWithUndo(title: string, undo: () => void, options?: { duration?: number }): void {
  const input: Parameters<UiState['toast']>[0] = {
    title,
    kind: 'undo',
    action: { label: t('common.undo'), run: undo },
  }
  if (options?.duration !== undefined) input.duration = options.duration
  useUi.getState().toast(input)
}
