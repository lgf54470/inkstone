import { create } from 'zustand'
import { SEARCH_RESULT_LIMIT } from '../music-search'
import { loadPreferences, type MusicPreferences } from './state'
import { initialAlistBrowseState } from './alist'
import { initialServerSourceState } from './servers'
import { librarySlice } from './library'
import { playerSlice } from './player-slice'
import { initialWebdavState } from './webdav'
import type { MusicStoreState } from './types'

export const useMusic = create<MusicStoreState>((set, get) => ({
  ...initialMusicState(),
  ...librarySlice(set, get),
  ...playerSlice(set, get),
}) as MusicStoreState)

function initialMusicState(): Partial<MusicStoreState> {
  const prefs = loadPreferences()
  return { ...initialLibraryState(prefs), ...initialPlaybackState(prefs) }
}

function initialLibraryState(prefs: MusicPreferences): Partial<MusicStoreState> {
  return {
    tracks: [],
    tags: [],
    playlists: [],
    stats: null,
    loading: false,
    loadError: null,
    lastLoadedAt: 0,
    scope: { kind: 'all' },
    query: '',
    sort: prefs.sort,
    sortDirection: prefs.sortDirection,
    viewMode: prefs.viewMode,
    viewModeChosen: prefs.viewModeChosen,
    matchLimit: SEARCH_RESULT_LIMIT,
    sourceFilter: prefs.sourceFilter,
    selectedIds: [],
    searchHistory: prefs.searchHistory,
    romanized: {},
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
    durationMs: 0,
    uploads: [],
    downloads: [],
    offlineTrackIds: [],
    libraryJobs: [],
    trashOpen: false,
    trashEntries: [],
    trashLoading: false,
    alistServers: [],
    alistServersLoading: false,
    alistServersError: null,
    alistBrowse: initialAlistBrowseState(),
    ...initialServerSourceState(),
    ...initialProviderState(prefs),
    podcastFeeds: [],
    podcastFeedsLoading: false,
    podcastFeedsError: null,
    podcastEpisodesFeedId: null,
    podcastEpisodes: [],
    podcastEpisodesLoading: false,
    podcastEpisodesError: null,
    uploadTarget: 'r2',
    transfersOpen: false,
    webdav: initialWebdavState(),
  }
}

// FB-F4: the online-source half of the library state — the switches, the quality tier they
// write and the notice that guards them — travels together, so it is read from the
// preferences in one place rather than four lines apart in the big initializer.
function initialProviderState(prefs: MusicPreferences): Partial<MusicStoreState> {
  return {
    providerEnabled: prefs.providerEnabled,
    providerScope: prefs.providerScope,
    providerSourceEnabled: prefs.providerSourceEnabled,
    providerSourceOrder: prefs.providerSourceOrder,
    providerQuality: prefs.providerQuality,
    providerNoticeAccepted: prefs.providerNoticeAccepted,
    showSourceBadge: prefs.showSourceBadge,
    lyricSource: prefs.lyricSource,
    providerAutoSwap: prefs.providerAutoSwap,
    providerResults: null,
    providerSearching: false,
    providerKeywords: '',
    providerFailedSources: [],
    sourceSwitchTrackId: null,
    sourceSwitchCandidates: null,
    sourceSwitchLoading: false,
    sourceSwitchFailed: false,
    healthOpen: false,
    healthScanning: false,
    healthFailed: false,
    healthResults: null,
  }
}

function initialPlaybackState(prefs: MusicPreferences): Partial<MusicStoreState> {
  return {
    volume: prefs.volume,
    muted: prefs.muted,
    mode: prefs.mode,
    playbackRate: prefs.playbackRate,
    sleepEndsAt: prefs.sleepEndsAt,
    sleepMinutes: prefs.sleepMinutes,
    sleepAfterCurrentTrack: prefs.sleepAfterCurrentTrack,
    eqEnabled: prefs.eqEnabled,
    eqLowDb: prefs.eqLowDb,
    eqMidDb: prefs.eqMidDb,
    eqHighDb: prefs.eqHighDb,
    normalizeEnabled: prefs.normalizeEnabled,
    crossfadeEnabled: prefs.crossfadeEnabled,
    immersiveBackground: prefs.immersiveBackground,
    lyricAlign: prefs.lyricAlign,
    lyricTextSize: prefs.lyricTextSize,
    lyricOffsets: prefs.lyricOffsets,
    floatingVisible: prefs.floatingVisible,
    floatingCollapsed: prefs.floatingCollapsed,
    floatingPosition: prefs.floatingPosition,
    hubMaximized: prefs.hubMaximized,
    hubGeometry: prefs.hubGeometry,
    immersive: false,
    loopRange: null,
    shuffleOrder: null,
    remoteLyricMatches: null,
    trackMenu: null,
  }
}

export type {
  MusicBatch, MusicDownloadTask, MusicEqBand, MusicHubGeometry, MusicImmersiveBackground, MusicLibraryJob, MusicLibraryJobKind, MusicLoopRange,
  MusicLyricAlign, MusicLyricTextSize,
  MusicScope, MusicSort, MusicSourceFilter, MusicStoreState, MusicTransferTarget,
  MusicUploadTask, MusicViewMode, MusicWebdavState, TrackMenuRequest, TrackMenuTarget,
} from './types'
export { currentTrack } from './player'
export { deadReferenceIds, referenceTrackIds } from './health'
// FB-F13: the lyric source list and its order live with the pure helpers, so the settings page and
// the lookup read the same tuple.
export { LYRIC_SOURCES, lyricSourceOrder, type MusicLyricSource } from '../music-utils'
export {
  PLAYBACK_RATES, RATE_FINE_STEP, RATE_MAX, RATE_MIN, EQ_GAIN_RANGE_DB,
  IMMERSIVE_BACKGROUNDS, LYRIC_ALIGNS, LYRIC_TEXT_SIZES,
  LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_STEP_MS, MIN_LOOP_MS, SLEEP_FADE_MS,
} from './state'
export { playbackChange, restorePlayback, savePlayback, savePosition, schedulePlaybackSave } from './playback-sync'
export type { PlaybackChange } from './playback-sync'
export { progressTimeMs, setProgressTime, useProgress } from './progress'
export { resumeSleepTimer } from './player'
export { visibleTracks, sortTracks } from './library-load'
export { useCurrentTrack, useActiveLoopRange, useHiddenMatchCount, useTagCounts, useVisibleTracks, buildTagCounts } from './selectors'