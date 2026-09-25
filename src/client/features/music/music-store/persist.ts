import { savePreferences } from './state'
import type { MusicGet } from './types'

const PREFS_WRITE_DEBOUNCE_MS = 250

let prefsWriteTimer: number | null = null
let persistGet: MusicGet | null = null

// Volume drags and queue churn used to serialise and write localStorage per event.
export function persist(get: MusicGet): void {
  persistGet = get
  if (prefsWriteTimer !== null) window.clearTimeout(prefsWriteTimer)
  prefsWriteTimer = window.setTimeout(() => {
    prefsWriteTimer = null
    writePreferences(get)
  }, PREFS_WRITE_DEBOUNCE_MS)
}

// A tab closed inside the debounce window must not silently lose the last change.
function flushPendingPreferences(): void {
  if (prefsWriteTimer === null || !persistGet) return
  window.clearTimeout(prefsWriteTimer)
  prefsWriteTimer = null
  writePreferences(persistGet)
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPendingPreferences)

function writePreferences(get: MusicGet): void {
  const state = get()
  savePreferences({
    volume: state.volume,
    muted: state.muted,
    mode: state.mode,
    sort: state.sort,
    sortDirection: state.sortDirection,
    viewMode: state.viewMode,
    sourceFilter: state.sourceFilter,
    floatingVisible: state.floatingVisible,
    floatingCollapsed: state.floatingCollapsed,
    floatingPosition: state.floatingPosition,
    sleepEndsAt: state.sleepEndsAt,
    sleepMinutes: state.sleepMinutes,
    sleepAfterCurrentTrack: state.sleepAfterCurrentTrack,
    playbackRate: state.playbackRate,
    searchHistory: state.searchHistory,
    eqEnabled: state.eqEnabled,
    eqLowDb: state.eqLowDb,
    eqMidDb: state.eqMidDb,
    eqHighDb: state.eqHighDb,
    normalizeEnabled: state.normalizeEnabled,
    crossfadeEnabled: state.crossfadeEnabled,
  })
}
