import { TRAFFIC_FILTERS_KEY, RETENTION_SETTINGS_KEY } from './state';
import type { BlogStoreState, SetBlogStoreState } from './types';


export const blogFiltersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'setActiveTab' | 'setStatusFilter' | 'setCategoryId' | 'setFolderId' | 'setTag' | 'setSearch' | 'setSort' | 'setViewMode' | 'toggleSelectPost' | 'selectAllPosts' | 'clearPostSelection' | 'setCommentStatusFilter' | 'setCommentSearch' | 'toggleSelectComment' | 'selectAllComments' | 'clearCommentSelection' | 'setFilters' | 'setRetentionSettings'> => ({

  setFilters: (newFilters) => {
    set((state) => {
      const updated = {
        excludeBots: newFilters.excludeBots ?? state.excludeBots,
        excludeSelfReferrers: newFilters.excludeSelfReferrers ?? state.excludeSelfReferrers,
        excludeOwner: newFilters.excludeOwner ?? state.excludeOwner,
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(TRAFFIC_FILTERS_KEY, JSON.stringify(updated))
        } catch (error) {
          console.warn('[blog-store] failed to persist traffic filters', error)
        }
      }
      return updated
    })
    void get().loadPosts()
    void get().loadStats()
  },

  setRetentionSettings: (newSettings) => {
    set({
      logRetentionDays: newSettings.logRetentionDays,
      maxLogRecords: newSettings.maxLogRecords,
    })
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RETENTION_SETTINGS_KEY, JSON.stringify(newSettings))
      } catch (error) {
        console.warn('[blog-store] failed to persist retention settings', error)
      }
    }
  },


  setActiveTab: (activeTab) => set({ activeTab }),

  setStatusFilter: (statusFilter) => {
    set({ statusFilter, folderId: null, tag: null, activeTab: 'posts' })
    void get().loadPosts()
  },

  setCategoryId: (categoryId) => {
    set({ categoryId, activeTab: 'posts' })
    void get().loadPosts()
  },

  setFolderId: (folderId) => {
    set({ folderId, tag: null, statusFilter: 'all', activeTab: 'posts' })
    void get().loadPosts()
  },

  setTag: (tag) => {
    set({ tag, folderId: null, statusFilter: 'all', activeTab: 'posts' })
    void get().loadPosts()
  },

  setSearch: (search) => {
    set({ search })
    void get().loadPosts()
  },

  setSort: (sort) => {
    set({ sort })
    void get().loadPosts()
  },

  setViewMode: (viewMode) => set({ viewMode }),


  toggleSelectPost: (id) =>
    set((state) => {
      const next = new Set(state.selectedPostIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedPostIds: next }
    }),

  selectAllPosts: (ids) => set({ selectedPostIds: new Set(ids) }),

  clearPostSelection: () => set({ selectedPostIds: new Set() }),


  setCommentStatusFilter: (commentStatusFilter) => {
    set({ commentStatusFilter })
    void get().loadComments()
  },

  setCommentSearch: (commentSearch) => {
    set({ commentSearch })
    void get().loadComments()
  },

  toggleSelectComment: (id) =>
    set((state) => {
      const next = new Set(state.selectedCommentIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedCommentIds: next }
    }),

  selectAllComments: (ids) => set({ selectedCommentIds: new Set(ids) }),

  clearCommentSelection: () => set({ selectedCommentIds: new Set() })
});
