
export type MusicPlayMode = 'order' | 'repeat-all' | 'repeat-one' | 'shuffle'

// Video containers are part of this union because `format` names the stored object's
// container (it becomes the storage key extension and the download filename), not
// whether the track is audio or video - that distinction lives in `mime`.
export type MusicFormat = 'mp3' | 'm4a' | 'flac' | 'wav' | 'ogg' | 'opus' | 'aac' | 'webm' | 'mp4' | 'mov'

export type MusicSource = 'r2' | 'webdav'

export interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  source: MusicSource
  format: MusicFormat | null
  webdavPath: string | null
  mime: string
  sizeBytes: number
  coverUrl: string | null
  lyric: string | null
  // The library payload ships without lyric text, so this flag is the only way
  // list views know a track has lyrics worth fetching lazily by id.
  hasLyric: boolean
  tagIds: string[]
  isFavorite: boolean
  isPinned: boolean
  playCount: number
  // FEAT-9: stamped server-side by the play route, so the recently-played list
  // survives a device switch instead of living in one browser's preferences.
  lastPlayedAt: number | null
  // M-53: sha256 of the audio bytes, computed when an upload passes through the
  // worker. Null for rows stored before hashing began and for WebDAV metadata
  // imports, which never move the bytes - those tracks stay out of the duplicates view.
  contentHash: string | null
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
  // M-51: set when the owner shares this playlist publicly; null means not shared.
  shareSlug: string | null
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

// Listening re-saves the position every few seconds while the queue itself rarely
// moves, so the two travel separately: this one never carries the queue array.
export interface MusicPlaybackPositionInput {
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