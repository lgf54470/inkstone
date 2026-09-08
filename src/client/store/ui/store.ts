import { create, type StoreApi } from 'zustand'
import type { ThemePref, ViewKind } from '@shared/types'
import { LIMITS } from '@shared/constants'
import { isVirtualFolderId } from '../../lib/calendar-tree'
import { t } from '../../lib/i18n'
import { DEFAULTS, loadPersisted, activatedNoteFields, persist, primePersistCache } from './state'
import type { ToastItem, UiState, WorkspacePane } from './types'
import { applyThemeToDom } from './theme'




let toastSeq = 0


let themeTransitionTimer: number | undefined

type SetState = StoreApi<UiState>['setState']

function initialUiState(): Partial<UiState> {
  return {
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
  }
}

export const useUi = create<UiState>((set, get) => ({
  ...initialUiState(),
  setLayout: (patch) => set(patch),
  setWorkspacePaneLayout: (pane, layout) => set((state) => ({ workspacePaneLayouts: { ...state.workspacePaneLayouts, [pane]: layout } })),
  setWorkspaceNote: (pane, id, activate = true) => set((state) => setWorkspaceNoteState(state, pane, id, activate)),
  activateWorkspacePane: (pane) => set((state) => activateWorkspacePaneState(state, pane)),
  closeSecondaryNote: () => set((state) => closeSecondaryNoteState(state)),
  removeWorkspaceNote: (id) => set((state) => removeWorkspaceNoteState(state, id)),
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  toggleNavDrawer: (open) => set((s) => ({ navDrawerOpen: open ?? !s.navDrawerOpen })),
  toggleList: () => set((s) => ({ listCollapsed: !s.listCollapsed })),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  openView: (view, options) => set((s) => openViewState(s, view, options)),
  toggleTagSelection: (tag) => set((s) => toggleTagSelectionState(s, tag)),
  clearTagSelection: () => set({ selectedTags: [] }),
  selectTags: (tags) => set((s) => selectTagsState(s, tags)),
  setSelectedTagsMatch: (match) => set({ selectedTagsMatch: match }),
  setDateFilter: (value) => set({ dateFilter: value }),
  setRelativeFilter: (value) => set({ relativeFilter: value }),
  setListQuery: (query) => set({ listQuery: query }),
  clearAllFilters: () => clearAllFilters(get, set),
  requestCalendarJump: (year, month) => set((s) => requestCalendarJumpState(s, year, month)),
  setSort: (sort, order) => set((s) => ({ sort, order: order ?? s.order })),
  setDensity: (density) => set({ density }),
  toggleFolder: (id) => set((s) => toggleFolderState(s, id)),
  expandFolder: (id) => set((s) => expandFolderState(s, id)),
  setActiveNote: (id) => setActiveNote(get, id),
  setSelected: (ids) => set({ selectedIds: ids }),
  toggleSelected: (id, additive) => set((s) => toggleSelectedState(s, id, additive)),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
  toggleBacklinks: () => set((s) => ({ backlinksOpen: !s.backlinksOpen })),
  setLightbox: (lightbox) => set({ lightbox }),
  toast: (input) => toastImpl(set, input),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  applyAppearance: (patch) => applyAppearanceImpl(get, set, patch)
}) as UiState)

primePersistCache(useUi.getState())
useUi.subscribe(persist)



function setWorkspaceNoteState(
  state: UiState,
  pane: WorkspacePane,
  id: string | null,
  activate: boolean,
): Partial<UiState> {
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
}

function activateWorkspacePaneState(state: UiState, pane: WorkspacePane): Partial<UiState> {
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
}

function closeSecondaryNoteState(state: UiState): Partial<UiState> {
  if (!state.workspaceSecondaryNoteId) return state
  const primaryId = state.workspacePrimaryNoteId ??
    (state.activeWorkspacePane === 'primary' ? state.activeNoteId : null)
  return {
    workspacePrimaryNoteId: null,
    workspaceSecondaryNoteId: null,
    ...activatedNoteFields(state, primaryId, 'primary'),
  }
}

function removeWorkspaceNoteState(state: UiState, id: string): Partial<UiState> {
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
}

