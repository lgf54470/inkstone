import { loadInitialFilters, TRAFFIC_FILTERS_KEY } from './state'
import type { BlogStoreState, SetBlogStoreState } from './types'

export const blogFiltersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'setActiveTab' | 'setStatusFilter' | 'setCategoryId' | 'setFolderId' | 'setTag' | 'setSearch' | 'setSort' | 'setViewMode' | 'setPostsPage' | 'toggleSelectPost' | 'selectAllPosts' | 'clearPostSelection' | 'setCommentStatusFilter' | 'setCommentSearch' | 'toggleSelectComment' | 'selectAllComments' | 'clearCommentSelection' | 'setFilters' | 'hydrateTrafficFilters'> => ({
  hydrateTrafficFilters: () => set(loadInitialFilters()),
  setFilters: (newFilters) => setFiltersImpl(newFilters, set, get),
  setActiveTab: (activeTab) => set({ activeTab }),
  setStatusFilter: (statusFilter) => applyPostFilter(set, get, { statusFilter, folderId: null, tag: null, activeTab: 'posts' }),
  setCategoryId: (categoryId) => applyPostFilter(set, get, { categoryId, activeTab: 'posts' }),
  setFolderId: (folderId) => applyPostFilter(set, get, { folderId, tag: null, statusFilter: 'all', activeTab: 'posts' }),
  setTag: (tag) => applyPostFilter(set, get, { tag, folderId: null, statusFilter: 'all', activeTab: 'posts' }),
  setSearch: (search) => applyPostFilter(set, get, { search }),
  setSort: (sort) => applyPostFilter(set, get, { sort }),
  setPostsPage: (page) => setPostsPageImpl(page, set, get),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleSelectPost: (id) => set((state) => ({ selectedPostIds: toggleSelectedId(state.selectedPostIds, id) })),
  selectAllPosts: (ids) => set({ selectedPostIds: new Set(ids) }),
  clearPostSelection: () => set({ selectedPostIds: new Set() }),
  setCommentStatusFilter: (commentStatusFilter) => applyCommentFilter(set, get, { commentStatusFilter }),
  setCommentSearch: (commentSearch) => applyCommentFilter(set, get, { commentSearch }),
  toggleSelectComment: (id) => set((state) => ({ selectedCommentIds: toggleSelectedId(state.selectedCommentIds, id) })),
  selectAllComments: (ids) => set({ selectedCommentIds: new Set(ids) }),
  clearCommentSelection: () => set({ selectedCommentIds: new Set() }),
})

function applyPostFilter(set: SetBlogStoreState, get: () => BlogStoreState, patch: Partial<BlogStoreState>): void {
  // Any filter change re-asks page one: staying on the old page after narrowing the list would show
  // an empty screen for a filter that does have matches.
  set({ ...patch, postsPage: 1 })
  void get().loadPosts()
}

function setPostsPageImpl(page: number, set: SetBlogStoreState, get: () => BlogStoreState): void {
  const lastPage = Math.max(1, get().postsTotalPages)
  const next = Math.min(Math.max(1, Math.trunc(page)), lastPage)
  if (next === get().postsPage) return
  set({ postsPage: next })
  void get().loadPosts()
}

function applyCommentFilter(set: SetBlogStoreState, get: () => BlogStoreState, patch: Partial<BlogStoreState>): void {
  set(patch)
  void get().loadComments()
}

function toggleSelectedId(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function setFiltersImpl(
  newFilters: Parameters<BlogStoreState['setFilters']>[0],
  set: SetBlogStoreState,
  get: () => BlogStoreState,
): void {
  const current = get()
  const updated = {
    excludeBots: newFilters.excludeBots ?? current.excludeBots,
    excludeSelfReferrers: newFilters.excludeSelfReferrers ?? current.excludeSelfReferrers,
    excludeOwner: newFilters.excludeOwner ?? current.excludeOwner,
  }
  // The store updater has to stay pure (StrictMode runs it twice), so both the write and the
  // persistence happen outside it — once, in the order the reader's click implies. The two list
  // refetches that used to follow are gone: these switches decide what the analytics endpoint
  // measures, and the dashboard that reads them re-queries on its own. `loadPosts`/`loadStats` never
  // sent them, so those requests only re-downloaded the same rows.
  set(updated)
  persistTrafficFilters(updated)
}

function persistTrafficFilters(updated: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TRAFFIC_FILTERS_KEY, JSON.stringify(updated))
  } catch (error) {
    console.warn('[blog-store] failed to persist traffic filters', error)
  }
}