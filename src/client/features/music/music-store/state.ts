import type { MusicPlayMode } from '@shared/types'
import type { MusicSort, MusicSortDirection, MusicSourceFilter, MusicViewMode } from './types'

export const MUSIC_PREFS_KEY = 'inkstone.music-prefs.v2'
export const LEGACY_PREFS_KEY = 'inkstone.music-prefs.v1'
export const SEARCH_HISTORY_MAX = 20

export interface MusicPreferences {
  volume: number
  muted: boolean
  mode: MusicPlayMode
  sort: MusicSort
  sortDirection: MusicSortDirection
  viewMode: MusicViewMode
  sourceFilter: MusicSourceFilter
  floatingVisible: boolean
  floatingCollapsed: boolean
  floatingPosition: { x: number; y: number } | null
  playbackRate: number
  searchHistory: string[]
  sleepEndsAt: number | null
  sleepMinutes: number | null
  sleepAfterCurrentTrack: boolean
  eqEnabled: boolean
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  normalizeEnabled: boolean
  crossfadeEnabled: boolean
  /** Per-track lyric calibration in ms; a positive value holds the lyrics back. */
  lyricOffsets: Record<string, number>
}

const PLAY_MODES: MusicPlayMode[] = ['order', 'repeat-all', 'repeat-one', 'shuffle']
const SORTS: MusicSort[] = ['recent', 'title', 'artist', 'album', 'duration', 'plays']
const SORT_DIRECTIONS: MusicSortDirection[] = ['asc', 'desc']
const VIEW_MODES: MusicViewMode[] = ['list', 'grid']
const SOURCE_FILTERS: MusicSourceFilter[] = ['all', 'r2', 'webdav']
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export const EQ_GAIN_RANGE_DB = 12
// Lyrics drift by fractions of a second as much as by whole ones, so the nudge
// is a quarter second and the window stays narrow enough to stay useful.
export const LYRIC_OFFSET_STEP_MS = 250
export const LYRIC_OFFSET_LIMIT_MS = 5_000
// One entry per calibrated track; the cap only bounds what localStorage can grow to.
export const LYRIC_OFFSET_MAX_TRACKS = 500

export function readEqDb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(EQ_GAIN_RANGE_DB, Math.max(-EQ_GAIN_RANGE_DB, Math.round(value)))
}

export function clampLyricOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(LYRIC_OFFSET_LIMIT_MS, Math.max(-LYRIC_OFFSET_LIMIT_MS, Math.round(value)))
}

function readLyricOffsets(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const offsets: Record<string, number> = {}
  for (const [trackId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!trackId) continue
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue
    offsets[trackId] = clampLyricOffset(raw)
    if (Object.keys(offsets).length >= LYRIC_OFFSET_MAX_TRACKS) break
  }
  return offsets
}

export const DEFAULT_PREFERENCES: MusicPreferences = {
  volume: 0.8,
  muted: false,
  mode: 'order',
  sort: 'recent',
  sortDirection: 'asc',
  viewMode: 'list',
  sourceFilter: 'all',
  floatingVisible: true,
  floatingCollapsed: false,
  floatingPosition: null,
  playbackRate: 1,
  searchHistory: [],
  sleepEndsAt: null,
  sleepMinutes: null,
  sleepAfterCurrentTrack: false,
  eqEnabled: false,
  eqLowDb: 0,
  eqMidDb: 0,
  eqHighDb: 0,
  normalizeEnabled: false,
  crossfadeEnabled: false,
  lyricOffsets: {},
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
    sortDirection: SORT_DIRECTIONS.includes(parsed.sortDirection as MusicSortDirection)
      ? (parsed.sortDirection as MusicSortDirection)
      : DEFAULT_PREFERENCES.sortDirection,
    viewMode: VIEW_MODES.includes(parsed.viewMode as MusicViewMode) ? (parsed.viewMode as MusicViewMode) : DEFAULT_PREFERENCES.viewMode,
    sourceFilter: SOURCE_FILTERS.includes(parsed.sourceFilter as MusicSourceFilter)
      ? (parsed.sourceFilter as MusicSourceFilter)
      : DEFAULT_PREFERENCES.sourceFilter,
    floatingVisible: parsed.floatingVisible !== false,
    floatingCollapsed: parsed.floatingCollapsed === true,
    floatingPosition: readPosition(parsed.floatingPosition),
    playbackRate: readRate(parsed.playbackRate),
    searchHistory: readStrings(parsed.searchHistory, SEARCH_HISTORY_MAX),
    sleepEndsAt: readTimestamp(parsed.sleepEndsAt),
    // Only the countdown is authoritative for stopping playback; the chosen length is kept
    // alongside it so the menu can say which option is armed.
    sleepMinutes: readSleepMinutes(parsed.sleepMinutes),
    sleepAfterCurrentTrack: parsed.sleepAfterCurrentTrack === true,
    eqEnabled: parsed.eqEnabled === true,
    eqLowDb: readEqDb(parsed.eqLowDb),
    eqMidDb: readEqDb(parsed.eqMidDb),
    eqHighDb: readEqDb(parsed.eqHighDb),
    normalizeEnabled: parsed.normalizeEnabled === true,
    crossfadeEnabled: parsed.crossfadeEnabled === true,
    lyricOffsets: readLyricOffsets(parsed.lyricOffsets),
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

function readSleepMinutes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
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

