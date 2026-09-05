



export const TRAFFIC_FILTERS_KEY = 'inkstone_blog_traffic_filters'


export const RETENTION_SETTINGS_KEY = 'inkstone_blog_retention_settings'



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
  return {
    excludeBots: true,
    excludeSelfReferrers: false,
    excludeOwner: false,
  }
}



export function loadInitialRetention(): { logRetentionDays: number; maxLogRecords: number } {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(RETENTION_SETTINGS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          logRetentionDays: typeof parsed.logRetentionDays === 'number' ? parsed.logRetentionDays : 30,
          maxLogRecords: typeof parsed.maxLogRecords === 'number' ? parsed.maxLogRecords : 1000,
        }
      }
    } catch (error) {
      console.warn('[blog-store] failed to load retention settings', error)
    }
  }
  return {
    logRetentionDays: 30,
    maxLogRecords: 1000,
  }
}



export const initialFilters = loadInitialFilters()


export const initialRetention = loadInitialRetention()
