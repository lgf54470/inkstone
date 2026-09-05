import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';


export const blogActionsActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'batchToggleGroup' | 'batchMoveToFolder' | 'savePost' | 'updatePost' | 'deletePost' | 'syncPost' | 'batchPosts' | 'updateCommentStatus' | 'deleteComment' | 'batchComments' | 'createCategory' | 'updateCategory' | 'deleteCategory' | 'saveSettings'> => ({


  batchToggleGroup: async (type, target, enabled) => {
    set({ batchBusy: true })
    set((state) => {
      const updatedPosts = state.posts.map((p) => {
        if (type === 'folder') {
          if (p.folderId === target) {
            return { ...p, isPublished: enabled }
          }
        } else if (type === 'tag') {
          if (Array.isArray(p.tags) && p.tags.includes(target)) {
            return { ...p, isPublished: enabled }
          }
        }
        return p
      })

      let updatedStats = state.stats
      if (updatedStats) {
        if (type === 'folder' && updatedStats.folderCounts?.[target]) {
          const prev = updatedStats.folderCounts[target]
          updatedStats = {
            ...updatedStats,
            folderCounts: {
              ...updatedStats.folderCounts,
              [target]: {
                total: prev.total,
                published: enabled ? prev.total : 0,
              },
            },
          }
        }
        if (type === 'tag' && updatedStats.tagCounts?.[target]) {
          const prev = updatedStats.tagCounts[target]
          updatedStats = {
            ...updatedStats,
            tagCounts: {
              ...updatedStats.tagCounts,
              [target]: {
                total: prev.total,
                published: enabled ? prev.total : 0,
              },
            },
          }
        }
      }

      return { posts: updatedPosts, stats: updatedStats }
    })

    try {
      await api.blog.batchToggleGroup(type, target, enabled)
      await Promise.all([get().loadPosts(), get().loadStats()])
      return true
    } catch {
      await Promise.all([get().loadPosts(), get().loadStats()])
      return false
    } finally {
      set({ batchBusy: false })
    }
  },


  batchMoveToFolder: async (postIds, folderId) => {
    if (!postIds.length) return false
    set({ batchBusy: true })
    set((state) => ({
      posts: state.posts.map((p) => (postIds.includes(p.id) ? { ...p, folderId } : p)),
    }))
    try {
      await api.blog.posts.batch('setFolder', postIds, { folderId })
      get().clearPostSelection()
      await Promise.all([get().loadPosts(), get().loadStats()])
      return true
    } catch {
      await get().loadPosts()
      return false
    } finally {
      set({ batchBusy: false })
    }
  },


  savePost: async (data) => {
    const res = await api.blog.posts.create(data)
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()])
    return res
  },


  updatePost: async (id, patch) => {
    set((state) => ({
      posts: state.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
    await api.blog.posts.patch(id, patch)
    await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()])
  },


  deletePost: async (id) => {
    await api.blog.posts.remove(id)
    await Promise.all([get().loadPosts(), get().loadStats()])
  },


  syncPost: async (id) => {
    await api.blog.posts.sync(id)
    await get().loadPosts()
  },


  batchPosts: async (action, extraId, pinnedState) => {
    const ids = Array.from(get().selectedPostIds)
    if (!ids.length) return
    set({ batchBusy: true })
    try {
      await api.blog.posts.batch(action, ids, {
        categoryId: extraId,
        folderId: extraId,
        isPinned: pinnedState,
      })
      get().clearPostSelection()
      await Promise.all([get().loadPosts(), get().loadStats(), get().loadTags()])
    } finally {
      set({ batchBusy: false })
    }
  },


  updateCommentStatus: async (id, status) => {
    await api.blog.comments.updateStatus(id, status)
    await Promise.all([get().loadComments(), get().loadStats()])
  },


  deleteComment: async (id) => {
    await api.blog.comments.remove(id)
    await Promise.all([get().loadComments(), get().loadStats()])
  },


  batchComments: async (action) => {
    const ids = Array.from(get().selectedCommentIds)
    if (!ids.length) return
    set({ batchBusy: true })
    try {
      await api.blog.comments.batch(action, ids)
      get().clearCommentSelection()
      await Promise.all([get().loadComments(), get().loadStats()])
    } finally {
      set({ batchBusy: false })
    }
  },


  createCategory: async (data) => {
    await api.blog.categories.create(data)
    await get().loadCategories()
  },


  updateCategory: async (id, patch) => {
    await api.blog.categories.patch(id, patch)
    await get().loadCategories()
  },


  deleteCategory: async (id) => {
    await api.blog.categories.remove(id)
    await Promise.all([get().loadCategories(), get().loadPosts()])
  },


  saveSettings: async (settings) => {
    const res = await api.blog.settings.patch(settings)
    set({ settings: res.settings })
  }
});
