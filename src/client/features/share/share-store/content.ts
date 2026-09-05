import { api } from '../../../lib/api';
import type { ShareStoreState, SetShareStoreState } from './types';


export const shareContentActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'createTag' | 'patchTag' | 'deleteTag'> => ({


  createFolder: async (name, parentId, color, icon) => {
    try {
      const folder = await api.share.folders.create({ name, parentId, color, icon })
      set((s) => ({
        folders: [...s.folders, folder],
        globalStats: s.globalStats
          ? {
              ...s.globalStats,
              folderCounts: {
                ...s.globalStats.folderCounts,
                [folder.id]: { total: 0, shared: 0 },
              },
            }
          : null,
      }))
      return folder
    } catch {
      return null
    }
  },


  patchFolder: async (id, patch) => {
    try {
      const folder = await api.share.folders.patch(id, patch)
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? folder : f)),
      }))
      return folder
    } catch {
      return null
    }
  },


  deleteFolder: async (id) => {
    try {
      await api.share.folders.remove(id)
      set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        folderId: s.folderId === id ? null : s.folderId,
      }))
      await get().loadShares()
      return true
    } catch {
      return false
    }
  },


  createTag: async (name, color) => {
    try {
      const tag = await api.share.tags.create({ name, color })
      set((s) => ({
        tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
        globalStats: s.globalStats
          ? {
              ...s.globalStats,
              tagCounts: {
                ...s.globalStats.tagCounts,
                [tag.name]: { total: 0, shared: 0 },
              },
            }
          : null,
      }))
      return tag
    } catch {
      return null
    }
  },


  patchTag: async (id, patch) => {
    try {
      const tag = await api.share.tags.patch(id, patch)
      set((s) => ({
        tags: s.tags.map((t) => (t.id === id ? tag : t)),
      }))
      return tag
    } catch {
      return null
    }
  },


  deleteTag: async (id) => {
    try {
      const tag = get().tags.find((t) => t.id === id)
      await api.share.tags.remove(id)
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
        tag: tag && s.tag === tag.name ? null : s.tag,
      }))
      await get().loadShares()
      return true
    } catch {
      return false
    }
  }
});
