
export type MusicPlayMode = 'order' | 'repeat-all' | 'repeat-one' | 'shuffle'

export type MusicFormat = 'mp3' | 'm4a' | 'flac' | 'wav' | 'ogg' | 'opus' | 'aac' | 'webm'

export type MusicSource = 'r2' | 'webdav'

export interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  source: MusicSource
  objectKey: string
  mime: string
  sizeBytes: number
  coverUrl: string | null
  lyric: string | null
  tagIds: string[]
  isFavorite: boolean
  isPinned: boolean
  playCount: number
  createdAt: number
  updatedAt: number
}

export interface MusicTag {
  id: string
  name: string
  color: string | null
  parentId: string | null
  isPinned: boolean
  sortOrder: number
  createdAt: number
}

export interface MusicPlaylist {
  id: string
  name: string
  description: string
  isPinned: boolean
  isFavorite: boolean
  trackCount: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface MusicPlaylistItem {
  id: string
  playlistId: string
  trackId: string
  sortOrder: number
}

export interface MusicPlaylistDetail extends MusicPlaylist {
  items: MusicPlaylistItem[]
}

export interface MusicPlayback {
  queue: string[]
  currentIndex: number
  positionMs: number
  tracks: MusicTrack[]
}

export interface MusicPlaybackInput {
  queue: string[]
  currentIndex: number
  positionMs: number
}

export interface MusicStats {
  trackCount: number
  favoriteCount: number
  pinnedCount: number
  playlistCount: number
  tagCount: number
  totalBytes: number
  totalDurationMs: number
}

export interface MusicLibrary {
  tracks: MusicTrack[]
  tags: MusicTag[]
  playlists: MusicPlaylistDetail[]
  stats: MusicStats
}

export interface MusicWebdavEntry {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number
  mime: string | null
  modifiedAt: number | null
}

export interface MusicSearchResponse {
  trackIds: string[]
  query: string
}