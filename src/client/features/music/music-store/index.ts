import { create } from 'zustand'
import { loadPreferences } from './state'
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
  return {
    tracks: [],
    tags: [],
    playlists: [],
    stats: null,
    loading: false,
    loadError: null,
    scope: { kind: 'all' },
    query: '',
    sort: prefs.sort,
    viewMode: prefs.viewMode,
    sourceFilter: prefs.sourceFilter,
    selectedIds: [],
    searchHistory: prefs.searchHistory,
    romanized: {},
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
    currentTimeMs: 0,
    durationMs: 0,
    volume: prefs.volume,
    muted: prefs.muted,
    mode: prefs.mode,
    playbackRate: prefs.playbackRate,
    recentIds: prefs.recentIds,
    sleepEndsAt: prefs.sleepEndsAt,
    floatingVisible: prefs.floatingVisible,
    floatingCollapsed: prefs.floatingCollapsed,
    floatingPosition: prefs.floatingPosition,
    immersive: false,
    uploads: [],
    downloads: [],
    uploadTarget: 'r2',
    transfersOpen: false,
    webdav: initialWebdavState(),
  }
}

export type {
  MusicBatch, MusicDownloadTask, MusicScope, MusicSort, MusicSourceFilter, MusicStoreState, MusicTransferTarget,
  MusicUploadTask, MusicViewMode, MusicWebdavState,
} from './types'
export { currentTrack } from './player'
export { PLAYBACK_RATES } from './state'
export { hasPlaybackChanged, restorePlayback, savePlayback, schedulePlaybackSave } from './playback-sync'
export { resumeSleepTimer } from './player'
export { visibleTracks, sortTracks } from './library-load'
export { useCurrentTrack, useTagCounts, useVisibleTracks, buildTagCounts } from './selectors'