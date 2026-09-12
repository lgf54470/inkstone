import type { Hono } from 'hono'
import type { MusicTrack } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { coverResponse, storeCoverObject } from './cover'
import { isMusicObjectKey } from './keys'
import { TRACK_COLUMNS, toTrack } from './rows'
import type { MusicTrackRow } from './rows'
import { batchTrackSchema, patchTrackSchema } from './schemas'
import { requireMusicStorage } from './storage'
import { streamTrackResponse } from './stream'
import { pathParam } from './params'

export function registerMusicTrackRoutes(routes: Hono<AppBindings>): void {
  registerCoverRoute(routes)
  registerStreamRoute(routes)
  registerPatchRoute(routes)
  registerPlayRoute(routes)
  registerBatchRoute(routes)
  registerDeleteRoute(routes)
}

function registerStreamRoute(routes: Hono<AppBindings>): void {
  routes.get('/tracks/:id/stream', requireAuth, async (c) => {
    const row = await loadTrackRow(c.env.DB, c.get('userId'), pathParam(c, 'id'))
    if (!row) throw ApiError.notFound('Track not found')
    const owner = { userId: c.get('userId'), settingsRaw: c.get('user').settingsRaw }
    return streamTrackResponse(c, row, owner, {
      download: Boolean(c.req.query('download')),
      cacheControl: 'private, max-age=3600',
    })
  })
}

function registerPatchRoute(routes: Hono<AppBindings>): void {
  routes.patch('/tracks/:id', requireAuth, async (c) => {
    const userId = c.get('userId')
    const id = pathParam(c, 'id')
    if (!(await loadTrackRow(c.env.DB, userId, id))) throw ApiError.notFound('Track not found')
    const body = await readJsonValidated(c, patchTrackSchema, JSON_BODY_LIMITS.musicTrack)
    const row = await loadTrackRow(c.env.DB, userId, id)
    if (body.coverDataUrl !== undefined && row) {
      // Scanned artwork replaces the stored object; a decode failure keeps the previous cover.
      const key = await storeCoverObject(c.env, id, row.created_at, body.coverDataUrl)
      body.coverUrl = key ?? body.coverUrl
    }

    await updateTrackRow(c.env.DB, userId, id, body)
    if (body.tagIds) await replaceTrackTags(c.env.DB, userId, id, body.tagIds)
    const updated = await loadTrack(c.env.DB, userId, id)
    return c.json(updated)
  })
}

function registerPlayRoute(routes: Hono<AppBindings>): void {
  routes.post('/tracks/:id/play', requireAuth, async (c) => {
    const result = await c.env.DB.prepare(
      'UPDATE music_tracks SET play_count = play_count + 1 WHERE id = ?1 AND user_id = ?2',
    ).bind(pathParam(c, 'id'), c.get('userId')).run()
    return c.json({ ok: true, counted: Boolean(result.meta.changes) })
  })
}

function registerBatchRoute(routes: Hono<AppBindings>): void {
  routes.post('/tracks/batch', requireAuth, async (c) => {
    const userId = c.get('userId')
    const { ids, action } = await readJsonValidated(c, batchTrackSchema, JSON_BODY_LIMITS.small)
    const keys = await loadOwnedObjectKeys(c.env.DB, userId, ids)
    if (action === 'delete') {
      await deleteTracks(c.env, userId, ids, keys)
      return c.json({ ok: true, updated: ids.length })
    }
    const column = action === 'favorite' || action === 'unfavorite' ? 'is_favorite' : 'is_pinned'
    const value = action === 'favorite' || action === 'pin' ? 1 : 0
    await setFlagForTracks(c.env.DB, userId, ids, column, value)
    return c.json({ ok: true, updated: ids.length })
  })
}

function registerDeleteRoute(routes: Hono<AppBindings>): void {
  routes.delete('/tracks/:id', requireAuth, async (c) => {
    const userId = c.get('userId')
    const id = pathParam(c, 'id')
    const keys = await loadOwnedObjectKeys(c.env.DB, userId, [id])
    if (!keys.length) throw ApiError.notFound('Track not found')
    await deleteTracks(c.env, userId, [id], keys)
    return c.json({ ok: true })
  })
}

function registerCoverRoute(routes: Hono<AppBindings>): void {
  routes.get('/tracks/:id/cover', requireAuth, async (c) => {
    const row = await loadTrackRow(c.env.DB, c.get('userId'), pathParam(c, 'id'))
    if (!row) throw ApiError.notFound('Cover not found')
    return coverResponse(c.env, row)
  })
}


