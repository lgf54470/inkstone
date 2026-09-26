import type { Context, Hono } from 'hono'
import type { AppBindings } from '../../env'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { pathParam } from './params'
import { createAlistServerSchema, patchAlistServerSchema } from './schemas'

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
