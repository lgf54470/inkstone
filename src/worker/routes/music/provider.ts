import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { readUpstreamBytes } from './outbound'

// FEA-A1-2: the online-source proxy. The browser never talks to third-party
// catalogues — the page CSP forbids it, and the allowlist below is the only
// host the worker will fetch. A1-1 ships the switches; these routes carry the
// traffic once a provider is enabled. The aggregate upstream (GD) fronts the
// several catalogues the client lists, so the allowlist is one host.
const GDS_API_BASE = 'https://music-api.gdstudio.xyz'

const GDS_UPSTREAM_SOURCES = new Set(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])

export function registerMusicProviderRoutes(routes: Hono<AppBindings>): void {
  routes.get('/provider/search', requireAuth, (c) => providerSearch(c))
  routes.get('/provider/url', requireAuth, (c) => providerUrl(c))
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
  if (!GDS_UPSTREAM_SOURCES.has(source)) throw ApiError.badRequest('Unknown online source')
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
  if (!GDS_UPSTREAM_SOURCES.has(source)) throw ApiError.badRequest('Unknown online source')
  if (!id) throw ApiError.badRequest('The song id is required')
  if (!LIMITS.musicProviderQualities.includes(quality as 128 | 192 | 320 | 740 | 999)) {
    throw ApiError.badRequest('Unsupported quality')
  }
  const query = new URLSearchParams({ types: 'url', source, id, br: String(quality) })
  const payload = await fetchUpstreamJson(`${GDS_API_BASE}/api.php?${query}`) as { url?: unknown } | null
  const url = typeof payload?.url === 'string' && payload.url ? payload.url : null
  if (!url) throw new ApiError(502, 'storage_unavailable', 'The online source returned no playable URL')
  return c.json({ url })
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