function openViewState(
  state: UiState,
  view: ViewKind,
  options: Parameters<UiState['openView']>[1],
): Partial<UiState> {
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
    selectedTags: view === 'folder' ? state.selectedTags : [],
    mobilePane: 'list',
    navDrawerOpen: false,
    ...(enteringCalendar
        ? {
            calendarSortOverride: state.calendarSortOverride ?? { sort: state.sort, order: state.order },
            sort: 'created',
            order: 'desc',
        }
        : state.calendarSortOverride
            ? {
                calendarSortOverride: null,
                sort: state.calendarSortOverride.sort,
                order: state.calendarSortOverride.order,
            }
            : {}),
  }
}

function toggleTagSelectionState(state: UiState, tag: string): Partial<UiState> {
  if (state.selectedTags.includes(tag))
    return { selectedTags: state.selectedTags.filter((item) => item !== tag) }
  if (state.selectedTags.length >= LIMITS.tagSelectionMax)
    return state
  return { selectedTags: [...state.selectedTags, tag] }
}

function selectTagsState(state: UiState, tags: string[]): Partial<UiState> {
  return {
    selectedTags: [...new Set([...state.selectedTags, ...tags])].slice(0, LIMITS.tagSelectionMax),
  }
}

function requestCalendarJumpState(state: UiState, year: number, month: number): Partial<UiState> {
  return {
    calendarJump: { year, month, nonce: (state.calendarJump?.nonce ?? 0) + 1 },
  }
}

function toggleFolderState(state: UiState, id: string): Partial<UiState> {
  return {
    expandedFolders: state.expandedFolders.includes(id)
      ? state.expandedFolders.filter((f) => f !== id)
      : [...state.expandedFolders, id],
  }
}

function expandFolderState(state: UiState, id: string): Partial<UiState> {
  return state.expandedFolders.includes(id)
    ? state
    : { expandedFolders: [...state.expandedFolders, id] }
}

function setActiveNote(get: () => UiState, id: string | null): void {
  const state = get()
  const pane = state.workspaceSecondaryNoteId ? state.activeWorkspacePane : 'primary'
  state.setWorkspaceNote(pane, id)
}

function toggleSelectedState(state: UiState, id: string, additive: boolean): Partial<UiState> {
  if (!additive) return { selectedIds: [id] }
  return {
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter((x) => x !== id)
      : [...state.selectedIds, id],
  }
}

function clearAllFilters(get: () => UiState, set: SetState): void {
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
}

function toastImpl(set: SetState, input: Parameters<UiState['toast']>[0]): string {
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
}

export function switchThemeWithTransition(
  next: ThemePref,
  origin?: { x: number; y: number },
  commit?: () => void,
): void {
  const ui = useUi.getState()
  const apply = commit ?? (() => ui.applyAppearance({ theme: next }))
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> }
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = document.documentElement
  window.clearTimeout(themeTransitionTimer)
  themeTransitionTimer = undefined
  root.classList.remove('theme-transition')

  if (!doc.startViewTransition || reduced || !origin) {
    root.classList.add('theme-transition')
    apply()
    themeTransitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-transition')
      themeTransitionTimer = undefined
    }, 300)
    return
  }

  const transition = doc.startViewTransition(() => {
    apply()
  })

  void (async () => {
    try {
      await transition.ready
      const radius = Math.hypot(
        Math.max(origin.x, innerWidth - origin.x),
        Math.max(origin.y, innerHeight - origin.y),
      )
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`],
        },
        {
          duration: 460,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    } catch {
      // The view transition can be skipped (reduced motion, interrupted navigation); the circular reveal is purely decorative.
    }
  })()
}

function applyAppearanceImpl(
  get: () => UiState,
  set: (patch: Parameters<UiState['applyAppearance']>[0]) => void,
  patch: Parameters<UiState['applyAppearance']>[0],
): void {
  const current = get()
  const next: Parameters<UiState['applyAppearance']>[0] = {}
  let hasChanged = false
  // One guarded assignment per key: a union-keyed loop write would need a cast.
  if (patch.theme !== undefined && patch.theme !== current.theme) { next.theme = patch.theme; hasChanged = true }
  if (patch.accent !== undefined && patch.accent !== current.accent) { next.accent = patch.accent; hasChanged = true }
  if (patch.background !== undefined && patch.background !== current.background) { next.background = patch.background; hasChanged = true }
  if (patch.fontScale !== undefined && patch.fontScale !== current.fontScale) { next.fontScale = patch.fontScale; hasChanged = true }
  if (!hasChanged) return
  set(next)
  applyThemeToDom(get())
}



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