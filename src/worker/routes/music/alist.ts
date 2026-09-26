import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { insertWebdavTrack } from './webdav-routes'
import { pathParam } from './params'
import { resolveMusicTrackType } from './keys'
import { createAlistServerSchema, importAlistTrackSchema, patchAlistServerSchema } from './schemas'
import type { MusicTrackRow } from './rows'
import type { MusicTrack } from '@shared/types'

// FEA-A3: Alist servers are the user's own registrations. The token is encrypted
// at rest and never travels back to the browser — the routes answer name, URL and
// root path only. Alist's own HTTP API (fs/list, fs/get, fs/search) is what the
// browse, import and search features talk to.
export interface MusicAlistServer {
  id: string
  user_id: string
  name: string
  url: string
  root_path: string
  secret: string | null
  created_at: number
  updated_at: number
}

export interface ResolvedAlistServer {
  id: string
  url: string
  rootPath: string
  token: string
}

const ALIST_SELECT = 'id, name, url, root_path, created_at, updated_at'

export function registerMusicAlistRoutes(routes: Hono<AppBindings>): void {
  routes.get('/alist', requireAuth, (c) => listServers(c))
  routes.post('/alist', requireAuth, (c) => createServer(c))
  routes.patch('/alist/:id', requireAuth, (c) => patchServer(c))
  routes.delete('/alist/:id', requireAuth, (c) => deleteServer(c))
  routes.get('/alist/:id/list', requireAuth, (c) => listDirectory(c))
  routes.post('/alist/:id/import', requireAuth, (c) => importTrack(c))
}

async function listServers(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT ${ALIST_SELECT} FROM music_alist_servers WHERE user_id = ?1 ORDER BY created_at ASC`,
  ).bind(c.get('userId')).all<ServerRow>()
  return c.json({ servers: rows.results.map(toServerView) })
}

async function createServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, createAlistServerSchema, JSON_BODY_LIMITS.small)
  const id = newId()
  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO music_alist_servers (id, user_id, name, url, root_path, secret, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(
    id, userId, body.name, body.url, body.rootPath ?? '/',
    await encryptSecret(c.env, id, { token: body.token }), now,
  ).run()
  const created = await loadServerRow(c.env.DB, userId, id)
  if (!created) throw ApiError.internal('The Alist server row vanished after insert')
  return c.json(toServerView(created), 201)
}

async function patchServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await loadServerRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Alist server not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, patchAlistServerSchema, JSON_BODY_LIMITS.small)
  const url = body.url ?? row.url
  const name = body.name ?? row.name
  const rootPath = body.rootPath ?? row.root_path
  // An absent token keeps the stored one, so editing a name never breaks auth.
  const secret = body.token === undefined
    ? row.secret
    : await encryptSecret(c.env, id, { token: body.token })
  await c.env.DB.prepare(
    'UPDATE music_alist_servers SET name = ?1, url = ?2, root_path = ?3, secret = ?4, updated_at = ?5 WHERE user_id = ?6 AND id = ?7',
  ).bind(name, url, rootPath, secret, Date.now(), userId, id).run()
  const updated = await loadServerRow(c.env.DB, userId, id)
  if (!updated) throw ApiError.internal('The Alist server row vanished after update')
  return c.json(toServerView(updated))
}

async function deleteServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await loadServerRow(c.env.DB, userId, id))) throw ApiError.notFound('Alist server not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  await c.env.DB.prepare('DELETE FROM music_alist_servers WHERE user_id = ?1 AND id = ?2').bind(userId, id).run()
  return c.json({ ok: true })
}

// FEA-A3-2: browse one directory of the registered server. Paths travel relative
// to the server's root; the upstream fs/list call joins them onto the root.
async function listDirectory(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'webdav', userId)
  const id = pathParam(c, 'id')
  const server = await resolveAlistServer(c.env, userId, id)
  const subPath = normalizeAlistPath(c.req.query('path') ?? '/')
  const data = await alistApi(server, '/api/fs/list', {
    path: joinAlistPath(server.rootPath, subPath),
    page: 1, per_page: LIMITS.musicAlistListEntryMax, refresh: false,
  }) as { content: Array<{ name: string; size: number; is_dir: boolean }> | null }
  const entries = (data.content ?? []).map((entry) => ({
    name: entry.name,
    isDir: Boolean(entry.is_dir),
    size: entry.size ?? 0,
    path: joinAlistPath(subPath, entry.name),
  }))
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return c.json({ path: subPath, entries })
}

// The import registers a reference row exactly like the WebDAV import: metadata
// only, no bytes stored, nothing charged to the quota.
async function importTrack(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'webdav', userId)
  const id = pathParam(c, 'id')
  const server = await resolveAlistServer(c.env, userId, id)
  const body = await readJsonValidated(c, importAlistTrackSchema, JSON_BODY_LIMITS.small)
  const path = normalizeAlistPath(body.path)
  const data = await alistApi(server, '/api/fs/get', { path: joinAlistPath(server.rootPath, path) }) as {
    name?: string
    size?: number
    is_dir?: boolean
  }
  if (data.is_dir) throw ApiError.badRequest('Choose a file, not a directory')
  const filename = alistFileNameOf(path)
  const trackType = resolveMusicTrackType(filename, '')
  if (!trackType) throw ApiError.badRequest('Unsupported media format')

  const now = Date.now()
  const row: MusicTrackRow = {
    id: newId(),
    title: body.title?.trim() || filename.replace(/\.[^.]+$/, ''),
    artist: body.artist?.trim() ?? '',
    album: body.album?.trim() ?? '',
    duration_ms: 0,
    source: 'alist',
    object_key: alistObjectKey(id, path),
    mime: trackType.mime,
    size_bytes: data.size ?? 0,
    cover_url: null,
    lyric: null,
    is_favorite: 0,
    is_pinned: 0,
    play_count: 0,
    last_played_at: null,
    content_hash: null,
    created_at: now,
    updated_at: now,
  }
  await insertWebdavTrack(c.env.DB, userId, row)
  return c.json(toTrackFromRow(row), 201)
}

function toTrackFromRow(row: MusicTrackRow): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    source: 'alist',
    format: resolveMusicTrackType(row.object_key, row.mime)?.format ?? null,
    webdavPath: null,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    contentHash: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// One upstream Alist API call: the token rides the Authorization header, and a
// non-200 `code` (Alist's own convention) is a clean 502 to the client.
export async function alistApi(
  server: ResolvedAlistServer,
  apiPath: '/api/fs/list' | '/api/fs/get' | '/api/fs/search',
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${server.url}${apiPath}`, {
      method: 'POST',
      headers: { Authorization: server.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The Alist server is unreachable')
  }
  if (!response.ok) throw new ApiError(502, 'storage_unavailable', `Alist request failed: HTTP ${response.status}`)
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: unknown } | null
  if (!payload || payload.code !== 200) {
    throw new ApiError(502, 'storage_unavailable', payload?.message || 'Alist request failed')
  }
  return payload.data
}

