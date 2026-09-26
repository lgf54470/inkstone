import type { Context, Hono } from 'hono'
import { chunkIds } from '@shared/chunk'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { isDerivedCoverKey } from './cover'
import { isDerivedMusicObjectKey } from './keys'
import { pathParam } from './params'
import type { MusicPlaylistItemRow, MusicPlaylistRow, MusicTrackRow } from './rows'
import { deleteMusicObjects, requireMusicStorage } from './storage'

// FEA-B1: deleting a track or playlist moves it here instead of erasing it — the
// storage bytes are kept until restore, an explicit purge, or the retention window
// closes. The payload is the JSON snapshot the restore replays.
export const MUSIC_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface TrashRow {
  id: string
  user_id: string
  kind: string
  name: string
  payload: string
  deleted_at: number
}

interface TrashPayload {
  track?: MusicTrackRow
  playlist?: MusicPlaylistRow
  items?: MusicPlaylistItemRow[]
}

export function registerMusicTrashRoutes(routes: Hono<AppBindings>): void {
  routes.get('/trash', requireAuth, (c) => listTrash(c))
  routes.post('/trash/:id/restore', requireAuth, (c) => restoreTrash(c))
  routes.delete('/trash/:id', requireAuth, (c) => purgeTrash(c))
}

async function listTrash(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    'SELECT id, kind, name, deleted_at FROM music_trash WHERE user_id = ?1 ORDER BY deleted_at DESC',
  ).bind(c.get('userId')).all<{ id: string; kind: string; name: string; deleted_at: number }>()
  return c.json({
    entries: rows.results.map((row) => ({
      id: row.id,
      kind: row.kind === 'playlist' ? 'playlist' : 'track',
      name: row.name,
      deletedAt: row.deleted_at,
    })),
  })
}

async function restoreTrash(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await loadTrashRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Trash entry not found')
  const payload = parsePayload(row.payload)
  if (row.kind === 'track' && payload.track) {
    await restoreTrack(c.env.DB, userId, payload.track)
  } else if (row.kind === 'playlist' && payload.playlist) {
    await restorePlaylist(c.env.DB, userId, payload.playlist, payload.items ?? [])
  } else {
    throw ApiError.internal('The trash entry payload does not match its kind')
  }
  await c.env.DB.prepare('DELETE FROM music_trash WHERE id = ?1 AND user_id = ?2').bind(id, userId).run()
  return c.json({ ok: true })
}

async function purgeTrash(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await loadTrashRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Trash entry not found')
  await purgeTrashEntry(c.env, row)
  return c.json({ ok: true })
}

