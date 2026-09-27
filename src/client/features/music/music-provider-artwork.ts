import { musicProviderCoverUrl } from '../../lib/api'
import { coverDataUrlFromFrame } from './music-cover'

const COVER_FETCH_TIMEOUT_MS = 15_000

// FB-F5: an online hit has no cover on disk — the catalogue keeps one under its own picture id.
// The worker fetches the bytes (the page may not talk to that host), and the same downscale every
// other cover goes through turns them into the data URL a row or card can paint.
//
// Best effort by design: failing to get a picture must not fail the add, so a catalogue that will
// not answer leaves the row coverless and the reason is logged.
export async function providerCoverDataUrl(source: string, coverId: string | null): Promise<string | null> {
  const id = coverId?.trim()
  if (!id) return null
  try {
    const response = await fetch(musicProviderCoverUrl(source, id), { signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS) })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0) return null
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    return await coverDataUrlFromFrame({ mime: mime.startsWith('image/') ? mime : 'image/jpeg', bytes })
  } catch (error) {
    console.warn('[inkstone] music provider cover failed:', error)
    return null
  }
}