function normalizeAlistPath(path: string): string {
  const trimmed = `/${path.replace(/\/+/g, '/').replace(/^\/+/, '')}`
  return trimmed.replace(/\/+$/, '') || '/'
}

export function joinAlistPath(base: string, sub: string): string {
  if (sub === '/') return base || '/'
  return `${base.replace(/\/+$/, '')}/${sub.replace(/^\/+/, '')}`
}

interface ServerRow {
  id: string
  name: string
  url: string
  root_path: string
  secret: string | null
  created_at: number
  updated_at: number
}

function toServerView(row: ServerRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function loadServerRow(db: D1Database, userId: string, id: string): Promise<ServerRow | null> {
  return db.prepare(
    `SELECT id, name, url, root_path, secret, created_at, updated_at FROM music_alist_servers WHERE user_id = ?1 AND id = ?2`,
  ).bind(userId, id).first<ServerRow>()
}

// Shared resolver for the browse, import and stream paths: ownership is enforced
// here, and the token is decrypted only into server memory.
export async function resolveAlistServer(
  env: AppBindings['Bindings'],
  userId: string,
  serverId: string,
): Promise<ResolvedAlistServer> {
  const row = await loadServerRow(env.DB, userId, serverId)
  if (!row) throw ApiError.notFound('Alist server not found')
  if (!row.secret) throw new ApiError(503, 'storage_unavailable', 'The Alist server has no stored token')
  const record = await decryptSecret<{ token?: string }>(env, row.id, row.secret)
  if (!record?.token) throw new ApiError(503, 'storage_unavailable', 'The Alist token is unreadable')
  return { id: row.id, url: row.url.replace(/\/+$/, ''), rootPath: normalizeRoot(row.root_path), token: record.token }
}

function normalizeRoot(rootPath: string): string {
  const trimmed = rootPath.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

// Alist reference rows keep their source in music_tracks.object_key as
// `alist:{serverId}:{path}` — the server id scopes the path, the path stays
// relative to the server root so a later root_path edit re-scopes cleanly.
export const ALIST_KEY_PREFIX = 'alist:'

export function alistObjectKey(serverId: string, path: string): string {
  return `${ALIST_KEY_PREFIX}${serverId}:${path}`
}

export function parseAlistObjectKey(objectKey: string): { serverId: string; path: string } | null {
  if (!objectKey.startsWith(ALIST_KEY_PREFIX)) return null
  const rest = objectKey.slice(ALIST_KEY_PREFIX.length)
  const split = rest.indexOf(':')
  if (split <= 0) return null
  return { serverId: rest.slice(0, split), path: rest.slice(split + 1) }
}

export const ALIST_MEDIA_EXTENSIONS = /\.(mp3|m4a|mp4|flac|wav|wave|ogg|oga|opus|aac|webm|m4v|mov)$/i

// Guards the name a trash entry or import records: borrowed from the same idea as
// the webdav import's filename derivation.
export function alistFileNameOf(path: string): string {
  return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? path)
}
