import type { StoreApi } from 'zustand'
import type { MusicAlistCreateInput, MusicAlistEntry, MusicAlistPatchInput, MusicAlistServerView, MusicTrashEntry } from '../../../lib/api'
import type {
  MusicPlayMode, MusicPlaylistDetail, MusicStats, MusicTag, MusicTrack, MusicWebdavEntry,
} from '@shared/types'
import type { MusicEqPresetId } from '../music-eq-presets'

export type MusicSort = 'recent' | 'title' | 'artist' | 'album' | 'duration' | 'plays'
export type MusicSortDirection = 'asc' | 'desc'
export type MusicViewMode = 'list' | 'grid'
export type MusicSourceFilter = 'all' | 'r2' | 'webdav'
export type MusicBatch = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'delete'

// FEA-C4: lyric presentation, shared by the immersive panel and the now-playing column.
export type MusicLyricAlign = 'left' | 'center' | 'right'
export type MusicLyricTextSize = 'small' | 'default' | 'large'

// FEA-C2: what paints behind the immersive player's columns.
export type MusicImmersiveBackground = 'theme' | 'blur' | 'gradient'

export type MusicTrackPatchInput = Partial<MusicTrack> & { tagIds?: string[]; coverDataUrl?: string | null }

// A practice loop the listener marks on the track they are hearing; `endMs` stays
// null until the second point is placed.
export interface MusicLoopRange {
  trackId: string
  startMs: number
  endMs: number | null
}

