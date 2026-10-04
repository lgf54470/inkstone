/**
 * The outline data a `map` series draws.
 *
 * Which host may be asked is decided in ./table-option (against the shared allowlist); this file only
 * performs the fetch and refuses to hand the library anything that is not a GeoJSON feature
 * collection. A map that cannot load says so on the block — a blank outline reads as a chart with no
 * data in it, which is the opposite of the truth.
 */
import { MAP_MAX_BYTES, mapGeometryUrl } from '@shared/map-sources'

const MAP_FETCH_TIMEOUT_MS = 15000

/** The name a registered source answers to, shared with the option ./table-option builds. */
export const MAP_SERIES_NAME = 'inkstone-map'

const loaded = new Map<string, Promise<unknown>>()

function isFeatureCollection(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((value as { features?: unknown }).features)
}

async function fetchGeometry(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), MAP_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(mapGeometryUrl(url), { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    if (text.length > MAP_MAX_BYTES) throw new Error('outline data too large')
    const geometry: unknown = JSON.parse(text)
    if (!isFeatureCollection(geometry)) throw new Error('not a GeoJSON FeatureCollection')
    return geometry
  }
  finally {
    window.clearTimeout(timer)
  }
}

/**
 * The geometry for one source, fetched once per session. A failure clears its own entry so the block's
 * retry can try again, and so one note's bad URL does not poison every later block that names it.
 */
export function loadMapGeometry(url: string): Promise<unknown> {
  let pending = loaded.get(url)
  if (!pending) {
    pending = fetchGeometry(url)
    loaded.set(url, pending)
    void pending.catch(() => {
      if (loaded.get(url) === pending) loaded.delete(url)
    })
  }
  return pending
}
