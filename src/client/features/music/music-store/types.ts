import type { StoreApi } from 'zustand'
import type { MusicProviderTrack, MusicAlistCreateInput, MusicAlistEntry, MusicAlistPatchInput, MusicAlistServerView, MusicPodcastCreateInput, MusicPodcastEpisode, MusicPodcastFeedView, MusicPodcastPatchInput, MusicTrashEntry } from '../../../lib/api'
import type {
  MusicPlayMode, MusicPlaylistDetail, MusicSource, MusicStats, MusicTag, MusicTrack, MusicWebdavEntry,
} from '@shared/types'
import type { MusicEqPresetId } from '../music-eq-presets'
import type { MusicProviderQuality } from '@shared/constants'

export type MusicSort = 'recent' | 'title' | 'artist' | 'album' | 'duration' | 'plays'
export type MusicSortDirection = 'asc' | 'desc'
export type MusicViewMode = 'list' | 'grid'
// FB-F3: the filter follows the library rather than a list of two that predates the
// reference sources — every `MusicSource` the account can hold is filterable.
export type MusicSourceFilter = 'all' | MusicSource
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

// REF-1b: the windowed hub's own geometry. Every field is optional: `{}` means the
// dialog keeps its designed size and sits centred.
export interface MusicHubGeometry {
  dx?: number
  dy?: number
  width?: number
  height?: number
}

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
  /** FB-R1: true once the reader has picked the view themselves; the narrow default only applies
   *  while this is false, so a resize can never overrule a choice. */
  viewModeChosen: boolean
  /** FB-PF2: how many matches the capped grid may draw. Session state — the default is the budget
   *  the grid has always used, and the reader raises it from the "matches left out" notice. */
  matchLimit: number
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
  hubMaximized: boolean
  hubGeometry: MusicHubGeometry
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
  /** FB-U6: the last listing's failure, so the panel can tell it apart from an empty account. */
  alistServersError: string | null
  podcastFeeds: MusicPodcastFeedView[]
  podcastFeedsLoading: boolean
  podcastFeedsError: string | null
  providerEnabled: Record<string, boolean>
  /** FB-F7: what the stream URL asks the proxy for; only provider rows carry it. */
  providerQuality: MusicProviderQuality
  /** FB-S6: set once the reader has read the notice about third-party catalogues. */
  providerNoticeAccepted: boolean
  /** Whether the source badge is painted on rows and cards. */
  showSourceBadge: boolean
  providerResults: MusicProviderTrack[] | null
  providerSearching: boolean
  providerKeywords: string
  /** FB-F6: the catalogues that did not answer the last search, by upstream source id. */
  providerFailedSources: string[]
  /** FB-F8: whether a failed provider play is re-served from another catalogue by itself. */
  providerAutoSwap: boolean
  /** FB-F8: the row whose source is being chosen, and what the catalogues offered for it. */
  sourceSwitchTrackId: string | null
  sourceSwitchCandidates: MusicProviderTrack[] | null
  sourceSwitchLoading: boolean
  sourceSwitchFailed: boolean
  podcastEpisodesFeedId: string | null
  podcastEpisodes: MusicPodcastEpisode[]
  podcastEpisodesLoading: boolean
  podcastEpisodesError: string | null
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
  setDefaultViewMode: (mode: MusicViewMode) => void
  showMoreMatches: () => void
  openTrackMenu: (menu: TrackMenuRequest) => void
  closeTrackMenu: () => void
  setSourceFilter: (filter: MusicSourceFilter) => void
  setProviderQuality: (quality: MusicProviderQuality) => void
  acceptProviderNotice: () => void
  setShowSourceBadge: (visible: boolean) => void
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
  setFloatingVisible: (visible: boolean) => void
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
  setProviderEnabled: (providerId: string, enabled: boolean) => void
  searchProviders: (keywords: string) => Promise<void>
  playProviderTrack: (hit: MusicProviderTrack) => Promise<void>
  /** FB-F10: registers the hit in the library without handing it to the player. */
  addProviderTrack: (hit: MusicProviderTrack) => Promise<boolean>
  /** FB-F10: adds a selection one hit at a time, reporting what landed and what did not. */
  addProviderTracks: (hits: MusicProviderTrack[]) => Promise<{ added: number; failed: number }>
  /** FB-F8: the automatic repair of a dead online link, switchable from the settings page. */
  setProviderAutoSwap: (value: boolean) => void
  /** FB-F8: asks the catalogues what else they have under this row's name. */
  openSourceSwitch: (trackId: string) => Promise<void>
  closeSourceSwitch: () => void
  /** FB-F8: re-serves the row from the chosen hit, in the place it already occupies. */
  switchTrackSource: (hit: MusicProviderTrack) => Promise<void>
  loadPodcastFeeds: () => Promise<void>
  loadPodcastEpisodes: (feedId: string) => Promise<void>
  closePodcastEpisodes: () => void
  importPodcastOpml: (opml: string) => Promise<void>
  playPodcastEpisode: (feed: MusicPodcastFeedView, episode: MusicPodcastEpisode) => Promise<void>
  createPodcastFeed: (input: MusicPodcastCreateInput) => Promise<boolean>
  renamePodcastFeed: (id: string, patch: MusicPodcastPatchInput) => Promise<void>
  deletePodcastFeed: (id: string) => Promise<void>
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
  setHubMaximized: (maximized: boolean) => void
  setHubGeometry: (geometry: MusicHubGeometry) => void
}
