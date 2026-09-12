import type { Context } from 'hono'
import type { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'
import { requireAuth } from '../../middleware/auth'
import { storeCoverObject } from './cover'
import { mimeForFormat, MUSIC_MAX_BYTES, musicObjectKey, resolveMusicFormat, sanitizeCoverUrl } from './keys'
import { toTrack } from './rows'
import type { MusicTrackRow } from './rows'
import { maxUploadBytes, putMusicObject, requireMusicStorage } from './storage'

type FormDataValue = string | File | null

interface UploadFields {
  file: File
  title: string
  artist: string
  album: string
  durationMs: number
  coverUrl: string | null
  tagIds: string[]
}

export function registerMusicUploadRoutes(routes: Hono<AppBindings>): void {
  routes.post('/tracks', requireAuth, async (c) => {
    const userId = c.get('userId')
    await enforceUploadThrottle(c.env.DB, userId)
    const fields = await readUploadFields(c)
    const storage = requireMusicStorage(c.env)
    const format = resolveMusicFormat(fields.file.name, fields.file.type)
    if (!format) throw ApiError.badRequest('Unsupported audio format')
    assertUploadSize(fields.file.size, storage)
    await assertQuota(c.env.DB, userId, fields.file.size)

    const id = newId()
    const now = Date.now()
    const mime = mimeForFormat(format)
    const key = musicObjectKey(format, id, now)
    const bytes = new Uint8Array(await fields.file.arrayBuffer())
    await putMusicObject(c.env, storage, key, bytes, mime)

    const row: MusicTrackRow = {
      id,
      title: fields.title || stripExtension(fields.file.name),
      artist: fields.artist,
      album: fields.album,
      duration_ms: fields.durationMs,
      source: 'r2',
      object_key: key,
      mime,
      size_bytes: bytes.byteLength,
      cover_url: await storeCoverObject(c.env, id, now, fields.coverUrl),
      lyric: null,
      is_favorite: 0,
      is_pinned: 0,
      play_count: 0,
      created_at: now,
      updated_at: now,
    }
    try {
      await insertTrack(c.env.DB, userId, row, fields.tagIds)
    } catch (error) {
      await rollbackUpload(c.env, storage, key)
      throw error
    }
    return c.json(toTrack(row, fields.tagIds), 201)
  })
}

async function rollbackUpload(env: AppBindings['Bindings'], storage: ReturnType<typeof requireMusicStorage>, key: string): Promise<void> {
  try {
    const { deleteMusicObjects } = await import('./storage')
    await deleteMusicObjects(env, storage, [key])
  } catch (error) {
    console.error('[inkstone] music upload rollback failed:', error)
  }
}

async function insertTrack(db: D1Database, userId: string, row: MusicTrackRow, tagIds: string[]): Promise<void> {
  const statements = [
    db.prepare(
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    ).bind(
      row.id, userId, row.title, row.artist, row.album, row.duration_ms, row.source, row.object_key, row.mime, row.size_bytes,
      row.cover_url, row.lyric, row.is_favorite, row.is_pinned, row.play_count, row.created_at, row.updated_at,
    ),
    ...tagIds.map((tagId) =>
      db.prepare('INSERT OR IGNORE INTO music_track_tags (user_id, track_id, tag_id) VALUES (?1, ?2, ?3)')
        .bind(userId, row.id, tagId),
    ),
  ]
  await db.batch(statements)
}

async function readUploadFields(c: Context<AppBindings>): Promise<UploadFields> {
  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.music)
  const file = form.get('file')
  if (!(file instanceof File)) throw ApiError.badRequest('Missing file field')
  return {
    file,
    title: readText(form, 'title', LIMITS.musicTitleMaxLength),
    artist: readText(form, 'artist', LIMITS.musicArtistMaxLength),
    album: readText(form, 'album', LIMITS.musicAlbumMaxLength),
    durationMs: readDuration(form.get('durationMs')),
    coverUrl: sanitizeCoverUrl(readText(form, 'coverUrl', 400_000)),
    tagIds: readTagIds(form.get('tagIds')),
  }
}

function readText(form: FormData, key: string, max: number): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readDuration(value: FormDataValue): number {
  if (typeof value !== 'string') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function readTagIds(value: FormDataValue): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))].slice(0, 50)
  } catch {
    throw ApiError.badRequest('tagIds must be a JSON array of tag ids')
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot > 0 ? filename.slice(0, dot) : filename).slice(0, LIMITS.musicTitleMaxLength) || 'Untitled track'
}

function assertUploadSize(size: number, storage: ReturnType<typeof requireMusicStorage>): void {
  if (size > MUSIC_MAX_BYTES) throw ApiError.tooLarge('The audio file exceeds the 64 MB limit')
  if (size > maxUploadBytes(storage)) {
    throw ApiError.tooLarge('This deployment stores music in KV, which caps a single file at 25 MB')
  }
  if (size === 0) throw ApiError.badRequest('The audio file is empty')
}

async function assertQuota(db: D1Database, userId: string, incoming: number): Promise<void> {
  const row = await db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM music_tracks WHERE user_id = ?1')
    .bind(userId).first<{ bytes: number }>()
  if ((row?.bytes ?? 0) + incoming > LIMITS.musicQuotaBytes) {
    throw ApiError.tooLarge('The music storage quota has been reached')
  }
}

async function enforceUploadThrottle(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `music-upload:${userId}`,
      maxAttempts: LIMITS.musicUploadsPerHour,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many uploads. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}

export type { MusicTrack }
