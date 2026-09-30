export const TRAFFIC_FILTERS_KEY = 'inkstone_blog_traffic_filters'

/**
 * What an unread store holds. The stored filters are read when the hub opens (see
 * `hydrateTrafficFilters`), not when this module is evaluated: the module loads with the app, so a
 * read at module scope would touch `localStorage` on every page and in every test for a switch only
 * the blog hub shows.
 */
export const DEFAULT_TRAFFIC_FILTERS = {
  excludeBots: true,
  excludeSelfReferrers: false,
  excludeOwner: false,
}

export function loadInitialFilters(): { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean } {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(TRAFFIC_FILTERS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          excludeBots: parsed.excludeBots !== false,
          excludeSelfReferrers: Boolean(parsed.excludeSelfReferrers),
          excludeOwner: Boolean(parsed.excludeOwner),
        }
      }
    } catch (error) {
      console.warn('[blog-store] failed to load traffic filters', error)
    }
  }
  return { ...DEFAULT_TRAFFIC_FILTERS }
}
