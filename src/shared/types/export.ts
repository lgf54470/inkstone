import type { MusicPlaylist, MusicPlaylistItem, MusicSource, MusicTag } from './music'
import type { Folder, Note, Tag } from './notes'

export interface ExportBundle {

  format: string
  version: 1
  exportedAt: number
  user: { login: string; name: string }
  folders: Folder[]
  tags: Tag[]
  notes: Note[]

  attachments: ExportAttachment[]
  // M-53b: additive and optional - older exporters simply omit the key, and the
  // restore treats a missing section as "nothing to do".
  music?: ExportBundleMusic
}

// Metadata-level snapshot of the music library: every D1 row except playback
// position. Audio bytes live in R2/WebDAV and are deliberately out of reach of
// the 64MB import limit, so restoring re-links the rows, not the files.
export interface ExportBundleMusic {
  tracks: ExportedMusicTrack[]
  tags: MusicTag[]
  playlists: MusicPlaylist[]
  playlistItems: ExportedMusicPlaylistItem[]
}

// Like the view model plus the add timestamp the restore needs to keep rows
// byte-faithful; the API payload itself never carries it.
export interface ExportedMusicPlaylistItem extends MusicPlaylistItem {
  createdAt: number
}

export interface ExportedMusicTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  source: MusicSource
  // R2 key or WebDAV remote path; re-validated row-by-row at restore time.
  objectKey: string
  mime: string
  sizeBytes: number
  coverUrl: string | null
  lyric: string | null
  isFavorite: boolean
  isPinned: boolean
  playCount: number
  lastPlayedAt: number | null
  contentHash: string | null
  tagIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ExportAttachment {
  id: string
  noteId: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  createdAt: number
  path: string
  sha256: string
}

export interface ImportResult {
  createdNotes: number
  updatedNotes: number
  skippedNotes: number
  createdFolders: number
  createdAttachments: number
  skippedAttachments: number
  warnings: string[]
}
