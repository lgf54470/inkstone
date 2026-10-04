/**
 * The outline data a `map` chart may load.
 *
 * A note's table cell names the source, so the list has to be closed: without it a note could point the
 * site's own Worker — which is what fetches outlines now — at an intranet address, or at any host that
 * would log who read the page. One list, read by the route that fetches and by the client that asks.
 */

/** Where the default country outlines come from when a table names no source of its own. */
export const DEFAULT_MAP_SOURCE = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'

export const MAP_SOURCE_HOSTS = ['geo.datav.aliyun.com'] as const

/**
 * The name a map is registered under when the note did not name one. Both halves of a map table have to
 * use it — the option's `series[].map` and the registration — so it is written once, here.
 */
export const MAP_SERIES_NAME = 'inkstone-map'

/** The largest outline payload a block will read, so one cell cannot ask for an unbounded download. */
export const MAP_MAX_BYTES = 4_000_000

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
