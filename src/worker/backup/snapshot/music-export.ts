import type {
  ExportBundleMusic,
  ExportedMusicPlaylistItem,
  ExportedMusicTrack,
} from '@shared/types'
import type { MusicPlaylist, MusicTag } from '@shared/types'

interface TrackDbRow {
  id: string
  title: string
  artist: string
  album: string
  duration_ms: number
  source: string
  object_key: string
  mime: string
  size_bytes: number
  cover_url: string | null
  lyric: string | null
  is_favorite: number
  is_pinned: number
  play_count: number
  last_played_at: number | null
  content_hash: string | null
  created_at: number
  updated_at: number
}

interface TagDbRow {
  id: string
  name: string
  color: string | null
  parent_id: string | null
  is_pinned: number
  sort_order: number
  created_at: number
}

interface PlaylistDbRow {
  id: string
  name: string
  description: string
  is_pinned: number
  is_favorite: number
  share_slug: string | null
  sort_order: number
  created_at: number
  updated_at: number
  track_count: number
}

interface PlaylistItemDbRow {
  id: string
  playlist_id: string
  track_id: string
  sort_order: number
  created_at: number
}

// The five scans that make up a music export, kept as bound statements so the
// caller runs them in a single batch.
function musicExportStatements(db: D1Database, userId: string): D1PreparedStatement[] {
  return [
    db.prepare(
      `SELECT id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, cover_url, lyric,
              is_favorite, is_pinned, play_count, last_played_at, content_hash, created_at, updated_at
         FROM music_tracks WHERE user_id = ?1 ORDER BY created_at ASC, id ASC`,
    ).bind(userId),
    db.prepare('SELECT track_id, tag_id FROM music_track_tags WHERE user_id = ?1').bind(userId),
    db.prepare(
      `SELECT id, name, color, parent_id, is_pinned, sort_order, created_at
         FROM music_tags WHERE user_id = ?1 ORDER BY created_at ASC, id ASC`,
    ).bind(userId),
    db.prepare(
      `SELECT p.id, p.name, p.description, p.is_pinned, p.is_favorite, p.share_slug, p.sort_order,
              p.created_at, p.updated_at,
              (SELECT COUNT(*) FROM music_playlist_items i WHERE i.playlist_id = p.id AND i.user_id = p.user_id) AS track_count
         FROM music_playlists p WHERE p.user_id = ?1 ORDER BY p.created_at ASC, p.id ASC`,
    ).bind(userId),
    db.prepare(
      `SELECT id, playlist_id, track_id, sort_order, created_at
         FROM music_playlist_items WHERE user_id = ?1 ORDER BY sort_order ASC, created_at ASC`,
    ).bind(userId),
  ]
}

function toExportedTrack(row: TrackDbRow, tagIds: string[]): ExportedMusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    source: row.source === 'webdav' ? 'webdav' : 'r2',
    objectKey: row.object_key,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    coverUrl: row.cover_url,
    lyric: row.lyric,
    isFavorite: row.is_favorite === 1,
    isPinned: row.is_pinned === 1,
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    contentHash: row.content_hash,
    tagIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toExportedTag(row: TagDbRow): MusicTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    parentId: row.parent_id,
    isPinned: row.is_pinned === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

function toExportedPlaylist(row: PlaylistDbRow): MusicPlaylist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPinned: row.is_pinned === 1,
    isFavorite: row.is_favorite === 1,
    shareSlug: row.share_slug,
    trackCount: row.track_count,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toExportedPlaylistItem(row: PlaylistItemDbRow): ExportedMusicPlaylistItem {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    trackId: row.track_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

// M-53b: the music section of a JSON export. Every read is a full-table scan
// bounded by the account's own library - the same shape /api/music/library
// already ships per request, plus the lyric text the API keeps out of payloads.
export async function loadMusicExportSection(db: D1Database, userId: string): Promise<ExportBundleMusic | null> {
  const [tracks, tagLinks, tags, playlists, items] = await db.batch(musicExportStatements(db, userId)) as [
    D1Result<TrackDbRow>,
    D1Result<{ track_id: string; tag_id: string }>,
    D1Result<TagDbRow>,
    D1Result<PlaylistDbRow>,
    D1Result<PlaylistItemDbRow>,
  ]

  const trackRows = tracks.results
  const tagRows = tags.results
  const playlistRows = playlists.results
  const itemRows = items.results
  const linkRows = tagLinks.results
  if (!trackRows.length && !tagRows.length && !playlistRows.length) return null

  const tagIdsByTrack = new Map<string, string[]>()
  for (const link of linkRows) {
    const list = tagIdsByTrack.get(link.track_id)
    if (list) list.push(link.tag_id)
    else tagIdsByTrack.set(link.track_id, [link.tag_id])
  }

  return {
    tracks: trackRows.map((row) => toExportedTrack(row, tagIdsByTrack.get(row.id) ?? [])),
    tags: tagRows.map(toExportedTag),
    playlists: playlistRows.map(toExportedPlaylist),
    playlistItems: itemRows.map(toExportedPlaylistItem),
  }
}
