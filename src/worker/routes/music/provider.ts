import type { Context, Hono } from 'hono'
import { GDS_UPSTREAM_SOURCES, LIMITS, MUSIC_PROVIDER_DEFAULT_QUALITY, MUSIC_PROVIDER_QUALITIES, type MusicProviderQuality } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { isAllowedOutboundUrl } from '../../lib/outbound-url'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { cancelStreamBestEffort } from '../../lib/streams'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { coverHeaders, storeCoverObject } from './cover'
import { resolveMusicTrackType } from './keys'
import { fetchAllowedResource, fetchPublicResource, readUpstreamBytes } from './outbound'
import { importProviderTrackSchema } from './schemas'
import { insertWebdavTrack } from './webdav-routes'
import { toTrack, type MusicTrackRow } from './rows'

// A 300px square is what the list and card surfaces draw; anything larger is bytes the reader
// never sees.
const PROVIDER_COVER_SIZE = 300

// FEA-A1-2: the online-source proxy. The browser never talks to third-party
// catalogues — the page CSP forbids it, and the allowlist below is the only
// host the worker will fetch. A1-1 ships the switches; these routes carry the
// traffic once a provider is enabled. The aggregate upstream (GD) fronts the
// several catalogues the client lists, so the allowlist is one host.
const GDS_API_BASE = 'https://music-api.gdstudio.xyz'
// FB-S2: the only host this proxy fetches, checked on every hop of every redirect it follows.
const GDS_ALLOWED_HOSTS = ['music-api.gdstudio.xyz'] as const

// FB-S4: the same list the client searches with, not a second copy of it — a path segment that
// reaches the upstream is exactly the catalogue name the client offered.
export function isProviderSource(source: string): boolean {
  return (GDS_UPSTREAM_SOURCES as readonly string[]).includes(source)
}

// FB-F7: the tier arrives as a query parameter, and the whitelist is the half of the
// contract the client cannot be trusted with. An absent tier is the historical default; a
// tier that is not on the list is refused rather than quietly replaced, so a stale client
// value can never pass for a choice nobody made.
export function readProviderQuality(value: string | undefined): MusicProviderQuality {
  if (value === undefined || value === '') return MUSIC_PROVIDER_DEFAULT_QUALITY
  const parsed = Number(value)
  if (!(MUSIC_PROVIDER_QUALITIES as readonly number[]).includes(parsed)) {
    throw ApiError.badRequest('Unsupported quality')
  }
  return parsed as MusicProviderQuality
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
  routes.get('/provider/lyric', requireAuth, (c) => providerLyric(c))
  routes.get('/provider/cover', requireAuth, (c) => providerCover(c))
  routes.post('/tracks/import-provider', requireAuth, (c) => importProviderTrack(c))
}

interface GdsSearchHit {
  id?: unknown
  name?: unknown
  artist?: unknown
  album?: unknown
  duration?: unknown
  pic_id?: unknown
  lyric_id?: unknown
}

// FB-F5: the ids the upstream hands out with a hit are the only way to ask for that song's
// artwork and words later, so they are carried through the search response rather than dropped
// with the rest of the upstream's shape.
function providerHitId(value: unknown): string | null {
  const id = value === undefined || value === null ? '' : String(value).trim()
  return id || null
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
  const payload = await fetchProviderUpstream(`${GDS_API_BASE}/api.php?${query}`)
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
      coverId: providerHitId(hit.pic_id),
      lyricId: providerHitId(hit.lyric_id),
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
  const quality = readProviderQuality(c.req.query('quality'))
  if (!isProviderSource(source)) throw ApiError.badRequest('Unknown online source')
  if (!id) throw ApiError.badRequest('The song id is required')
  return c.json({ url: await resolveProviderPlayUrl(source, id, quality) })
}

// FB-F5: one song's words, from the same proxy and the same allowlist. An upstream that has no
// lyric for the id answers with an empty string, which the client reads as "nothing to store".
async function providerLyric(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'provider', userId)
  const source = c.req.query('source') ?? ''
  const id = (c.req.query('id') ?? '').trim()
  if (!isProviderSource(source)) throw ApiError.badRequest('Unknown online source')
  if (!id) throw ApiError.badRequest('The lyric id is required')
  const query = new URLSearchParams({ types: 'lyric', source, id })
  const payload = await fetchProviderUpstream(`${GDS_API_BASE}/api.php?${query}`) as { lyric?: unknown } | null
  return c.json({ lyric: typeof payload?.lyric === 'string' ? payload.lyric.trim() : '' })
}

