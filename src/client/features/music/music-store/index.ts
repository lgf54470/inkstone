import { create } from 'zustand'
import { loadPreferences, type MusicPreferences } from './state'
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
    uploadTarget: 'r2',
    transfersOpen: false,
    webdav: initialWebdavState(),
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
    lyricOffsets: prefs.lyricOffsets,
    floatingVisible: prefs.floatingVisible,
    floatingCollapsed: prefs.floatingCollapsed,
    floatingPosition: prefs.floatingPosition,
    immersive: false,
    trackMenu: null,
  }
}

export type {
  MusicBatch, MusicDownloadTask, MusicEqBand, MusicLibraryJob, MusicLibraryJobKind, MusicScope, MusicSort, MusicSourceFilter, MusicStoreState, MusicTransferTarget,
  MusicUploadTask, MusicViewMode, MusicWebdavState, TrackMenuRequest, TrackMenuTarget,
} from './types'
export { currentTrack } from './player'
export { PLAYBACK_RATES, EQ_GAIN_RANGE_DB, LYRIC_OFFSET_LIMIT_MS, LYRIC_OFFSET_STEP_MS } from './state'
export { playbackChange, restorePlayback, savePlayback, savePosition, schedulePlaybackSave } from './playback-sync'
export type { PlaybackChange } from './playback-sync'
export { progressTimeMs, setProgressTime, useProgress } from './progress'
export { resumeSleepTimer } from './player'
export { visibleTracks, sortTracks } from './library-load'
export { useCurrentTrack, useHiddenMatchCount, useTagCounts, useVisibleTracks, buildTagCounts } from './selectors'