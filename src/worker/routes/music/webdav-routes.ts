import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { FORM_BODY_LIMITS, JSON_BODY_LIMITS, readFormDataWithinLimit, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { coverObjectKey, decodeCoverDataUrl } from './cover'
import { mimeForFormat, resolveMusicFormat } from './keys'
import { toTrack } from './rows'
import type { MusicTrackRow } from './rows'
import { importMusicSchema, webdavPathSchema } from './schemas'
import { childUrl } from '../../backup/webdav'
import { deleteMusicObject, ensureMusicDir, listMusicDirectory, putMusicObject, resolveMusicWebdav, statMusicObject } from './webdav'
import { putMusicObject as putStoredMusicObject, requireMusicStorage } from './storage'

export function registerMusicWebdavRoutes(routes: Hono<AppBindings>): void {
  routes.get('/webdav', requireAuth, (c) => browse(c))
  routes.post('/webdav/import', requireAuth, (c) => importTrack(c))
  routes.post('/webdav/upload', requireAuth, (c) => uploadTrack(c))
  routes.delete('/webdav/object', requireAuth, (c) => removeObject(c))
}

async function removeObject(c: Context<AppBindings>): Promise<Response> {
  const parsed = webdavPathSchema.safeParse({ path: c.req.query('path') ?? '' })
  if (!parsed.success || !parsed.data.path) throw ApiError.badRequest('path: a relative path is required')
  const ctx = await resolveMusicWebdav(c.env, c.get('user'), c.get('userId'))
  await deleteMusicObject(ctx, parsed.data.path)
  return c.json({ ok: true })
}

async function browse(c: Context<AppBindings>): Promise<Response> {
  const subPath = c.req.query('path') ?? ''
  const parsed = webdavPathSchema.safeParse({ path: subPath })
  if (!parsed.success) throw ApiError.badRequest('path: invalid relative path')
  let ctx
  try {
    ctx = await resolveMusicWebdav(c.env, c.get('user'), c.get('userId'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return c.json({ configured: false, dir: '', entries: [], reason: error.message })
    }
    throw error
  }
  await ensureMusicDir(ctx)
  const entries = await listMusicDirectory(ctx, parsed.data.path)
  return c.json({ configured: true, dir: ctx.dir, directory: musicDirectoryUrl(ctx, parsed.data.path), entries, reason: null })
}

async function importTrack(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, importMusicSchema, JSON_BODY_LIMITS.small)
  const ctx = await resolveMusicWebdav(c.env, c.get('user'), userId)
  const stat = await statMusicObject(ctx, body.path)
  if (!stat) throw ApiError.notFound('The selected file no longer exists on the WebDAV server')

  const name = body.path.split('/').filter(Boolean).pop() ?? body.path
  const format = resolveMusicFormat(name, stat.mime ?? '')
  if (!format) throw ApiError.badRequest('Unsupported audio format')

  const id = newId()
  const now = Date.now()
  const row: MusicTrackRow = {
    id,
    title: body.title?.trim() || name.replace(/\.[^.]+$/, ''),
    artist: body.artist?.trim() ?? '',
    album: body.album?.trim() ?? '',
    duration_ms: body.durationMs ?? 0,
    source: 'webdav',
    object_key: body.path,
    mime: stat.mime && stat.mime.startsWith('audio/') ? stat.mime.split(';', 1)[0]! : mimeForFormat(format),
    size_bytes: stat.sizeBytes,
    cover_url: null,
    lyric: null,
    is_favorite: 0,
    is_pinned: 0,
    play_count: 0,
    created_at: now,
    updated_at: now,
  }
  await insertWebdavTrack(c.env.DB, userId, row)
  return c.json(toTrack(row, []), 201)
}

async function uploadTrack(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.music)
  const file = form.get('file')
  if (!(file instanceof File)) throw ApiError.badRequest('Missing file field')
  if (file.size === 0) throw ApiError.badRequest('The audio file is empty')
  if (file.size > LIMITS.musicTrackMaxBytes) throw ApiError.tooLarge('The audio file exceeds the 64 MB limit')
  const format = resolveMusicFormat(file.name, file.type)
  if (!format) throw ApiError.badRequest('Unsupported audio format')

  const ctx = await resolveMusicWebdav(c.env, c.get('user'), userId)
  const safeName = sanitizeFileName(file.name)
  const remotePath = uniqueRemotePath(safeName)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = mimeForFormat(format)
  await putMusicObject(ctx, remotePath, bytes, mime)

  const id = newId()
  const now = Date.now()
  const row: MusicTrackRow = {
    id,
    title: readText(form, 'title', LIMITS.musicTitleMaxLength) || safeName.replace(/\.[^.]+$/, ''),
    artist: readText(form, 'artist', LIMITS.musicArtistMaxLength),
    album: readText(form, 'album', LIMITS.musicAlbumMaxLength),
    duration_ms: readDuration(form.get('durationMs')),
    source: 'webdav',
    object_key: remotePath,
    mime,
    size_bytes: bytes.byteLength,
    cover_url: await storeWebdavCover(c.env, id, now, readCover(form)),
    lyric: readText(form, 'lyric', LIMITS.musicLyricMaxBytes) || null,
    is_favorite: 0,
    is_pinned: 0,
    play_count: 0,
    created_at: now,
    updated_at: now,
  }
  await insertWebdavTrack(c.env.DB, userId, row)
  return c.json(toTrack(row, []), 201)
}

async function insertWebdavTrack(db: D1Database, userId: string, row: MusicTrackRow): Promise<void> {
  await db.prepare(
    `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
       cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
  ).bind(
    row.id, userId, row.title, row.artist, row.album, row.duration_ms, row.source, row.object_key, row.mime,
    row.size_bytes, row.cover_url, row.lyric, row.is_favorite, row.is_pinned, row.play_count, row.created_at, row.updated_at,
  ).run()
}

function musicDirectoryUrl(ctx: Awaited<ReturnType<typeof resolveMusicWebdav>>, subPath: string): string {
  const segments = [ctx.dir, ...subPath.split('/').filter(Boolean)].filter(Boolean)
  return childUrl(ctx.base, segments.join('/'))
}

async function storeWebdavCover(
  env: AppBindings['Bindings'],
  trackId: string,
  createdAt: number,
  dataUrl: string | null,
): Promise<string | null> {
  const decoded = decodeCoverDataUrl(dataUrl)
  if (!decoded) return null
  try {
    const key = coverObjectKey(trackId, createdAt, decoded.mime)
    await putStoredMusicObject(env, requireMusicStorage(env), key, decoded.bytes, decoded.mime)
    return key
  } catch (error) {
    // Artwork is a nicety: a failed cover write must not fail the track upload.
    console.warn('[inkstone] music cover upload failed:', error)
    return null
  }
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim()
  return (cleaned || 'track.mp3').slice(0, 160)
}

function uniqueRemotePath(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  return `${stem}-${Date.now().toString(36)}${ext}`
}

function readText(form: FormData, key: string, max: number): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readDuration(value: string | File | null): number {
  if (typeof value !== 'string') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
}

function readCover(form: FormData): string | null {
  const value = form.get('coverUrl')
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^data:image\/(png|jpeg|webp);base64,/.test(trimmed) && trimmed.length <= 400_000 ? trimmed : null
}