// FB-F5: the artwork is one more per-song lookup: the catalogue names a picture URL and the
// picture itself is fetched here, so the page never talks to a third-party image host (the CSP
// forbids it). The URL comes from the upstream, which is exactly why it is checked before it is
// followed — a catalogue that answers with an address on this network must not be reached.
async function providerCover(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'provider', userId)
  const source = c.req.query('source') ?? ''
  const id = (c.req.query('id') ?? '').trim()
  if (!isProviderSource(source)) throw ApiError.badRequest('Unknown online source')
  if (!id) throw ApiError.badRequest('The cover id is required')
  const imageUrl = await resolveProviderCoverUrl(source, id)
  // FB-S2: the image host is the upstream's choice, so the address rule itself is the guard — and
  // it is applied to every hop, not only to the first.
  const response = await fetchPublicResource(imageUrl, 'image/*')
  if (!response) throw new ApiError(502, 'storage_unavailable', 'The online cover is not reachable from this server')
  if (!response.ok) {
    await cancelStreamBestEffort(response.body)
    throw new ApiError(502, 'storage_unavailable', `The online cover failed: HTTP ${response.status}`)
  }
  const bytes = await readUpstreamBytes(response, LIMITS.musicProviderBodyMaxBytes)
  if (!bytes) throw new ApiError(502, 'storage_unavailable', 'The online cover is too large')
  const mime = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() || 'image/jpeg'
  return new Response(bytes, {
    headers: { ...coverHeaders(mime.startsWith('image/') ? mime : 'image/jpeg'), 'Cache-Control': 'public, max-age=86400' },
  })
}

// The cover lookup answers with a temporary URL on a third-party image host; the guard is the
// same public-address rule every other user-controlled outbound fetch answers to.
export async function resolveProviderCoverUrl(source: string, coverId: string): Promise<string> {
  const query = new URLSearchParams({ types: 'pic', source, id: coverId, size: String(PROVIDER_COVER_SIZE) })
  const payload = await fetchProviderUpstream(`${GDS_API_BASE}/api.php?${query}`) as { url?: unknown } | null
  const raw = typeof payload?.url === 'string' ? payload.url.trim() : ''
  if (!raw) throw new ApiError(502, 'storage_unavailable', 'The online source returned no cover URL')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The online source returned an unusable cover URL')
  }
  if (!isAllowedOutboundUrl(parsed, { allowHttp: false })) {
    throw new ApiError(502, 'storage_unavailable', 'The online cover address is not reachable from this server')
  }
  return parsed.toString()
}

// Shared by the url endpoint and the stream branch: one per-play resolution of
// the upstream's temporary link, the same lifecycle an Alist signed URL has.
export async function resolveProviderPlayUrl(
  source: string,
  songId: string,
  quality: MusicProviderQuality = MUSIC_PROVIDER_DEFAULT_QUALITY,
): Promise<string> {
  const query = new URLSearchParams({ types: 'url', source, id: songId, br: String(quality) })
  const payload = await fetchProviderUpstream(`${GDS_API_BASE}/api.php?${query}`) as { url?: unknown } | null
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
  const id = newId()
  // FB-F5: the cover goes through the same object-store path an uploaded cover takes, so the
  // row's cover_url stays a derived key and the read side needs no special case. A write that
  // cannot land leaves the row coverless rather than failing the add.
  const coverKey = await storeCoverObject(c.env, id, now, body.coverDataUrl ?? null)
  const row: MusicTrackRow = {
    id,
    title,
    artist: body.artist?.trim() ?? '',
    album: body.album?.trim() ?? '',
    duration_ms: body.durationMs ?? 0,
    source: 'provider',
    object_key: objectKey,
    mime: trackType.mime,
    size_bytes: 0,
    cover_url: coverKey,
    lyric: body.lyric?.trim() || null,
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

// The row mapping is the library's own, so a provider row answers with its cover and lyric the
// way every other row does instead of restating a shape with the artwork fields left empty.
function toProviderTrackFromRow(row: MusicTrackRow): ReturnType<typeof toTrack> {
  return toTrack(row, [])
}

// FB-S2: the catalogue's own reads walk the same hop-by-hop allowlist every other outbound walk in
// this module answers to. A redirect the worker follows is still the worker fetching, so the guard
// has to hold per hop rather than be trusted to the runtime flag.
export async function fetchProviderUpstream(target: string): Promise<unknown> {
  const response = await fetchAllowedResource(target, GDS_ALLOWED_HOSTS, 'application/json')
  if (!response) throw new ApiError(502, 'storage_unavailable', 'The online source is not reachable from this server')
  if (!response.ok) {
    await cancelStreamBestEffort(response.body)
    throw new ApiError(502, 'storage_unavailable', `The online source failed: HTTP ${response.status}`)
  }
  const bytes = await readUpstreamBytes(response, LIMITS.musicProviderBodyMaxBytes)
  if (!bytes) throw new ApiError(502, 'storage_unavailable', 'The online source response is too large')
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The online source response is unreadable')
  }
}
