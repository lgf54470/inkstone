import type { Hono } from 'hono'
import { pickArtworkUrl, type CatalogueTrack } from '@shared/music-cover-match'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { coverHeaders } from './cover'
import { coverLookupQuerySchema } from './schemas'

// The catalogue request runs here because the page's CSP forbids third party connections.
const LOOKUP_ENDPOINT = 'https://itunes.apple.com/search'
const LOOKUP_LIMIT = 5
const LOOKUP_TIMEOUT_MS = 12_000
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024

export function registerMusicCoverLookupRoutes(routes: Hono<AppBindings>): void {
  routes.get('/cover-lookup', requireAuth, async (c) => {
    const query = coverLookupQuerySchema.safeParse({ title: c.req.query('title'), artist: c.req.query('artist') })
    if (!query.success) throw ApiError.badRequest('Provide a track title to look up')
    const artworkUrl = await findArtworkUrl(query.data.title, query.data.artist ?? '')
    if (!artworkUrl) throw ApiError.notFound('No cover matched this track')
    const response = await fetch(artworkUrl, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    if (!response.ok) throw ApiError.internal('Cover artwork is unavailable')
    const bytes = await response.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > MAX_ARTWORK_BYTES) throw ApiError.internal('Cover artwork is unusable')
    const mime = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    return new Response(bytes, { headers: coverHeaders(mime) })
  })
}

async function findArtworkUrl(title: string, artist: string): Promise<string | null> {
  const term = [title, artist].map((part) => part.trim()).filter(Boolean).join(' ')
  if (!term) return null
  const query = LOOKUP_ENDPOINT + '?term=' + encodeURIComponent(term) + '&entity=song&limit=' + LOOKUP_LIMIT
  const response = await fetch(query, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const payload = (await response.json()) as { results?: CatalogueTrack[] }
  return pickArtworkUrl(title, artist, payload.results ?? [])
}
