import type { AccentName, BackgroundName, DateRangeFilter, EditorLayout, RelativeFilter, SortKey, SortOrder, ThemePref, UiDensity, ViewKind } from '@shared/types';
import { ACCENTS, LIMITS, VIEW_KINDS } from '@shared/constants';
import { truncateText } from '@shared/text-utils';
import { UI_STORAGE_KEY } from '../../lib/runtime';
import type { WorkspacePane, UiState } from './types';




export const STORAGE_KEY = UI_STORAGE_KEY



export const PANEL_WIDTHS = {
  navigation: { min: 196, max: 380 },
  noteList: { min: 260, max: 520 },
} as const



export const DEFAULT_LAYOUT = {
  navWidth: PANEL_WIDTHS.navigation.min,
  listWidth: PANEL_WIDTHS.noteList.min,
  splitRatio: null as number | null,
} as const



export const DEFAULTS = {
  ...DEFAULT_LAYOUT,
  navCollapsed: false,
  listCollapsed: false,
  view: 'all' as ViewKind,
  folderId: null,
  tag: null,
  sort: 'updated' as SortKey,
  order: 'desc' as SortOrder,
  density: 'comfortable' as UiDensity,
  expandedFolders: ['cal'] as string[],
  activeNoteId: null,
  workspaceSplitRatio: null as number | null,
  workspacePrimaryNoteId: null as string | null,
  workspaceSecondaryNoteId: null as string | null,
  activeWorkspacePane: 'primary' as WorkspacePane,
  workspacePaneLayouts: { primary: 'edit', secondary: 'edit' } as Record<WorkspacePane, EditorLayout>,
  recentNoteIds: [] as string[],
  selectedTags: [] as string[],
  selectedTagsMatch: 'any' as const,
  dateFilter: null as DateRangeFilter | null,
  relativeFilter: null as RelativeFilter | null,
  listQuery: '',
  calendarJump: null as { year: number; month: number; nonce: number } | null,
  calendarSortOverride: null as { sort: SortKey; order: SortOrder } | null,
  theme: 'system' as ThemePref,
  accent: 'indigo' as AccentName,
  background: 'paper' as BackgroundName,
  fontScale: 16,
}



export const PERSISTED_KEYS = [
  'navWidth',
  'listWidth',
  'navCollapsed',
  'listCollapsed',
  'splitRatio',
  'workspaceSplitRatio',
  'workspacePrimaryNoteId',
  'workspaceSecondaryNoteId',
  'activeWorkspacePane',
  'workspacePaneLayouts',
  'view',
  'folderId',
  'tag',
  'sort',
  'order',
  'density',
  'expandedFolders',
  'activeNoteId',
  'recentNoteIds',
  'theme',
  'accent',
  'background',
  'fontScale',
] as const



