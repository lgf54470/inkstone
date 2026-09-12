import { musicCoverLookupUrl } from '../../lib/api'
import { coverDataUrlFromFrame, type ApicFrame } from './music-cover'

const LOOKUP_TIMEOUT_MS = 15_000

export async function lookupCoverDataUrl(title: string, artist: string): Promise<string | null> {
  const artwork = await searchCoverArtwork(title, artist)
  return artwork ? coverDataUrlFromFrame(artwork) : null
}

// The Worker queries the catalogue and returns the image, keeping third party calls off the page.
export async function searchCoverArtwork(title: string, artist: string): Promise<ApicFrame | null> {
  try {
    const response = await fetch(musicCoverLookupUrl(title, artist), { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) return null
    const mime = response.headers.get('content-type')?.split(';')[0] ?? ''
    return { mime: mime || 'image/jpeg', bytes }
  } catch (error) {
    console.warn('[inkstone] music cover lookup failed:', error)
    return null
  }
}