export type MusicScope =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'pinned' }
  | { kind: 'recent' }
  | { kind: 'albums' }
  | { kind: 'artists' }
  // M-53: a flat list of the tracks whose upload checksum matches another copy.
  | { kind: 'duplicates' }
  // FEA-B4: what this device has cached for offline playback (service worker cache,
  // see lib/offline-audio); per device, so it never comes from the server.
  | { kind: 'offline' }
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
  /** Play order while the mode is shuffle; null otherwise (see music-shuffle.ts). */
  shuffleOrder: string[] | null
  /** Server answer for the committed query's library-wide lyric search; null until one lands. */
  remoteLyricMatches: { query: string; ids: string[]; total: number } | null
  isPlaying: boolean
  streamLoading: boolean
  durationMs: number
  volume: number
  muted: boolean
  mode: MusicPlayMode
  playbackRate: number
  sleepEndsAt: number | null
  sleepMinutes: number | null
  sleepAfterCurrentTrack: boolean
  eqEnabled: boolean
  eqLowDb: number
  eqMidDb: number
  eqHighDb: number
  normalizeEnabled: boolean
  crossfadeEnabled: boolean
  lyricOffsets: Record<string, number>

  floatingVisible: boolean
  floatingCollapsed: boolean
  floatingPosition: { x: number; y: number } | null
  immersive: boolean
  immersiveBackground: MusicImmersiveBackground
  lyricAlign: MusicLyricAlign
  lyricTextSize: MusicLyricTextSize
  loopRange: MusicLoopRange | null
  trackMenu: TrackMenuRequest | null
  uploads: MusicUploadTask[]
  downloads: MusicDownloadTask[]
  offlineTrackIds: string[]
  libraryJobs: MusicLibraryJob[]
  trashOpen: boolean
  trashEntries: MusicTrashEntry[]
  trashLoading: boolean
  alistServers: MusicAlistServerView[]
  alistServersLoading: boolean
  alistBrowse: {
    serverId: string | null
    path: string
    entries: MusicAlistEntry[]
    loading: boolean
    error: string | null
    importingPaths: string[]
  }
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
  setImmersiveBackground: (mode: MusicImmersiveBackground) => void
  setLyricAlign: (align: MusicLyricAlign) => void
  setLyricTextSize: (size: MusicLyricTextSize) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleMode: () => void
  setPlaybackRate: (rate: number) => void
  setSleepTimer: (minutes: number | null) => void
  setSleepAfterCurrentTrack: (enabled: boolean) => void
  // Lyric calibration is per track: a positive delta holds the lyrics back.
  nudgeLyricOffset: (trackId: string, deltaMs: number) => void
  resetLyricOffset: (trackId: string) => void
  markLoopStart: () => void
  markLoopEnd: () => void
  clearLoopRange: () => void
  setEqEnabled: (enabled: boolean) => void
  setEqBand: (band: MusicEqBand, db: number) => void
  applyEqPreset: (presetId: MusicEqPresetId) => void
  setNormalizeEnabled: (enabled: boolean) => void
  setCrossfadeEnabled: (enabled: boolean) => void
  addToQueue: (id: string, next?: boolean) => void
  // Returns how many ids were new, so an import can report the rest.
  addManyToQueue: (ids: readonly string[]) => number
  removeFromQueue: (index: number) => void
  moveQueueItem: (from: number, to: number) => void
  clearQueue: () => void
  playQueueAt: (index: number) => Promise<void>

  // `false` means the write never landed; form owners stay open on it.
  patchTrack: (id: string, patch: MusicTrackPatchInput) => Promise<boolean>
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

  createPlaylist: (name: string, description?: string) => Promise<boolean>
  // A text import creates the list and appends its resolved tracks in one flow.
  createPlaylistWithTracks: (name: string, trackIds: readonly string[]) => Promise<boolean>
  renamePlaylist: (id: string, name: string, description?: string) => Promise<boolean>
  deletePlaylist: (id: string) => Promise<void>
  sharePlaylist: (id: string) => Promise<string | null>
  unsharePlaylist: (id: string) => Promise<void>
  setPlaylistCover: (id: string, coverDataUrl: string | null) => Promise<boolean>
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>
  movePlaylistItem: (playlistId: string, itemId: string, delta: number) => Promise<void>
  movePlaylistItemToIndex: (playlistId: string, itemId: string, toIndex: number) => Promise<void>

  uploadFiles: (files: File[], target?: MusicTransferTarget) => Promise<void>
  dismissUpload: (id: string) => void
  downloadTracks: (ids: string[]) => Promise<void>
  dismissDownload: (id: string) => void
  syncOfflineTracks: () => Promise<void>
  openTrash: () => Promise<void>
  loadAlistServers: () => Promise<void>
  browseAlist: (serverId: string, path: string) => Promise<void>
  searchAlist: (serverId: string, keywords: string) => Promise<MusicAlistEntry[]>
  importAlistTrack: (serverId: string, entry: MusicAlistEntry) => Promise<void>
  importAlistFolder: () => Promise<void>
  createAlistServer: (input: MusicAlistCreateInput) => Promise<boolean>
  patchAlistServer: (id: string, patch: MusicAlistPatchInput) => Promise<boolean>
  deleteAlistServer: (id: string) => Promise<void>
  closeTrash: () => void
  restoreFromTrash: (id: string) => Promise<void>
  purgeTrashEntry: (id: string) => Promise<void>
  toggleTrackOffline: (id: string) => Promise<void>
  setTracksOffline: (ids: string[], enabled: boolean) => Promise<void>
  dismissLibraryJob: (kind: MusicLibraryJobKind) => void
  setTransfersOpen: (open: boolean) => void
  setUploadTarget: (target: MusicTransferTarget) => void

  browseWebdav: (path: string) => Promise<void>
  importWebdavTrack: (entry: MusicWebdavEntry) => Promise<void>
  importTrackFromUrl: (input: { url: string; title?: string; artist?: string }) => Promise<boolean>
  importWebdavFolder: () => Promise<void>
  deleteWebdavFiles: (paths: string[]) => Promise<void>

  setImmersive: (open: boolean) => void
  toggleFloating: () => void
  toggleFloatingCollapsed: () => void
  setFloatingPosition: (position: { x: number; y: number }) => void
}
