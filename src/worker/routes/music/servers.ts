import type { Context, Hono } from 'hono'
import type { AppBindings } from '../../env'
import { decryptSecret, encryptSecret } from '../../lib/crypto'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { resolveMusicTrackType, serverObjectKey } from './keys'
import { pathParam } from './params'
import { importMusicServerTrackSchema, musicServerSchema, patchMusicServerSchema } from './schemas'
import { toTrack, type MusicTrackRow } from './rows'
import {
  isMusicServerKind,
  musicServerPlayTarget,
  probeMusicServer,
  registerMusicServer,
  searchMusicServer,
  type MusicServerPlayTarget,
  type MusicServerTarget,
} from './server-api'
import { insertWebdavTrack } from './webdav-routes'

/**
 * FB-M16: server-type sources. The reader registers their own music server — Subsonic / Navidrome /
 * Airsonic, or Jellyfin / Emby — and the library can search it and add songs from it. The shape is
 * the one Alist already uses: the credential is encrypted at rest and never travels back to the
 * browser, imported rows are metadata-only references, and the play address is resolved per play.
 */
export interface MusicServerView {
  id: string
  name: string
  kind: string
  url: string
  username: string
  createdAt: number
  updatedAt: number
}

interface ServerRow {
  id: string
  name: string
  kind: string
  url: string
  username: string
  secret: string | null
  /** Jellyfin's own user id, which its item search names. Not a secret, hence its own column. */
  upstream_user_id: string | null
  created_at: number
  updated_at: number
}

// The vault hands back only the shapes it knows, so the two credentials live under the names its
// vocabulary has: a Subsonic password and a Jellyfin session token. Reading both is what keeps one
// resolver for the two kinds.
interface StoredCredential {
  password?: string
  token?: string
}

const SERVER_SELECT = 'id, name, kind, url, username, created_at, updated_at'

export function registerMusicServerRoutes(routes: Hono<AppBindings>): void {
  routes.get('/servers', requireAuth, (c) => listServers(c))
  routes.post('/servers', requireAuth, (c) => createServer(c))
  routes.patch('/servers/:id', requireAuth, (c) => patchServer(c))
  routes.delete('/servers/:id', requireAuth, (c) => deleteServer(c))
  // A registration is only worth keeping if it answers, so the settings panel's Test button and the
  // re-check after an edit ask the same question of the same adapter.
  routes.post('/servers/:id/probe', requireAuth, (c) => probeServer(c))
  routes.get('/servers/:id/search', requireAuth, (c) => searchServer(c))
  routes.post('/servers/:id/import', requireAuth, (c) => importServerTrack(c))
}