function loadTrashRow(db: D1Database, userId: string, id: string): Promise<TrashRow | null> {
  return db.prepare('SELECT id, user_id, kind, name, payload, deleted_at FROM music_trash WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId).first<TrashRow>()
}

function parsePayload(payload: string): TrashPayload {
  try {
    return JSON.parse(payload) as TrashPayload
  } catch (error) {
    console.warn('[inkstone] music trash payload is unreadable:', error)
    return {}
  }
}

async function restoreTrack(db: D1Database, userId: string, track: MusicTrackRow): Promise<void> {
  await db.prepare(
    `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
       cover_url, lyric, is_favorite, is_pinned, play_count, last_played_at, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
  ).bind(
    track.id, userId, track.title, track.artist, track.album, track.duration_ms, track.source, track.object_key,
    track.mime, track.size_bytes, track.cover_url, track.lyric, track.is_favorite, track.is_pinned,
    track.play_count, track.last_played_at, track.content_hash, track.created_at, track.updated_at,
  ).run()
}

// Membership rows whose track is gone would dangle, so only members still in the
// library come back; a purged track's seat is not resurrected.
async function restorePlaylist(db: D1Database, userId: string, playlist: MusicPlaylistRow, items: MusicPlaylistItemRow[]): Promise<void> {
  const statements = [
    db.prepare(
      `INSERT INTO music_playlists (id, user_id, name, description, is_pinned, is_favorite, share_slug, cover_url, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    ).bind(
      playlist.id, userId, playlist.name, playlist.description, playlist.is_pinned, playlist.is_favorite,
      playlist.share_slug, playlist.cover_url, playlist.sort_order, playlist.created_at, playlist.updated_at,
    ),
  ]
  if (items.length) {
    const members = await db.prepare(
      `SELECT id FROM music_tracks WHERE user_id = ?1 AND id IN (${items.map((_, index) => `?${index + 2}`).join(', ')})`,
    ).bind(userId, ...items.map((item) => item.track_id)).all<{ id: string }>()
    const alive = new Set(members.results?.map((row) => row.id) ?? [])
    for (const item of items.filter((entry) => alive.has(entry.track_id))) {
      statements.push(db.prepare(
        `INSERT OR IGNORE INTO music_playlist_items (id, user_id, playlist_id, track_id, sort_order, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(item.id, userId, playlist.id, item.track_id, item.sort_order, item.created_at))
    }
  }
  await db.batch(statements)
}

// Purging reclaims the storage bytes through the same derived-key rule the live
// delete path enforces: only objects this row's own writes produced. A storage
// failure must not strand the row, so the reclaim stays best-effort like every
// other orphan sweep — the entry disappears either way.
async function purgeTrashEntry(env: AppBindings['Bindings'], row: TrashRow): Promise<void> {
  const payload = parsePayload(row.payload)
  const keys = trashObjectKeys(payload)
  if (keys.length) {
    await deleteMusicObjects(env, requireMusicStorage(env), keys).catch((error: unknown) => {
      console.warn('[inkstone] music trash object reclaim failed:', error)
    })
  }
  await env.DB.prepare('DELETE FROM music_trash WHERE id = ?1').bind(row.id).run()
}

function trashObjectKeys(payload: TrashPayload): string[] {
  const keys: string[] = []
  const track = payload.track
  if (track) {
    if (track.source === 'r2' && isDerivedMusicObjectKey(track.id, track.created_at, track.object_key)) {
      keys.push(track.object_key)
    }
    if (isDerivedCoverKey(track.id, track.created_at, track.cover_url)) keys.push(track.cover_url as string)
  }
  const playlist = payload.playlist
  if (playlist && isDerivedCoverKey(playlist.id, playlist.created_at, playlist.cover_url)) {
    keys.push(playlist.cover_url as string)
  }
  return keys
}

// Moves to trash record the entry and drop the library rows in one batch; storage
// objects stay until a purge or the retention sweep. Callers have already read the
// rows, and the chunked deletes mirror the hard-delete path minus the reclaim.
export async function trashTrackRows(
  env: AppBindings['Bindings'],
  userId: string,
  rows: MusicTrackRow[],
  now: number,
): Promise<void> {
  if (!rows.length) return
  const ids = rows.map((row) => row.id)
  const statements: D1PreparedStatement[] = rows.map((row) => env.DB.prepare(
    'INSERT OR REPLACE INTO music_trash (id, user_id, kind, name, payload, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  ).bind(row.id, userId, 'track', row.title, JSON.stringify({ track: row }), now))
  for (const part of chunkIds(ids, LIMITS.musicSqlIdChunkMax)) {
    const placeholders = part.map((_, index) => `?${index + 2}`).join(', ')
    statements.push(
      env.DB.prepare(`DELETE FROM music_track_tags WHERE user_id = ?1 AND track_id IN (${placeholders})`).bind(userId, ...part),
      env.DB.prepare(`DELETE FROM music_playlist_items WHERE user_id = ?1 AND track_id IN (${placeholders})`).bind(userId, ...part),
      env.DB.prepare(`DELETE FROM music_tracks WHERE user_id = ?1 AND id IN (${placeholders})`).bind(userId, ...part),
    )
  }
  await env.DB.batch(statements)
}

export async function trashPlaylistRow(
  env: AppBindings['Bindings'],
  userId: string,
  row: MusicPlaylistRow,
  items: MusicPlaylistItemRow[],
  now: number,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR REPLACE INTO music_trash (id, user_id, kind, name, payload, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(row.id, userId, 'playlist', row.name, JSON.stringify({ playlist: row, items }), now),
    env.DB.prepare('DELETE FROM music_playlist_items WHERE user_id = ?1 AND playlist_id = ?2').bind(userId, row.id),
    env.DB.prepare('DELETE FROM music_playlists WHERE user_id = ?1 AND id = ?2').bind(userId, row.id),
  ])
}

// The retention sweep runs from the cron handler: everything past the window is
// purged for good, bounded per tick so a large backlog cannot blow the budget.
export async function purgeExpiredMusicTrash(env: AppBindings['Bindings']): Promise<void> {
  const rows = await env.DB.prepare(
    'SELECT id, user_id, kind, name, payload, deleted_at FROM music_trash WHERE deleted_at < ?1 LIMIT 200',
  ).bind(Date.now() - MUSIC_TRASH_RETENTION_MS).all<TrashRow>()
  for (const row of rows.results ?? []) {
    await purgeTrashEntry(env, row)
  }
}
