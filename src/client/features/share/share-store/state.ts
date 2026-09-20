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
