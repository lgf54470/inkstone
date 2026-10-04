import { DEFAULT_MAP_SOURCE, MAP_MAX_BYTES, isAllowedMapSource } from './chart/map-sources.ts'

/**
 * The outline data a `map` chart draws, read from this origin rather than the reader's browser.
 *
 * A post's reader has no settings to change, so the alternative — letting the browser fetch the
 * outline host itself — either fails quietly behind this site's own `connect-src 'self'` or needs that
 * policy relaxed for everybody, which also tells the outline host who read the page. Serving it from
 * here needs nothing relaxed: the request is same-origin like the page's own scripts, the visitor's
 * address never leaves for a third party, and the answer is cacheable at the edge for a day.
 *
 * What is *not* the same is who does the outbound request: this Worker does. So the allowlist that the
 * author's cell used to be checked against is checked again here before anything is fetched, and once
 * per redirect hop — a pinned host that answers with a `Location` pointing at an intranet address is
 * still this Worker fetching an intranet address.
 */

/** Where the client asks for outlines; the query names the file, which is validated before use. */
export const MAP_GEOMETRY_PATH = '/map-geojson'

const CACHE_CONTROL = 'public, max-age=86400'
const MAX_REDIRECTS = 5

export function mapGeometryUrl(source: string): string {
  return `${MAP_GEOMETRY_PATH}?source=${encodeURIComponent(source)}`
}

function isFeatureCollection(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((value as { features?: unknown }).features)
}

function failure(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** The outline host, followed only while every hop is a host this file names. */
async function fetchWithinAllowlist(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ response: Response } | { refused: true } | { failed: true }> {
  let next = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(next, {
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json' },
    }).catch(() => null)
    if (!response) return { failed: true }
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
    if (!location) return { response }
    // Resolved against the hop that announced it, then judged: a relative Location must not be able to
    // walk off the host list one step at a time.
    next = new URL(location, response.url || next).toString()
    if (!isAllowedMapSource(next)) return { refused: true }
  }
  return { failed: true }
}

/** The body, read no further than the cap: an allowlisted host must not be able to stream forever. */
async function readWithinLimit(response: Response): Promise<Uint8Array<ArrayBuffer> | 'too-large' | 'no-body'> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAP_MAX_BYTES) return 'too-large'
  if (!response.body) return 'no-body'
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAP_MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return 'too-large'
    }
    chunks.push(value)
  }
  // Over an ArrayBuffer it names, not the loose `ArrayBufferLike` a bare length infers: a Response body
  // takes a view on a buffer it can hand to the runtime, and that is what this one is about to be.
  const bytes = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * `GET /map-geojson?source=…`. Injectable fetch so the redirect walk and the caps are testable without
 * a network, the way the feed and sitemap endpoints take their inputs as arguments.
 */
export async function getMapGeometry(
  params: URLSearchParams,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Response> {
  const requested = params.get('source')?.trim() || DEFAULT_MAP_SOURCE
  // The list is what says a source may be fetched at all: https, and one of the named hosts.
  if (!isAllowedMapSource(requested)) {
    return failure('source_not_allowed', 'That outline source is not on the allowlist', 400)
  }
  const upstream = await fetchWithinAllowlist(requested, fetchImpl)
  if ('refused' in upstream) return failure('source_not_allowed', 'That outline source is not on the allowlist', 400)
  if ('failed' in upstream) return failure('upstream_unavailable', 'The outline could not be read', 502)
  if (!upstream.response.ok) {
    return failure('upstream_unavailable', `The outline host answered ${upstream.response.status}`, 502)
  }
  const bytes = await readWithinLimit(upstream.response)
  if (bytes === 'no-body') return failure('source_not_geojson', 'The outline host returned no body', 502)
  if (bytes === 'too-large') return failure('source_too_large', 'That outline file is too large', 413)
  let geometry: unknown
  try {
    geometry = JSON.parse(new TextDecoder().decode(bytes))
  }
  catch {
    return failure('source_not_geojson', 'That file is not GeoJSON', 502)
  }
  if (!isFeatureCollection(geometry)) {
    return failure('source_not_geojson', 'That file is not a GeoJSON FeatureCollection', 502)
  }
  return new Response(bytes, {
    headers: { 'content-type': 'application/json', 'cache-control': CACHE_CONTROL },
  })
}
