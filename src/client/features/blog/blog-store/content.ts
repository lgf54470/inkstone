import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';


export const blogContentActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'createTag' | 'patchTag' | 'deleteTag'> => ({


  createFolder: async (name, parentId, color, icon) => {
    try {
      const folder = await api.blog.folders.create({ name, parentId, color, icon })
      set((s) => ({
        folders: [...s.folders, folder],
        stats: s.stats
          ? {
              ...s.stats,
              folderCounts: {
                ...s.stats.folderCounts,
                [folder.id]: { total: 0, published: 0 },
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
      const folder = await api.blog.folders.patch(id, patch)
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
      await api.blog.folders.remove(id)
      set((s) => ({
        folders: s.folders.filter((f) => f.id !== id),
        folderId: s.folderId === id ? null : s.folderId,
      }))
      await Promise.all([get().loadPosts(), get().loadStats()])
      return true
    } catch {
      return false
    }
  },


  createTag: async (name, color) => {
    try {
      const tag = await api.blog.tags.create({ name, color })
      set((s) => ({
        tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
        stats: s.stats
          ? {
              ...s.stats,
              tagCounts: {
                ...s.stats.tagCounts,
                [tag.name]: { total: 0, published: 0 },
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
      const tag = await api.blog.tags.patch(id, patch)
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
      await api.blog.tags.remove(id)
      const removed = get().tags.find((t) => t.id === id)
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== id),
        tag: removed && s.tag === removed.name ? null : s.tag,
      }))
      await Promise.all([get().loadPosts(), get().loadStats()])
      return true
    } catch {
      return false
    }
  }
});
