import type { MusicPlayMode } from '@shared/types'
import type { MusicSort, MusicSourceFilter, MusicViewMode } from './types'

export const MUSIC_PREFS_KEY = 'inkstone.music-prefs.v2'
export const LEGACY_PREFS_KEY = 'inkstone.music-prefs.v1'
export const SEARCH_HISTORY_MAX = 20
export const RECENT_IDS_MAX = 50

export interface MusicPreferences {
  volume: number
  muted: boolean
  mode: MusicPlayMode
  sort: MusicSort
  viewMode: MusicViewMode
  sourceFilter: MusicSourceFilter
  floatingVisible: boolean
  floatingCollapsed: boolean
  floatingPosition: { x: number; y: number } | null
  playbackRate: number
  searchHistory: string[]
  recentIds: string[]
  sleepEndsAt: number | null
}

const PLAY_MODES: MusicPlayMode[] = ['order', 'repeat-all', 'repeat-one', 'shuffle']
const SORTS: MusicSort[] = ['recent', 'title', 'artist', 'plays']
const VIEW_MODES: MusicViewMode[] = ['list', 'grid']
const SOURCE_FILTERS: MusicSourceFilter[] = ['all', 'r2', 'webdav']
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const DEFAULT_PREFERENCES: MusicPreferences = {
  volume: 0.8,
  muted: false,
  mode: 'order',
  sort: 'recent',
  viewMode: 'list',
  sourceFilter: 'all',
  floatingVisible: true,
  floatingCollapsed: false,
  floatingPosition: null,
  playbackRate: 1,
  searchHistory: [],
  recentIds: [],
  sleepEndsAt: null,
}

function readStored(key: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch (error) {
    console.warn('[inkstone] music preferences unreadable:', error)
    return null
  }
}

export function loadPreferences(): MusicPreferences {
  const parsed = readStored(MUSIC_PREFS_KEY) ?? readStored(LEGACY_PREFS_KEY)
  if (!parsed) return DEFAULT_PREFERENCES
  return {
    volume: readVolume(parsed.volume),
    muted: parsed.muted === true,
    mode: PLAY_MODES.includes(parsed.mode as MusicPlayMode) ? (parsed.mode as MusicPlayMode) : DEFAULT_PREFERENCES.mode,
    sort: SORTS.includes(parsed.sort as MusicSort) ? (parsed.sort as MusicSort) : DEFAULT_PREFERENCES.sort,
    viewMode: VIEW_MODES.includes(parsed.viewMode as MusicViewMode) ? (parsed.viewMode as MusicViewMode) : DEFAULT_PREFERENCES.viewMode,
    sourceFilter: SOURCE_FILTERS.includes(parsed.sourceFilter as MusicSourceFilter)
      ? (parsed.sourceFilter as MusicSourceFilter)
      : DEFAULT_PREFERENCES.sourceFilter,
    floatingVisible: parsed.floatingVisible !== false,
    floatingCollapsed: parsed.floatingCollapsed === true,
    floatingPosition: readPosition(parsed.floatingPosition),
    playbackRate: readRate(parsed.playbackRate),
    searchHistory: readStrings(parsed.searchHistory, SEARCH_HISTORY_MAX),
    recentIds: readStrings(parsed.recentIds, RECENT_IDS_MAX),
    sleepEndsAt: readTimestamp(parsed.sleepEndsAt),
  }
}

export function savePreferences(prefs: MusicPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Quota or private-mode writes can throw; in-memory preferences stay authoritative.
  }
}

function readVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_PREFERENCES.volume
}

function readRate(value: unknown): number {
  return (PLAYBACK_RATES as readonly number[]).includes(value as number) ? (value as number) : 1
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null
  const point = value as { x?: unknown; y?: unknown }
  return typeof point.x === 'number' && typeof point.y === 'number' ? { x: point.x, y: point.y } : null
}

function readTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readStrings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, max)
}

export function pushHistory(history: string[], query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return history
  const lowered = trimmed.toLowerCase()
  return [trimmed, ...history.filter((item) => item.toLowerCase() !== lowered)].slice(0, SEARCH_HISTORY_MAX)
}

export function pushRecent(ids: string[], id: string): string[] {
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, RECENT_IDS_MAX)
}
