import { api } from '../../../lib/api';
import type { ShareStoreState, SetShareStoreState } from './types';



export let loadEpoch = 0

export const shareLoadersActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'loadFolders' | 'loadTags' | 'loadShares'> => ({


  loadFolders: async () => {
    try {
      const folders = await api.share.folders.list()
      set({ folders })
    } catch (error) {
      console.warn('[share-store] failed to load folders', error)
    }
  },


  loadTags: async () => {
    try {
      const tags = await api.share.tags.list()
      set({ tags })
    } catch (error) {
      console.warn('[share-store] failed to load tags', error)
    }
  },


  loadShares: async () => {
    const epoch = ++loadEpoch
    set({ loading: true })
    try {
      const { folderId, tag, statusFilter, search, sort, excludeBots, excludeSelfReferrers, excludeOwner } = get()
      const res = await api.share.list({
        folderId,
        tag,
        status: statusFilter,
        search: search.trim() || undefined,
        sort,
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      void get().loadFolders()
      void get().loadTags()
      if (epoch === loadEpoch) {
        set({
          shares: res.shares,
          globalStats: res.globalStats,
          loading: false,
        })
      }
    } catch {
      if (epoch === loadEpoch) {
        set({ loading: false })
      }
    }
  }
});
