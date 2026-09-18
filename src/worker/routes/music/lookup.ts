import type { Hono } from 'hono'
import { pickArtworkUrl, type CatalogueTrack } from '@shared/music-cover-match'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isAllowedOutboundUrl } from '../../lib/outbound-url'
import { cancelStreamBestEffort } from '../../lib/streams'
import { requireAuth } from '../../middleware/auth'
import { coverHeaders } from './cover'
import { coverLookupQuerySchema } from './schemas'

// The catalogue request runs here because the page's CSP forbids third party connections.
const LOOKUP_ENDPOINT = 'https://itunes.apple.com/search'
const LOOKUP_LIMIT = 5
const LOOKUP_TIMEOUT_MS = 12_000
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024
const ARTWORK_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_REDIRECT_HOPS = 3
// Apple serves artwork from its own CDN and its subdomains share DNS trust,
// so the upstream-provided URL must never send the Worker to another origin —
// including via redirects.
const LOOKUP_ALLOWED_HOSTS = ['itunes.apple.com']
const ARTWORK_ALLOWED_HOSTS = ['apple.com', 'mzstatic.com']

export function registerMusicCoverLookupRoutes(routes: Hono<AppBindings>): void {
  routes.get('/cover-lookup', requireAuth, async (c) => {
    const query = coverLookupQuerySchema.safeParse({ title: c.req.query('title'), artist: c.req.query('artist') })
    if (!query.success) throw ApiError.badRequest('Provide a track title to look up')
    const artworkUrl = await findArtworkUrl(query.data.title, query.data.artist ?? '')
    if (!artworkUrl) throw ApiError.notFound('No cover matched this track')
    const response = await fetchAppleResource(artworkUrl, ARTWORK_ALLOWED_HOSTS, 'image/*')
    if (!response || !response.ok) throw ApiError.internal('Cover artwork is unavailable')
    const bytes = await response.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > MAX_ARTWORK_BYTES) throw ApiError.internal('Cover artwork is unusable')
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!ARTWORK_MIME_ALLOWLIST.has(mime)) throw ApiError.internal('Cover artwork is unusable')
    return new Response(bytes, { headers: coverHeaders(mime) })
  })
}

async function findArtworkUrl(title: string, artist: string): Promise<string | null> {
  const term = [title, artist].map((part) => part.trim()).filter(Boolean).join(' ')
  if (!term) return null
  const query = LOOKUP_ENDPOINT + '?term=' + encodeURIComponent(term) + '&entity=song&limit=' + LOOKUP_LIMIT
  const response = await fetchAppleResource(query, LOOKUP_ALLOWED_HOSTS, 'application/json')
  if (!response || !response.ok) return null
  const payload = (await response.json()) as { results?: CatalogueTrack[] }
  return pickArtworkUrl(title, artist, payload.results ?? [])
}

async function fetchAppleResource(
  rawUrl: string,
  allowedHosts: readonly string[],
  accept: string,
): Promise<Response | null> {
  let current = parseUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS && current; hop++) {
    if (!isAllowedOutboundUrl(current, { allowHttp: false }) || !isHostInList(current.hostname, allowedHosts)) return null
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: { Accept: accept },
    })
    if (response.status < 300 || response.status >= 400) return response
    await cancelStreamBestEffort(response.body)
    current = parseUrl(response.headers.get('location') ?? '', current)
  }
  return null
}

function parseUrl(raw: string, base?: URL): URL | null {
  try {
    return base ? new URL(raw, base) : new URL(raw)
  } catch {
    return null
  }
}

function isHostInList(hostname: string, hosts: readonly string[]): boolean {
  const host = hostname.toLowerCase()
  for (const entry of hosts) {
    if (host === entry || host.endsWith('.' + entry)) return true
  }
  return false
}
