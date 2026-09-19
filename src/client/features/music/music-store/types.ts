import type { StoreApi } from 'zustand'
import type {
  MusicPlayMode, MusicPlaylistDetail, MusicStats, MusicTag, MusicTrack, MusicWebdavEntry,
} from '@shared/types'

export type MusicSort = 'recent' | 'title' | 'artist' | 'album' | 'duration' | 'plays'
export type MusicSortDirection = 'asc' | 'desc'
export type MusicViewMode = 'list' | 'grid'
export type MusicSourceFilter = 'all' | 'r2' | 'webdav'
export type MusicBatch = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'delete'

export type MusicTrackPatchInput = Partial<MusicTrack> & { tagIds?: string[]; coverDataUrl?: string | null }

export type MusicScope =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'pinned' }
  | { kind: 'recent' }
  | { kind: 'albums' }
  | { kind: 'artists' }
  // M-53: a flat list of the tracks whose upload checksum matches another copy.
  | { kind: 'duplicates' }
  // A drilled-down album has to carry the artist too: different artists can share an album title.
  | { kind: 'album'; artist: string; album: string }
  | { kind: 'artist'; artist: string }
  | { kind: 'tag'; tagId: string }
  | { kind: 'playlist'; playlistId: string }

export type MusicTransferTarget = 'r2' | 'webdav'

export type MusicEqBand = 'low' | 'mid' | 'high'

export interface TrackMenuTarget {
  track: MusicTrack
  itemId?: string
  playlistId?: string
}

// The anchor is the trigger element for a button-opened menu and the pointer for a
// right-click; it only lives in the store while the single menu instance is open.
export interface TrackMenuRequest {
  target: TrackMenuTarget
  anchor: HTMLElement | { x: number; y: number }
}

export interface MusicUploadTask {
  id: string
  name: string
  percent: number
  status: 'uploading' | 'done' | 'failed'
  error: string | null
  target: MusicTransferTarget
  controller: AbortController
}

export interface MusicDownloadTask {
  id: string
  name: string
  percent: number
  status: 'downloading' | 'done' | 'failed'
}

export type MusicLibraryJobKind = 'metadata' | 'covers'

// One pass of batch library work; kind is unique while running, so a second
// click cannot stack a duplicate pass. Done passes leave the list.
export interface MusicLibraryJob {
  kind: MusicLibraryJobKind
  done: number
  total: number
  status: 'running' | 'failed'
}

export interface MusicWebdavState {
  loading: boolean
  configured: boolean
  dir: string
  directory: string
  path: string
  entries: MusicWebdavEntry[]
  truncated: boolean
  error: string | null
  importingPaths: string[]
}

export type MusicSet = StoreApi<MusicStoreState>['setState']
export type MusicGet = StoreApi<MusicStoreState>['getState']

export interface MusicStoreState {
  tracks: MusicTrack[]
  tags: MusicTag[]
  playlists: MusicPlaylistDetail[]
  stats: MusicStats | null
  loading: boolean
  loadError: string | null
  lastLoadedAt: number

  scope: MusicScope
  query: string
  sort: MusicSort
  sortDirection: MusicSortDirection
  viewMode: MusicViewMode
  sourceFilter: MusicSourceFilter
  selectedIds: string[]
  searchHistory: string[]
  romanized: Record<string, string>

  queue: string[]
  currentIndex: number
  isPlaying: boolean
  streamLoading: boolean
  durationMs: number
  volume: number
  muted: boolean
  mode: MusicPlayMode
  playbackRate: number
  sleepEndsAt: number | null
  sleepAfterCurrentTrack: boolean
  eqEnabled: boolean
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number

  floatingVisible: boolean
  floatingCollapsed: boolean
  floatingPosition: { x: number; y: number } | null
  immersive: boolean
  trackMenu: TrackMenuRequest | null
  uploads: MusicUploadTask[]
  downloads: MusicDownloadTask[]
  offlineTrackIds: string[]
  libraryJobs: MusicLibraryJob[]
  uploadTarget: MusicTransferTarget
  transfersOpen: boolean
  webdav: MusicWebdavState

