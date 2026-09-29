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
    viewModeChosen: state.viewModeChosen,
    sourceFilter: state.sourceFilter,
    floatingVisible: state.floatingVisible,
    floatingCollapsed: state.floatingCollapsed,
    floatingPosition: state.floatingPosition,
    hubMaximized: state.hubMaximized,
    hubGeometry: state.hubGeometry,
    sleepEndsAt: state.sleepEndsAt,
    sleepMinutes: state.sleepMinutes,
    sleepAfterCurrentTrack: state.sleepAfterCurrentTrack,
    playbackRate: state.playbackRate,
    searchHistory: state.searchHistory,
    eqEnabled: state.eqEnabled,
    eqBandsDb: state.eqBandsDb,
    normalizeEnabled: state.normalizeEnabled,
    crossfadeEnabled: state.crossfadeEnabled,
    immersiveBackground: state.immersiveBackground,
    lyricAlign: state.lyricAlign,
    lyricTextSize: state.lyricTextSize,
    lyricOffsets: state.lyricOffsets,
    providerEnabled: state.providerEnabled,
    providerScope: state.providerScope,
    providerSourceEnabled: state.providerSourceEnabled,
    providerSourceOrder: state.providerSourceOrder,
    providerQuality: state.providerQuality,
    downloadQuality: state.downloadQuality,
    offlineWithCover: state.offlineWithCover,
    offlineWithLyric: state.offlineWithLyric,
    providerNoticeAccepted: state.providerNoticeAccepted,
    providerAutoSwap: state.providerAutoSwap,
    showSourceBadge: state.showSourceBadge,
    lyricSource: state.lyricSource,
  })
}
