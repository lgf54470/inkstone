import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { resolveMusicTrackType } from './keys'
import { readUpstreamBytes } from './outbound'
import { importProviderTrackSchema } from './schemas'
import { insertWebdavTrack } from './webdav-routes'
import type { MusicTrackRow } from './rows'

// FEA-A1-2: the online-source proxy. The browser never talks to third-party
// catalogues — the page CSP forbids it, and the allowlist below is the only
// host the worker will fetch. A1-1 ships the switches; these routes carry the
// traffic once a provider is enabled. The aggregate upstream (GD) fronts the
// several catalogues the client lists, so the allowlist is one host.
const GDS_API_BASE = 'https://music-api.gdstudio.xyz'

const GDS_UPSTREAM_SOURCES = new Set(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])

export function isProviderSource(source: string): boolean {
  return GDS_UPSTREAM_SOURCES.has(source)
}

// Provider reference rows keep their identity in music_tracks.object_key as
// `gds:{source}:{songId}` — the upstream song id is what a per-play URL
// resolution needs, and the source scopes the dedupe key.
export const GDS_KEY_PREFIX = 'gds:'

export function gdsObjectKey(source: string, songId: string): string {
  return `${GDS_KEY_PREFIX}${source}:${songId}`
}

export function parseGdsObjectKey(objectKey: string): { source: string; songId: string } | null {
  if (!objectKey.startsWith(GDS_KEY_PREFIX)) return null
  const rest = objectKey.slice(GDS_KEY_PREFIX.length)
  const split = rest.indexOf(':')
  if (split <= 0) return null
  return { source: rest.slice(0, split), songId: rest.slice(split + 1) }
}

export function registerMusicProviderRoutes(routes: Hono<AppBindings>): void {
  routes.get('/provider/search', requireAuth, (c) => providerSearch(c))
  routes.get('/provider/url', requireAuth, (c) => providerUrl(c))
  routes.post('/tracks/import-provider', requireAuth, (c) => importProviderTrack(c))
}

interface GdsSearchHit {
  id?: unknown
  name?: unknown
  artist?: unknown
  album?: unknown
  duration?: unknown
}

// One search page, normalized: the upstream's field types drift (artist as a
// string or an array, duration in ms or absent), so every field is coerced here
// and the client sees one shape. An upstream failure is a 502, not a crash.
async function providerSearch(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'provider', userId)
  const keywords = (c.req.query('keywords') ?? '').trim()
  const source = c.req.query('source') ?? ''
  if (!keywords) throw ApiError.badRequest('Search keywords are required')
  if (!isProviderSource(source)) throw ApiError.badRequest('Unknown online source')
  const query = new URLSearchParams({
    types: 'search',
    source,
    name: keywords,
    count: String(LIMITS.musicProviderSearchCount),
    pages: '1',
  })
  const payload = await fetchUpstreamJson(`${GDS_API_BASE}/api.php?${query}`)
  const hits = Array.isArray(payload) ? payload as GdsSearchHit[] : []
  const results = hits.map((hit) => {
    const artist = hit.artist
    const duration = Number(hit.duration)
    return {
      source,
      sourceId: String(hit.id ?? ''),
      title: String(hit.name ?? ''),
      artist: Array.isArray(artist) ? artist.map(String).join(', ') : String(artist ?? ''),
      album: String(hit.album ?? ''),
      durationMs: Number.isFinite(duration) && duration > 0 ? duration : null,
    }
  }).filter((hit) => hit.sourceId && hit.title)
  return c.json({ results })
}

// The playable URL is minted per play (upstream links expire), which is why
// this is an endpoint and not a stored value on the track row.
async function providerUrl(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'provider', userId)
  const source = c.req.query('source') ?? ''
  const id = (c.req.query('id') ?? '').trim()
  const quality = Number(c.req.query('quality') ?? 320)
  if (!isProviderSource(source)) throw ApiError.badRequest('Unknown online source')
  if (!id) throw ApiError.badRequest('The song id is required')
  if (!LIMITS.musicProviderQualities.includes(quality as 128 | 192 | 320 | 740 | 999)) {
    throw ApiError.badRequest('Unsupported quality')
  }
  return c.json({ url: await resolveProviderPlayUrl(source, id, quality) })
}

// Shared by the url endpoint and the stream branch: one per-play resolution of
// the upstream's temporary link, the same lifecycle an Alist signed URL has.
export async function resolveProviderPlayUrl(source: string, songId: string, quality = 320): Promise<string> {
  const query = new URLSearchParams({ types: 'url', source, id: songId, br: String(quality) })
  const payload = await fetchUpstreamJson(`${GDS_API_BASE}/api.php?${query}`) as { url?: unknown } | null
  const url = typeof payload?.url === 'string' && payload.url ? payload.url : null
  if (!url) throw new ApiError(502, 'storage_unavailable', 'The online source returned no playable URL')
  return url
}

// FEA-A1-3: adding an online hit registers a provider reference row — metadata
// only, the URL resolution happens per play. The idempotency key is the
// (user, upstream source, song id) triple, so re-adding a hit is a no-op.
async function importProviderTrack(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, importProviderTrackSchema, JSON_BODY_LIMITS.small)
  if (!isProviderSource(body.source)) throw ApiError.badRequest('Unknown online source')
  const title = body.title?.trim() ?? ''
  if (!title) throw ApiError.badRequest('The song title is required')

  const objectKey = gdsObjectKey(body.source, body.sourceId)
  const existing = await c.env.DB.prepare(
    `SELECT * FROM music_tracks WHERE user_id = ?1 AND source = 'provider' AND object_key = ?2`,
  ).bind(userId, objectKey).first<MusicTrackRow>()
  if (existing) return c.json(toProviderTrackFromRow(existing))

  const trackType = resolveMusicTrackType('song.mp3', '')
  if (!trackType) throw ApiError.internal('The provider track mime is unresolvable')
  const now = Date.now()
  const row: MusicTrackRow = {
    id: newId(),
    title,
    artist: body.artist?.trim() ?? '',
    album: body.album?.trim() ?? '',
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
  return c.json(toProviderTrackFromRow(row), 201)
}

function toProviderTrackFromRow(row: MusicTrackRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    source: row.source,
    format: resolveMusicTrackType(row.object_key, row.mime)?.format ?? null,
    webdavPath: null,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: Boolean(row.is_favorite),
    isPinned: Boolean(row.is_pinned),
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function fetchUpstreamJson(target: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(target, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The online source is unreachable')
  }
  if (!response.ok) throw new ApiError(502, 'storage_unavailable', `The online source failed: HTTP ${response.status}`)
  const bytes = await readUpstreamBytes(response, LIMITS.musicProviderBodyMaxBytes)
  if (!bytes) throw new ApiError(502, 'storage_unavailable', 'The online source response is too large')
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The online source response is unreadable')
  }
}
