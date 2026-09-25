import type { Hono } from 'hono'
import { pickArtworkUrl, type CatalogueTrack } from '@shared/music-cover-match'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { coverHeaders } from './cover'
import { fetchAllowedResource, readUpstreamBytes, readUpstreamJson } from './outbound'
import { coverLookupQuerySchema } from './schemas'

// The catalogue request runs here because the page's CSP forbids third party connections.
const LOOKUP_ENDPOINT = 'https://itunes.apple.com/search'
const LOOKUP_LIMIT = 5
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024
// Five catalogue entries answer in a few kilobytes; the cap only guards against an
// upstream that changes shape, so it is generous and still bounded.
const MAX_CATALOGUE_BYTES = 256 * 1024
const ARTWORK_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp'])
// Apple serves artwork from its own CDN and its subdomains share DNS trust,
// so the upstream-provided URL must never send the Worker to another origin —
// including via redirects.
const LOOKUP_ALLOWED_HOSTS = ['itunes.apple.com']
const ARTWORK_ALLOWED_HOSTS = ['apple.com', 'mzstatic.com']

export function registerMusicCoverLookupRoutes(routes: Hono<AppBindings>): void {
  routes.get('/cover-lookup', requireAuth, async (c) => {
    const query = coverLookupQuerySchema.safeParse({ title: c.req.query('title'), artist: c.req.query('artist') })
    if (!query.success) throw ApiError.badRequest('Provide a track title to look up')
    await enforceMusicBudget(c.env.DB, 'lookup', c.get('userId'))
    const artworkUrl = await findArtworkUrl(query.data.title, query.data.artist ?? '')
    if (!artworkUrl) throw ApiError.notFound('No cover matched this track')
    const response = await fetchAllowedResource(artworkUrl, ARTWORK_ALLOWED_HOSTS, 'image/*')
    if (!response || !response.ok) throw ApiError.internal('Cover artwork is unavailable')
    const bytes = await readUpstreamBytes(response, MAX_ARTWORK_BYTES)
    if (!bytes || !bytes.byteLength) throw ApiError.internal('Cover artwork is unusable')
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!ARTWORK_MIME_ALLOWLIST.has(mime)) throw ApiError.internal('Cover artwork is unusable')
    return new Response(bytes, { headers: coverHeaders(mime) })
  })
}

async function findArtworkUrl(title: string, artist: string): Promise<string | null> {
  const term = [title, artist].map((part) => part.trim()).filter(Boolean).join(' ')
  if (!term) return null
  const query = LOOKUP_ENDPOINT + '?term=' + encodeURIComponent(term) + '&entity=song&limit=' + LOOKUP_LIMIT
  const response = await fetchAllowedResource(query, LOOKUP_ALLOWED_HOSTS, 'application/json')
  if (!response || !response.ok) return null
  const payload = await readUpstreamJson<{ results?: CatalogueTrack[] }>(response, MAX_CATALOGUE_BYTES)
  return pickArtworkUrl(title, artist, payload?.results ?? [])
}
