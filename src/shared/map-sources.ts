/**
 * The outline data a `map` chart may load.
 *
 * A note's table cell names the source, so the list has to be closed: without it a note could point a
 * reader's browser at an intranet address, or at any host that would log who read the page. The same
 * list is what the response's `connect-src` is widened with, and only for a viewer who already opted
 * into third-party resources — one list, read by the two layers that must agree.
 */

/** Where the default country outlines come from when a table names no source of its own. */
export const DEFAULT_MAP_SOURCE = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'

export const MAP_SOURCE_HOSTS = ['geo.datav.aliyun.com'] as const

/** The largest outline payload a block will read, so one cell cannot ask for an unbounded download. */
export const MAP_MAX_BYTES = 4_000_000

/**
 * Where a browser asks for an outline. Same origin, so no third-party connection is needed and the
 * page's `connect-src` stays closed; the Worker is the one that reads the allowlisted host.
 */
export const MAP_GEOMETRY_PATH = '/api/map-geojson'

export function mapGeometryUrl(source: string): string {
  return `${MAP_GEOMETRY_PATH}?source=${encodeURIComponent(source)}`
}

export function isAllowedMapSource(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return false
  }
  return url.protocol === 'https:' && (MAP_SOURCE_HOSTS as readonly string[]).includes(url.hostname)
}