  loadLibrary: (force?: boolean) => Promise<void>
  setScope: (scope: MusicScope) => void
  setQuery: (query: string) => void
  commitQuery: (query: string) => void
  clearSearchHistory: () => void
  setSort: (sort: MusicSort) => void
  setSortDirection: (direction: MusicSortDirection) => void
  setViewMode: (mode: MusicViewMode) => void
  openTrackMenu: (menu: TrackMenuRequest) => void
  closeTrackMenu: () => void
  setSourceFilter: (filter: MusicSourceFilter) => void
  prepareRomanization: () => Promise<void>
  toggleSelect: (id: string, additive: boolean) => void
  selectAll: (ids: string[]) => void
  invertSelection: (ids: string[]) => void
  clearSelection: () => void
  moveSelectionToTag: (tagId: string) => Promise<void>
  addSelectionToPlaylist: (playlistId: string) => Promise<void>

  playTrack: (id: string) => Promise<void>
  playCollection: (ids: string[], startIndex?: number) => Promise<void>
  togglePlay: () => Promise<void>
  playNext: () => Promise<void>
  playPrevious: () => Promise<void>
  seek: (ms: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleMode: () => void
  setPlaybackRate: (rate: number) => void
  setSleepTimer: (minutes: number | null) => void
  setSleepAfterCurrentTrack: (enabled: boolean) => void
  setEqEnabled: (enabled: boolean) => void
  setEqBand: (band: MusicEqBand, db: number) => void
  addToQueue: (id: string, next?: boolean) => void
  removeFromQueue: (index: number) => void
  moveQueueItem: (from: number, to: number) => void
  clearQueue: () => void
  playQueueAt: (index: number) => Promise<void>

  patchTrack: (id: string, patch: MusicTrackPatchInput) => Promise<void>
  // Detail views call this for tracks the lazy library listed with a lyric but no text.
  ensureTrackLyric: (id: string) => Promise<void>
  refreshTrackMetadata: (ids: string[], force?: boolean) => Promise<number>
  matchMissingCovers: () => Promise<number>
  // Menu action: fetch lyrics through the Worker relay and save the match as this track's lyric.
  searchTrackLyric: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  deleteTrack: (id: string) => Promise<void>
  batchTracks: (action: MusicBatch) => Promise<void>

  createTag: (name: string, color?: string | null) => Promise<void>
  patchTag: (id: string, patch: { name?: string; color?: string | null; isPinned?: boolean }) => Promise<void>
  deleteTag: (id: string) => Promise<void>

  createPlaylist: (name: string, description?: string) => Promise<void>
  renamePlaylist: (id: string, name: string, description?: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  sharePlaylist: (id: string) => Promise<string | null>
  unsharePlaylist: (id: string) => Promise<void>
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>
  movePlaylistItem: (playlistId: string, itemId: string, delta: number) => Promise<void>
  movePlaylistItemToIndex: (playlistId: string, itemId: string, toIndex: number) => Promise<void>

  uploadFiles: (files: File[], target?: MusicTransferTarget) => Promise<void>
  dismissUpload: (id: string) => void
  downloadTracks: (ids: string[]) => Promise<void>
  dismissDownload: (id: string) => void
  syncOfflineTracks: () => Promise<void>
  toggleTrackOffline: (id: string) => Promise<void>
  setTracksOffline: (ids: string[], enabled: boolean) => Promise<void>
  dismissLibraryJob: (kind: MusicLibraryJobKind) => void
  setTransfersOpen: (open: boolean) => void
  setUploadTarget: (target: MusicTransferTarget) => void

  browseWebdav: (path: string) => Promise<void>
  importWebdavTrack: (entry: MusicWebdavEntry) => Promise<void>
  importWebdavFolder: () => Promise<void>
  deleteWebdavFiles: (paths: string[]) => Promise<void>

  setImmersive: (open: boolean) => void
  toggleFloating: () => void
  toggleFloatingCollapsed: () => void
  setFloatingPosition: (position: { x: number; y: number }) => void
}
