import type { StoreApi } from 'zustand'
import type {
  MusicPlayMode, MusicPlaylistDetail, MusicStats, MusicTag, MusicTrack, MusicWebdavEntry,
} from '@shared/types'

export type MusicSort = 'recent' | 'title' | 'artist' | 'plays'
export type MusicViewMode = 'list' | 'grid'
export type MusicSourceFilter = 'all' | 'r2' | 'webdav'
export type MusicBatch = 'favorite' | 'unfavorite' | 'pin' | 'unpin' | 'delete'

export type MusicTrackPatchInput = Partial<MusicTrack> & { tagIds?: string[]; coverDataUrl?: string | null }

export type MusicScope =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'pinned' }
  | { kind: 'recent' }
  | { kind: 'tag'; tagId: string }
  | { kind: 'playlist'; playlistId: string }

export type MusicTransferTarget = 'r2' | 'webdav'

export interface MusicUploadTask {
  id: string
  name: string
  percent: number
  status: 'uploading' | 'done' | 'failed'
  error: string | null
  target: MusicTransferTarget
}

export interface MusicDownloadTask {
  id: string
  name: string
  percent: number
  status: 'downloading' | 'done' | 'failed'
}

export interface MusicWebdavState {
  loading: boolean
  configured: boolean
  dir: string
  directory: string
  path: string
  entries: MusicWebdavEntry[]
  error: string | null
  importingPath: string | null
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

  scope: MusicScope
  query: string
  sort: MusicSort
  viewMode: MusicViewMode
  sourceFilter: MusicSourceFilter
  selectedIds: string[]
  searchHistory: string[]
  romanized: Record<string, string>

  queue: string[]
  currentIndex: number
  isPlaying: boolean
  streamLoading: boolean
  currentTimeMs: number
  durationMs: number
  volume: number
  muted: boolean
  mode: MusicPlayMode
  playbackRate: number
  recentIds: string[]
  sleepEndsAt: number | null

  floatingVisible: boolean
  floatingCollapsed: boolean
  floatingPosition: { x: number; y: number } | null
  immersive: boolean
  uploads: MusicUploadTask[]
  downloads: MusicDownloadTask[]
  uploadTarget: MusicTransferTarget
  transfersOpen: boolean
  webdav: MusicWebdavState

  loadLibrary: () => Promise<void>
  setScope: (scope: MusicScope) => void
  setQuery: (query: string) => void
  commitQuery: (query: string) => void
  clearSearchHistory: () => void
  setSort: (sort: MusicSort) => void
  setViewMode: (mode: MusicViewMode) => void
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
  addToQueue: (id: string, next?: boolean) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  playQueueAt: (index: number) => Promise<void>

  patchTrack: (id: string, patch: MusicTrackPatchInput) => Promise<void>
  refreshTrackMetadata: (ids: string[]) => Promise<number>
  matchMissingCovers: () => Promise<number>
  toggleFavorite: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  deleteTrack: (id: string) => Promise<void>
  batchTracks: (action: MusicBatch) => Promise<void>

  createTag: (name: string, color?: string | null) => Promise<void>
  patchTag: (id: string, patch: { name?: string; color?: string | null; isPinned?: boolean }) => Promise<void>
  deleteTag: (id: string) => Promise<void>

  createPlaylist: (name: string) => Promise<void>
  renamePlaylist: (id: string, name: string) => Promise<void>
  deletePlaylist: (id: string) => Promise<void>
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>

  uploadFiles: (files: File[], target?: MusicTransferTarget) => Promise<void>
  dismissUpload: (id: string) => void
  downloadTracks: (ids: string[]) => Promise<void>
  dismissDownload: (id: string) => void
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
