import { extractCoverUrl } from '@shared/markdown-utils';
import { api } from '../../../lib/api';
import type { BlogStoreState, SetBlogStoreState } from './types';


export const blogLoadersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'loadAll' | 'loadPosts' | 'loadFolders' | 'loadTags' | 'loadCategories' | 'loadComments' | 'loadStats' | 'loadSettings'> => ({


  loadAll: async () => {
    set({ loading: true })
    try {
      await Promise.allSettled([
        get().loadStats(),
        get().loadPosts(),
        get().loadFolders(),
        get().loadTags(),
        get().loadCategories(),
        get().loadComments(),
        get().loadSettings(),
      ])
    } finally {
      set({ loading: false })
    }
  },


  loadPosts: async () => {
    const { statusFilter, categoryId, folderId, tag, search, sort } = get()
    try {
      const res = await api.blog.posts.list({
        status: statusFilter,
        categoryId: categoryId || undefined,
        folderId: folderId || undefined,
        tag: tag || undefined,
        search: search || undefined,
        sort,
      })
      const posts = (res.posts || []).map((p) => ({
        ...p,
        coverUrl: extractCoverUrl(p.coverUrl),
      }))
      set({ posts })
    } catch (err) {
      console.error('Failed to load blog posts', err)
    }
  },


  loadFolders: async () => {
    try {
      const folders = await api.blog.folders.list()
      set({ folders })
    } catch (err) {
      console.error('Failed to load blog folders', err)
    }
  },


  loadTags: async () => {
    try {
      const tags = await api.blog.tags.list()
      set({ tags })
    } catch (err) {
      console.error('Failed to load blog tags', err)
    }
  },


  loadCategories: async () => {
    try {
      const res = await api.blog.categories.list()
      set({ categories: res.categories })
    } catch (err) {
      console.error('Failed to load blog categories', err)
    }
  },


  loadComments: async () => {
    const { commentStatusFilter, commentSearch } = get()
    try {
      const res = await api.blog.comments.list({
        status: commentStatusFilter,
        search: commentSearch || undefined,
      })
      set({ comments: res.comments })
    } catch (err) {
      console.error('Failed to load blog comments', err)
    }
  },


  loadStats: async () => {
    try {
      const res = await api.blog.stats()
      set({ stats: res.stats })
    } catch (err) {
      console.error('Failed to load blog stats', err)
    }
  },


  loadSettings: async () => {
    try {
      const res = await api.blog.settings.get()
      set({ settings: res.settings })
    } catch (err) {
      console.error('Failed to load blog settings', err)
    }
  }
});
