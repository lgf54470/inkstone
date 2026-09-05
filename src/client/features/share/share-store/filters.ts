import type { ShareStoreState, SetShareStoreState } from './types';


export const shareFiltersActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'setCategory' | 'setFolderId' | 'setTag' | 'setStatusFilter' | 'setSearch' | 'setSort' | 'setViewMode' | 'setFilters' | 'setRetentionSettings' | 'toggleSelect' | 'toggleSelectAll' | 'clearSelection'> => ({


  setRetentionSettings: (settings) => {
    set((state) => {
      const updated = {
        logRetentionDays: settings.logRetentionDays ?? state.logRetentionDays,
        maxLogRecords: settings.maxLogRecords ?? state.maxLogRecords,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('inkstone_share_retention', JSON.stringify(updated))
        }
      } catch (error) {
        console.warn('[share-store] failed to persist retention settings', error)
      }
      return updated
    })
  },


  setFilters: (newFilters) => {
    set((state) => {
      const updated = {
        excludeBots: newFilters.excludeBots ?? state.excludeBots,
        excludeSelfReferrers: newFilters.excludeSelfReferrers ?? state.excludeSelfReferrers,
        excludeOwner: newFilters.excludeOwner ?? state.excludeOwner,
      }
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('inkstone_share_filters_v2', JSON.stringify(updated))
        }
      } catch (error) {
        console.warn('[share-store] failed to persist traffic filters', error)
      }
      return updated
    })
    void get().loadShares()
  },


  setCategory: (category) => {
    set({
      category,
      folderId: null,
      tag: null,
      selectedNoteIds: new Set(),
      statusFilter:
        category === 'active'
          ? 'active'
          : category === 'paused'
            ? 'paused'
            : category === 'pinned'
              ? 'pinned'
              : category === 'starred'
                ? 'starred'
                : category === 'password'
                  ? 'password'
                  : category === 'expiring'
                    ? 'expiring'
                    : category === 'permanent'
                      ? 'permanent'
                      : category === 'expired'
                        ? 'expired'
                        : 'all',
    })
    void get().loadShares()
  },


  setFolderId: (folderId) => {
    set({
      folderId,
      category: folderId ? 'all' : get().category,
      tag: null,
      statusFilter: 'all',
      selectedNoteIds: new Set(),
    })
    void get().loadShares()
  },


  setTag: (tag) => {
    set({
      tag,
      category: tag ? 'all' : get().category,
      folderId: null,
      statusFilter: 'all',
      selectedNoteIds: new Set(),
    })
    void get().loadShares()
  },


  setStatusFilter: (statusFilter) => {
    set({ statusFilter })
    void get().loadShares()
  },


  setSearch: (search) => {
    set({ search })
    void get().loadShares()
  },


  setSort: (sort) => {
    set({ sort })
    void get().loadShares()
  },


  setViewMode: (viewMode) => set({ viewMode }),


  toggleSelect: (noteId) => {
    set((state) => {
      const next = new Set(state.selectedNoteIds)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return { selectedNoteIds: next }
    })
  },


  toggleSelectAll: () => {
    const { shares, selectedNoteIds } = get()
    if (selectedNoteIds.size === shares.length) {
      set({ selectedNoteIds: new Set() })
    } else {
      set({ selectedNoteIds: new Set(shares.map((s) => s.noteId)) })
    }
  },


  clearSelection: () => set({ selectedNoteIds: new Set() })
});
