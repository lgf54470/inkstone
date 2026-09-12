import type { Hono } from 'hono'
import type { MusicLibrary, MusicStats } from '@shared/types'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { attachTagIds, toPlaylist, toPlaylistItem, toTag } from './rows'
import type { MusicPlaylistItemRow, MusicPlaylistRow, MusicTagRow, MusicTrackRow } from './rows'

export function registerMusicLibraryRoutes(routes: Hono<AppBindings>): void {
  routes.get('/library', requireAuth, async (c) => {
    const userId = c.get('userId')
    const [tracks, tags, playlists, items] = await Promise.all([
      loadTracks(c.env.DB, userId),
      loadTags(c.env.DB, userId),
      loadPlaylists(c.env.DB, userId),
      loadPlaylistItems(c.env.DB, userId),
    ])
    const itemsByPlaylist = new Map<string, MusicPlaylistItemRow[]>()
    for (const item of items) {
      const list = itemsByPlaylist.get(item.playlist_id)
      if (list) list.push(item)
      else itemsByPlaylist.set(item.playlist_id, [item])
    }
    const library: MusicLibrary = {
      tracks,
      tags,
      playlists: playlists.map((row) => toPlaylist(row, (itemsByPlaylist.get(row.id) ?? []).map(toPlaylistItem))),
      stats: summarize(tracks, tags.length, playlists.length),
    }
    return c.json(library)
  })
}

async function loadTracks(db: D1Database, userId: string): Promise<ReturnType<typeof attachTagIds>> {
  const [trackRows, tagRows] = await Promise.all([
    db.prepare(
      `SELECT id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, cover_url, lyric,
              is_favorite, is_pinned, play_count, created_at, updated_at
         FROM music_tracks WHERE user_id = ?1
         ORDER BY is_pinned DESC, created_at DESC`,
    ).bind(userId).all<MusicTrackRow>(),
    db.prepare('SELECT track_id, tag_id FROM music_track_tags WHERE user_id = ?1')
      .bind(userId).all<{ track_id: string; tag_id: string }>(),
  ])
  return attachTagIds(trackRows.results, tagRows.results)
}

async function loadTags(db: D1Database, userId: string): Promise<ReturnType<typeof toTag>[]> {
  const rows = await db.prepare(
    `SELECT id, name, color, parent_id, is_pinned, sort_order, created_at
       FROM music_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, sort_order ASC, name ASC`,
  ).bind(userId).all<MusicTagRow>()
  return rows.results.map(toTag)
}

async function loadPlaylists(db: D1Database, userId: string): Promise<MusicPlaylistRow[]> {
  const rows = await db.prepare(
    `SELECT id, name, description, is_pinned, is_favorite, sort_order, created_at, updated_at
       FROM music_playlists WHERE user_id = ?1 ORDER BY is_pinned DESC, sort_order ASC, created_at ASC`,
  ).bind(userId).all<MusicPlaylistRow>()
  return rows.results
}

async function loadPlaylistItems(db: D1Database, userId: string): Promise<MusicPlaylistItemRow[]> {
  const rows = await db.prepare(
    'SELECT id, playlist_id, track_id, sort_order FROM music_playlist_items WHERE user_id = ?1 ORDER BY sort_order ASC, created_at ASC',
  ).bind(userId).all<MusicPlaylistItemRow>()
  return rows.results
}

function summarize(tracks: { isFavorite: boolean; isPinned: boolean; sizeBytes: number; durationMs: number }[], tagCount: number, playlistCount: number): MusicStats {
  const stats: MusicStats = {
    trackCount: tracks.length,
    favoriteCount: 0,
    pinnedCount: 0,
    playlistCount,
    tagCount,
    totalBytes: 0,
    totalDurationMs: 0,
  }
  for (const track of tracks) {
    if (track.isFavorite) stats.favoriteCount += 1
    if (track.isPinned) stats.pinnedCount += 1
    stats.totalBytes += track.sizeBytes
    stats.totalDurationMs += track.durationMs
  }
  return stats
}
