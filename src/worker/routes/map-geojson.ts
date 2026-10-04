import { Hono } from 'hono'
import { DEFAULT_MAP_SOURCE, MAP_MAX_BYTES, MAP_SOURCE_HOSTS, isAllowedMapSource } from '@shared/map-sources'
// The hop-by-hop allowlist walk already lives with the other route that reaches out to pinned
// hosts; it is taken through music's public entry rather than copied, because a second implementation
// of "follow a redirect only to a host we named" is exactly the kind of thing that drifts.
import { fetchAllowedResource } from './music'
import { ResponseTooLargeError, readResponseBytesWithinLimit } from '../backup/common'
import type { AppBindings } from '../env'

/**
 * The outline data a `map` chart draws, fetched from this origin.
 *
 * The alternative — letting the browser fetch the third-party host directly — costs more than it
 * saves: it needs `connect-src` widened for everyone, it tells the outline host who read the page,
 * and it fails silently on a shared post, where the reader has no settings to change. Read from here
 * instead, so a map works everywhere with no policy relaxed and the visitor's own address never
 * leaves for a third party.
 *
 * A GET, so `requireClientHeader` does not gate it and an anonymous reader of a shared page may call
 * it. It carries no user data in either direction: the only input is which public file to read.
 */
export const mapGeoJsonRoutes = new Hono<AppBindings>()

const CACHE_CONTROL = 'public, max-age=86400'

function isFeatureCollection(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((value as { features?: unknown }).features)
}

mapGeoJsonRoutes.get('/map-geojson', async (c) => {
  const requested = c.req.query('source') ?? DEFAULT_MAP_SOURCE
  // Checked before anything is fetched, and again per redirect hop inside the fetcher: the worker
  // following a redirect is still the worker fetching.
  if (!isAllowedMapSource(requested)) {
    return c.json({ error: { code: 'source_not_allowed', message: 'That outline source is not on the allowlist' } }, 400)
  }
  const upstream = await fetchAllowedResource(requested, MAP_SOURCE_HOSTS, 'application/json')
  if (!upstream) {
    return c.json({ error: { code: 'source_not_allowed', message: 'That outline source is not on the allowlist' } }, 400)
  }
  if (!upstream.ok) {
    return c.json({ error: { code: 'upstream_unavailable', message: `The outline host answered ${upstream.status}` } }, 502)
  }
  let bytes: Uint8Array
  try {
    bytes = await readResponseBytesWithinLimit(upstream, MAP_MAX_BYTES)
  }
  catch (err) {
    const tooLarge = err instanceof ResponseTooLargeError
    return c.json({ error: { code: tooLarge ? 'source_too_large' : 'upstream_unavailable', message: tooLarge ? 'That outline file is too large' : 'The outline could not be read' } }, tooLarge ? 413 : 502)
  }
  let geometry: unknown
  try {
    geometry = JSON.parse(new TextDecoder().decode(bytes))
  }
  catch {
    return c.json({ error: { code: 'source_not_geojson', message: 'That file is not GeoJSON' } }, 502)
  }
  if (!isFeatureCollection(geometry)) {
    return c.json({ error: { code: 'source_not_geojson', message: 'That file is not a GeoJSON FeatureCollection' } }, 502)
  }
  return new Response(bytes, {
    headers: { 'content-type': 'application/json', 'cache-control': CACHE_CONTROL },
  })
})
