import type { Context } from 'hono'
import type { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import type { AppBindings } from '../../env'
import { sha256Hex } from '../../lib/encoding'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'
import { requireAuth } from '../../middleware/auth'
import { storeCoverObject } from './cover'
import { MUSIC_MAX_BYTES, musicObjectKey, resolveMusicTrackType, sanitizeCoverUrl } from './keys'
import type { MusicTrackType } from './keys'
import { storedMusicBytes } from './quota'
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
  lyric: string | null
  tagIds: string[]
}

export function registerMusicUploadRoutes(routes: Hono<AppBindings>): void {
  routes.post('/tracks', requireAuth, async (c) => {
    const userId = c.get('userId')
    await enforceUploadThrottle(c.env.DB, userId)
    const fields = await readUploadFields(c)
    const storage = requireMusicStorage(c.env)
    const trackType = resolveMusicTrackType(fields.file.name, fields.file.type)
    if (!trackType) throw ApiError.badRequest('Unsupported media format')
    assertUploadSize(fields.file.size, storage)
    await assertQuota(c.env.DB, userId, fields.file.size)
    const row = await storeUploadedTrack(c.env, storage, fields, trackType)
    await commitUpload(c.env, storage, userId, row, fields.tagIds)
    return c.json(toTrack(row, fields.tagIds), 201)
  })
}

async function storeUploadedTrack(
  env: AppBindings['Bindings'],
  storage: ReturnType<typeof requireMusicStorage>,
  fields: UploadFields,
  trackType: MusicTrackType,
): Promise<MusicTrackRow> {
  const id = newId()
  const now = Date.now()
  const key = musicObjectKey(trackType.format, id, now)
  const bytes = new Uint8Array(await fields.file.arrayBuffer())
  await putMusicObject(env, storage, key, bytes, trackType.mime)
  return {
    id,
    title: fields.title || stripExtension(fields.file.name),
    artist: fields.artist,
    album: fields.album,
    duration_ms: fields.durationMs,
    source: 'r2',
    object_key: key,
    mime: trackType.mime,
    size_bytes: bytes.byteLength,
    cover_url: await storeCoverObject(env, id, now, fields.coverUrl),
    lyric: fields.lyric,
    is_favorite: 0,
    is_pinned: 0,
    play_count: 0,
    last_played_at: null,
    content_hash: await sha256Hex(bytes),
    created_at: now,
    updated_at: now,
  }
}

// The row only stays when the ledger still fits after it landed. The pre-check reads a
// snapshot, so two uploads in flight can both pass it and both write; reading again now
// and unwinding this one keeps the quota true for whoever committed first.
async function commitUpload(
  env: AppBindings['Bindings'],
  storage: ReturnType<typeof requireMusicStorage>,
  userId: string,
  row: MusicTrackRow,
  tagIds: string[],
): Promise<void> {
  try {
    await insertTrack(env.DB, userId, row, tagIds)
    if ((await storedMusicBytes(env.DB, userId)) > LIMITS.musicQuotaBytes) {
      await discardTrackRow(env.DB, userId, row.id)
      throw ApiError.storageQuotaReached('The music storage quota has been reached')
    }
  } catch (error) {
    await rollbackUpload(env, storage, row.object_key)
    throw error
  }
}

// The row a compensation decided not to keep: the object is released by the caller's
// rollback, so this only has to take the ledger back to what it was.
async function discardTrackRow(db: D1Database, userId: string, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM music_track_tags WHERE user_id = ?1 AND track_id = ?2').bind(userId, id),
    db.prepare('DELETE FROM music_tracks WHERE user_id = ?1 AND id = ?2').bind(userId, id),
  ])
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
         cover_url, lyric, is_favorite, is_pinned, play_count, content_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    ).bind(
      row.id, userId, row.title, row.artist, row.album, row.duration_ms, row.source, row.object_key, row.mime, row.size_bytes,
      row.cover_url, row.lyric, row.is_favorite, row.is_pinned, row.play_count, row.content_hash, row.created_at, row.updated_at,
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
    lyric: readText(form, 'lyric', LIMITS.musicLyricMaxBytes) || null,
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

export function assertUploadSize(size: number, storage: ReturnType<typeof requireMusicStorage>): void {
  if (size > MUSIC_MAX_BYTES) throw ApiError.mediaTooLarge('The media file exceeds the 64 MB limit')
  if (size > maxUploadBytes(storage)) {
    throw ApiError.mediaTooLarge('This deployment stores music in KV, which caps a single file at 25 MB')
  }
  if (size === 0) throw ApiError.badRequest('The media file is empty')
}

async function assertQuota(db: D1Database, userId: string, incoming: number): Promise<void> {
  if ((await storedMusicBytes(db, userId)) + incoming > LIMITS.musicQuotaBytes) {
    throw ApiError.storageQuotaReached('The music storage quota has been reached')
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
