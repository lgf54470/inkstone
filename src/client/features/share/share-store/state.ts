



const DEFAULT_MAX_LOG_RECORDS = 10_000

export function loadInitialMaxLogRecords(): number {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('inkstone_share_retention') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return typeof parsed.maxLogRecords === 'number' ? parsed.maxLogRecords : DEFAULT_MAX_LOG_RECORDS
    }
  } catch (error) {
    console.warn('[share-store] failed to load the visit log record cap', error)
  }
  return DEFAULT_MAX_LOG_RECORDS
}



export function loadInitialFilters(): { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('inkstone_share_filters_v2') : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        excludeBots: parsed.excludeBots !== false,
        excludeSelfReferrers: Boolean(parsed.excludeSelfReferrers),
        excludeOwner: Boolean(parsed.excludeOwner),
      }
    }
  } catch (error) {
    console.warn('[share-store] failed to load traffic filters', error)
  }
  return {
    excludeBots: true,
    excludeSelfReferrers: false,
    excludeOwner: false,
  }
}



export const initialFilters = loadInitialFilters()


export const initialMaxLogRecords = loadInitialMaxLogRecords()