function toServerView(row: ServerRow): MusicServerView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    url: row.url,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listServers(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT ${SERVER_SELECT} FROM music_server_sources WHERE user_id = ?1 ORDER BY created_at ASC`,
  ).bind(c.get('userId')).all<ServerRow>()
  return c.json({ servers: rows.results.map(toServerView) })
}

async function createServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, musicServerSchema, JSON_BODY_LIMITS.small)
  // A registration is verified before it is stored: a wrong URL or password is answered here, with
  // the reader watching, rather than at the first play.
  const registration = await registerMusicServer({
    kind: body.kind,
    url: body.url,
    username: body.username,
    password: body.password,
  })
  const id = newId()
  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO music_server_sources (id, user_id, name, kind, url, username, secret, upstream_user_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
  ).bind(
    id, userId, body.name, body.kind, body.url.replace(/\/+$/, ''), body.username,
    await encryptSecret(c.env, id, registration.record), registration.upstreamUserId, now,
  ).run()
  const created = await loadServerRow(c.env.DB, userId, id)
  if (!created) throw ApiError.internal('The music server row vanished after insert')
  return c.json(toServerView(created), 201)
}

async function patchServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await loadServerRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Music server not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, patchMusicServerSchema, JSON_BODY_LIMITS.small)
  const url = (body.url ?? row.url).replace(/\/+$/, '')
  const username = body.username ?? row.username
  // A new password re-registers (Jellyfin trades it for a fresh token); an absent one keeps what is
  // stored, so renaming a server never invalidates its credential. The kind is not editable: it is
  // what the stored credential means.
  let secret = row.secret
  let upstreamUserId = row.upstream_user_id
  if (body.password !== undefined) {
    if (!isMusicServerKind(row.kind)) throw ApiError.internal('The stored music server kind is invalid')
    const registration = await registerMusicServer({ kind: row.kind, url, username, password: body.password })
    secret = await encryptSecret(c.env, id, registration.record)
    upstreamUserId = registration.upstreamUserId
  }
  await c.env.DB.prepare(
    'UPDATE music_server_sources SET name = ?1, url = ?2, username = ?3, secret = ?4, upstream_user_id = ?5, updated_at = ?6 WHERE user_id = ?7 AND id = ?8',
  ).bind(body.name ?? row.name, url, username, secret, upstreamUserId, Date.now(), userId, id).run()
  const updated = await loadServerRow(c.env.DB, userId, id)
  if (!updated) throw ApiError.internal('The music server row vanished after update')
  return c.json(toServerView(updated))
}

async function deleteServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await loadServerRow(c.env.DB, userId, id))) throw ApiError.notFound('Music server not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  await c.env.DB.prepare('DELETE FROM music_server_sources WHERE user_id = ?1 AND id = ?2').bind(userId, id).run()
  // Rows imported from it stay: they are the reader's library, and removing a registration is not a
  // request to delete songs — the reading the Alist and WebDAV panels already take.
  return c.json({ ok: true })
}

async function probeServer(c: Context<AppBindings>): Promise<Response> {
  const target = await resolveMusicServer(c.env, c.get('userId'), pathParam(c, 'id'))
  await probeMusicServer(target)
  return c.json({ ok: true })
}

async function searchServer(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  // The same hourly family the catalogue search spends from: both are outbound searches the reader
  // can press repeatedly.
  await enforceMusicBudget(c.env.DB, 'provider', userId)
  const keywords = (c.req.query('keywords') ?? '').trim()
  if (!keywords) throw ApiError.badRequest('Search keywords are required')
  const target = await resolveMusicServer(c.env, userId, pathParam(c, 'id'))
  const results = await searchMusicServer(target, keywords)
  return c.json({ serverId: target.serverId, kind: target.kind, results })
}

// FEA-A1-3's rule, one family over: adding a hit registers a metadata-only reference row, and the
// idempotency key is the (user, server, item) triple so re-adding the same song is a no-op.
async function importServerTrack(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const target = await resolveMusicServer(c.env, userId, pathParam(c, 'id'))
  const body = await readJsonValidated(c, importMusicServerTrackSchema, JSON_BODY_LIMITS.small)
  const objectKey = serverObjectKey(target.kind, target.serverId, body.itemId)
  const existing = await c.env.DB.prepare(
    `SELECT * FROM music_tracks WHERE user_id = ?1 AND source = 'provider' AND object_key = ?2`,
  ).bind(userId, objectKey).first<MusicTrackRow>()
  if (existing) return c.json(toTrack(existing, []))

  const trackType = resolveMusicTrackType('song.mp3', '')
  if (!trackType) throw ApiError.internal('The server track mime is unresolvable')
  const now = Date.now()
  const row: MusicTrackRow = {
    id: newId(),
    title: body.title,
    artist: body.artist ?? '',
    album: body.album ?? '',
    duration_ms: body.durationMs ?? 0,
    source: 'provider',
    object_key: objectKey,
    mime: trackType.mime,
    size_bytes: 0,
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
  return c.json(toTrack(row, []), 201)
}

async function loadServerRow(db: D1Database, userId: string, id: string): Promise<ServerRow | null> {
  return db.prepare(
    `SELECT id, name, kind, url, username, secret, upstream_user_id, created_at, updated_at FROM music_server_sources WHERE user_id = ?1 AND id = ?2`,
  ).bind(userId, id).first<ServerRow>()
}

export interface ResolvedMusicServer extends MusicServerTarget {
  serverId: string
}

/**
 * Ownership is enforced here, and the credential is decrypted only into Worker memory — the one
 * resolver the search, import, stream and health paths share.
 */
export async function resolveMusicServer(
  env: AppBindings['Bindings'],
  userId: string,
  serverId: string,
): Promise<ResolvedMusicServer> {
  const row = await loadServerRow(env.DB, userId, serverId)
  if (!row) throw ApiError.notFound('Music server not found')
  if (!isMusicServerKind(row.kind)) throw ApiError.internal('The stored music server kind is invalid')
  if (!row.secret) throw new ApiError(503, 'storage_unavailable', 'The music server has no stored credential')
  const record = await decryptSecret<StoredCredential>(env, row.id, row.secret)
  const secret = record?.password ?? record?.token
  if (!secret) throw new ApiError(503, 'storage_unavailable', 'The music server credential is unreadable')
  return {
    serverId: row.id,
    kind: row.kind,
    url: row.url.replace(/\/+$/, ''),
    username: row.username,
    secret,
    upstreamUserId: row.upstream_user_id,
  }
}

/** The one play-address resolver for the stream and health paths, so both ask the same adapter. */
export async function resolveServerPlayTarget(
  env: AppBindings['Bindings'],
  userId: string,
  serverId: string,
  itemId: string,
): Promise<MusicServerPlayTarget> {
  return musicServerPlayTarget(await resolveMusicServer(env, userId, serverId), itemId)
}