async function deleteTracks(env: AppBindings['Bindings'], userId: string, ids: string[], keys: string[]): Promise<void> {
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(', ')
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM music_track_tags WHERE user_id = ?1 AND track_id IN (${placeholders})`).bind(userId, ...ids),
    env.DB.prepare(`DELETE FROM music_playlist_items WHERE user_id = ?1 AND track_id IN (${placeholders})`).bind(userId, ...ids),
    env.DB.prepare(`DELETE FROM music_tracks WHERE user_id = ?1 AND id IN (${placeholders})`).bind(userId, ...ids),
  ])
  const localKeys = keys.filter((key) => isMusicObjectKey(key))
  if (localKeys.length) {
    const { deleteMusicObjects } = await import('./storage')
    await deleteMusicObjects(env, requireMusicStorage(env), localKeys).catch((error: unknown) => {
      console.warn('[inkstone] music object cleanup failed:', error)
    })
  }
}

async function setFlagForTracks(db: D1Database, userId: string, ids: string[], column: string, value: number): Promise<void> {
  if (!isFlagColumn(column)) throw ApiError.internal('Unsupported track flag')
  const placeholders = ids.map((_, index) => `?${index + 4}`).join(', ')
  await db.prepare(
    `UPDATE music_tracks SET ${column} = ?1, updated_at = ?2 WHERE user_id = ?3 AND id IN (${placeholders})`,
  ).bind(value, Date.now(), userId, ...ids).run()
}

function isFlagColumn(column: string): column is 'is_favorite' | 'is_pinned' {
  return column === 'is_favorite' || column === 'is_pinned'
}

async function loadOwnedObjectKeys(db: D1Database, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const placeholders = ids.map((_, index) => `?${index + 2}`).join(', ')
  const rows = await db.prepare(
    `SELECT object_key FROM music_tracks WHERE user_id = ?1 AND id IN (${placeholders})`,
  ).bind(userId, ...ids).all<{ object_key: string }>()
  return rows.results.map((row) => row.object_key).filter((key) => key.length > 0)
}

async function loadTrackRow(db: D1Database, userId: string, id: string): Promise<MusicTrackRow | null> {
  return db.prepare(
    `SELECT id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, cover_url, lyric,
            is_favorite, is_pinned, play_count, created_at, updated_at
       FROM music_tracks WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<MusicTrackRow>()
}

async function loadTrack(db: D1Database, userId: string, id: string): Promise<MusicTrack> {
  const [row, tagRows] = await Promise.all([
    loadTrackRow(db, userId, id),
    db.prepare('SELECT tag_id FROM music_track_tags WHERE user_id = ?1 AND track_id = ?2')
      .bind(userId, id).all<{ tag_id: string }>(),
  ])
  if (!row) throw ApiError.notFound('Track not found')
  return toTrack(row, tagRows.results.map((link) => link.tag_id))
}

interface TrackPatch {
  title?: string
  artist?: string
  album?: string
  durationMs?: number
  coverUrl?: string | null
  lyric?: string | null
  isFavorite?: boolean
  isPinned?: boolean
}

const PATCH_COLUMNS: Array<[keyof TrackPatch, string]> = [
  ['title', 'title'],
  ['artist', 'artist'],
  ['album', 'album'],
  ['durationMs', 'duration_ms'],
  ['coverUrl', 'cover_url'],
  ['lyric', 'lyric'],
  ['isFavorite', 'is_favorite'],
  ['isPinned', 'is_pinned'],
]

async function updateTrackRow(db: D1Database, userId: string, id: string, patch: TrackPatch): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  for (const [key, column] of PATCH_COLUMNS) {
    const raw = patch[key]
    if (raw === undefined) continue
    assignments.push(`${column} = ?${values.length + 1}`)
    values.push(typeof raw === 'boolean' ? Number(raw) : raw)
  }
  if (!assignments.length) return
  assignments.push(`updated_at = ?${values.length + 1}`)
  values.push(Date.now(), userId, id)
  await db.prepare(
    `UPDATE music_tracks SET ${assignments.join(', ')} WHERE user_id = ?${values.length - 1} AND id = ?${values.length}`,
  ).bind(...values).run()
}

async function replaceTrackTags(db: D1Database, userId: string, trackId: string, tagIds: string[]): Promise<void> {
  const owned = await db.prepare('SELECT id FROM music_tags WHERE user_id = ?1').bind(userId).all<{ id: string }>()
  const ownedIds = new Set(owned.results.map((row) => row.id))
  const accepted = [...new Set(tagIds)].filter((tagId) => ownedIds.has(tagId))
  await db.batch([
    db.prepare('DELETE FROM music_track_tags WHERE user_id = ?1 AND track_id = ?2').bind(userId, trackId),
    ...accepted.map((tagId) =>
      db.prepare('INSERT OR IGNORE INTO music_track_tags (user_id, track_id, tag_id) VALUES (?1, ?2, ?3)')
        .bind(userId, trackId, tagId),
    ),
  ])
}

export { TRACK_COLUMNS }