export function loadPersisted(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const value = parsed as Record<string, unknown>
    const out: Partial<UiState> = {}

    if (isFiniteNumber(value.navWidth)) {
      out.navWidth = clamp(value.navWidth, PANEL_WIDTHS.navigation.min, PANEL_WIDTHS.navigation.max)
    }
    if (isFiniteNumber(value.listWidth)) {
      out.listWidth = clamp(value.listWidth, PANEL_WIDTHS.noteList.min, PANEL_WIDTHS.noteList.max)
    }
    if (typeof value.navCollapsed === 'boolean') out.navCollapsed = value.navCollapsed
    if (typeof value.listCollapsed === 'boolean') out.listCollapsed = value.listCollapsed
    if (isFiniteNumber(value.splitRatio)) out.splitRatio = clamp(value.splitRatio, 0.2, 0.8)
    if (isFiniteNumber(value.workspaceSplitRatio)) {
      out.workspaceSplitRatio = clamp(value.workspaceSplitRatio, 0.2, 0.8)
    }
    if (isChoice(value.view, VIEW_KINDS)) out.view = value.view as ViewKind
    if (value.folderId === null || typeof value.folderId === 'string') {
      out.folderId = value.folderId?.slice(0, 128) ?? null
    }
    if (value.tag === null || typeof value.tag === 'string') {
      out.tag = typeof value.tag === 'string' ? truncateText(value.tag, LIMITS.tagNameMaxLength) : null
    }
    if (isChoice(value.sort, ['updated', 'created', 'title'])) out.sort = value.sort as SortKey
    if (isChoice(value.order, ['asc', 'desc'])) out.order = value.order as SortOrder
    if (isChoice(value.density, ['comfortable', 'compact'])) out.density = value.density as UiDensity
    if (Array.isArray(value.expandedFolders)) {
      out.expandedFolders = uniqueStrings(value.expandedFolders, 500)
    }
    if (value.activeNoteId === null || typeof value.activeNoteId === 'string') {
      out.activeNoteId = value.activeNoteId?.slice(0, 128) ?? null
    }
    if (value.workspacePrimaryNoteId === null || typeof value.workspacePrimaryNoteId === 'string') {
      out.workspacePrimaryNoteId = value.workspacePrimaryNoteId?.slice(0, 128) ?? null
    }
    if (value.workspaceSecondaryNoteId === null || typeof value.workspaceSecondaryNoteId === 'string') {
      out.workspaceSecondaryNoteId = value.workspaceSecondaryNoteId?.slice(0, 128) ?? null
    }
    if (isChoice(value.activeWorkspacePane, ['primary', 'secondary'])) {
      out.activeWorkspacePane = value.activeWorkspacePane as WorkspacePane
    }
    if (value.workspacePaneLayouts && typeof value.workspacePaneLayouts === 'object' && !Array.isArray(value.workspacePaneLayouts)) {
      const layouts = value.workspacePaneLayouts as Record<string, unknown>
      out.workspacePaneLayouts = {
        primary: isChoice(layouts.primary, ['edit', 'split', 'preview']) ? layouts.primary as EditorLayout : 'edit',
        secondary: isChoice(layouts.secondary, ['edit', 'split', 'preview']) ? layouts.secondary as EditorLayout : 'edit',
      }
    }
    if (Array.isArray(value.recentNoteIds)) {
      out.recentNoteIds = uniqueStrings(value.recentNoteIds, 24)
    }
    if (isChoice(value.theme, ['light', 'dark', 'system'])) out.theme = value.theme as ThemePref
    if (isChoice(value.accent, ACCENTS.map((accent) => accent.name))) {
      out.accent = value.accent as AccentName
    }
    if (isChoice(value.background, ['paper', 'white'])) {
      out.background = value.background as BackgroundName
    }
    if (isFiniteNumber(value.fontScale)) out.fontScale = clamp(Math.round(value.fontScale), 13, 22)
    if (!out.workspaceSecondaryNoteId) {
      out.workspacePrimaryNoteId = null
      out.activeWorkspacePane = 'primary'
    } else if (!out.workspacePrimaryNoteId) {
      out.workspacePrimaryNoteId = out.activeNoteId ?? null
    }
    if (out.workspaceSecondaryNoteId && out.workspacePrimaryNoteId) {
      out.activeNoteId = out.activeWorkspacePane === 'secondary'
        ? out.workspaceSecondaryNoteId
        : out.workspacePrimaryNoteId
    }
    return out
  } catch {
    return {}
  }
}



export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}



export function isChoice(value: unknown, choices: readonly string[]): value is string {
  return typeof value === 'string' && choices.includes(value)
}



export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}



export function uniqueStrings(value: unknown[], limit: number): string[] {
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    .slice(0, limit)
    .map((item) => item.slice(0, 128))
}



export function activatedNoteFields(state: UiState, id: string | null, pane: WorkspacePane): Partial<UiState> {
  return {
    activeNoteId: id,
    activeWorkspacePane: pane,
    selectedIds: id ? [id] : [],
    recentNoteIds: id
      ? [id, ...state.recentNoteIds.filter((recentId) => recentId !== id)].slice(0, 24)
      : state.recentNoteIds,
    mobilePane: id ? 'preview' : state.mobilePane,
  }
}



export let persistTimer: number | undefined


export let lastPersisted = ''



export function serializedPersistedState(state: UiState): string {
  const out: Record<string, unknown> = {}
  for (const key of PERSISTED_KEYS) out[key] = state[key]
  return JSON.stringify(out)
}



export function persist(state: UiState): void {
  const serialized = serializedPersistedState(state)
  if (serialized === lastPersisted) return
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialized)
      lastPersisted = serialized
    } catch {
      // Quota or private-mode writes can throw; in-memory state stays authoritative for the session.
    }
  }, 220)
}

/** Seed the persisted-state cache from the freshly created store (avoids an initial redundant write). */
export function primePersistCache(state: UiState): void {
  lastPersisted = serializedPersistedState(state)
}
