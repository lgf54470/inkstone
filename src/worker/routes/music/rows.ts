import type { MusicPlaylist, MusicPlaylistDetail, MusicPlaylistItem, MusicStats, MusicTag, MusicTrack } from '@shared/types'
import { isCoverObjectKey } from './cover'

export interface MusicTrackRow {
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
  created_at: number
  updated_at: number
}

export interface MusicTagRow {
  id: string
  name: string
  color: string | null
  parent_id: string | null
  is_pinned: number
  sort_order: number
  created_at: number
}

export interface MusicPlaylistRow {
  id: string
  name: string
  description: string
  is_pinned: number
  is_favorite: number
  sort_order: number
  created_at: number
  updated_at: number
  track_count?: number
}

export interface MusicPlaylistItemRow {
  id: string
  playlist_id: string
  track_id: string
  sort_order: number
}

export const TRACK_COLUMNS = `t.id, t.title, t.artist, t.album, t.duration_ms, t.source, t.object_key, t.mime,
  t.size_bytes, t.cover_url, t.lyric, t.is_favorite, t.is_pinned, t.play_count, t.created_at, t.updated_at`

export function toTrack(row: MusicTrackRow, tagIds: string[]): MusicTrack {
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
    coverUrl: coverUrlForTrack(row.id, row.cover_url),
    lyric: row.lyric,
    tagIds,
    isFavorite: row.is_favorite === 1,
    isPinned: row.is_pinned === 1,
    playCount: row.play_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function coverUrlForTrack(trackId: string, stored: string | null): string | null {
  if (!stored) return null
  if (stored.startsWith('http://') || stored.startsWith('https://') || stored.startsWith('data:')) return stored
  return isCoverObjectKey(stored) ? `/api/music/tracks/${encodeURIComponent(trackId)}/cover` : null
}

export function toTag(row: MusicTagRow): MusicTag {
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

export function toPlaylistItem(row: MusicPlaylistItemRow): MusicPlaylistItem {
  return { id: row.id, playlistId: row.playlist_id, trackId: row.track_id, sortOrder: row.sort_order }
}

export function toPlaylist(row: MusicPlaylistRow, items: MusicPlaylistItem[]): MusicPlaylistDetail {
  const base: MusicPlaylist = {
    id: row.id,
    name: row.name,
    description: row.description,
    isPinned: row.is_pinned === 1,
    isFavorite: row.is_favorite === 1,
    trackCount: items.length,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  return { ...base, items }
}

export function emptyStats(): MusicStats {
  return { trackCount: 0, favoriteCount: 0, pinnedCount: 0, playlistCount: 0, tagCount: 0, totalBytes: 0, totalDurationMs: 0 }
}

export function attachTagIds(trackRows: MusicTrackRow[], tagRows: Array<{ track_id: string; tag_id: string }>): MusicTrack[] {
  const byTrack = new Map<string, string[]>()
  for (const link of tagRows) {
    const list = byTrack.get(link.track_id)
    if (list) list.push(link.tag_id)
    else byTrack.set(link.track_id, [link.tag_id])
  }
  return trackRows.map((row) => toTrack(row, byTrack.get(row.id) ?? []))
}
