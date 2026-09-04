import { create } from 'zustand'
import type {
  BlogPost,
  BlogCategory,
  BlogComment,
  BlogCommentStatus,
  BlogStats,
  BlogSettings,
} from '@shared/types'
import { extractCoverUrl } from '@shared/markdown-utils'
import { api } from '../../lib/api'

export type BlogTab = 'dashboard' | 'posts' | 'comments' | 'categories' | 'settings'

interface BlogStoreState {
  activeTab: BlogTab
  statusFilter: 'all' | 'published' | 'draft'
  categoryId: string | null
  tag: string | null
  search: string
  sort: string
  viewMode: 'table' | 'grid'
  selectedPostIds: Set<string>

  // Comments review state
  commentStatusFilter: 'all' | 'pending' | 'approved' | 'rejected' | 'spam'
  commentSearch: string
  selectedCommentIds: Set<string>

  posts: BlogPost[]
  categories: BlogCategory[]
  comments: BlogComment[]
  stats: BlogStats | null
  settings: BlogSettings | null
  loading: boolean
  batchBusy: boolean

  setActiveTab: (tab: BlogTab) => void
  setStatusFilter: (status: 'all' | 'published' | 'draft') => void
  setCategoryId: (id: string | null) => void
  setTag: (tag: string | null) => void
  setSearch: (search: string) => void
  setSort: (sort: string) => void
  setViewMode: (mode: 'table' | 'grid') => void
  toggleSelectPost: (id: string) => void
  selectAllPosts: (ids: string[]) => void
  clearPostSelection: () => void

  setCommentStatusFilter: (status: 'all' | 'pending' | 'approved' | 'rejected' | 'spam') => void
  setCommentSearch: (search: string) => void
  toggleSelectComment: (id: string) => void
  selectAllComments: (ids: string[]) => void
  clearCommentSelection: () => void

  loadAll: () => Promise<void>
  loadPosts: () => Promise<void>
  loadCategories: () => Promise<void>
  loadComments: () => Promise<void>
  loadStats: () => Promise<void>
  loadSettings: () => Promise<void>

  // Post Actions
  savePost: (data: {
    noteId: string
    title: string
    slug?: string
    excerpt?: string
    content?: string
    coverUrl?: string
    categoryId?: string | null
    tags?: string[]
    isPublished?: boolean
    allowComments?: boolean
    isPinned?: boolean
  }) => Promise<{ ok: boolean; id: string; slug: string }>
  updatePost: (id: string, patch: Partial<BlogPost>) => Promise<void>
  deletePost: (id: string) => Promise<void>
  syncPost: (id: string) => Promise<void>
  batchPosts: (action: 'publish' | 'unpublish' | 'delete' | 'setCategory', categoryId?: string | null) => Promise<void>

  // Comment Actions
  updateCommentStatus: (id: string, status: BlogCommentStatus) => Promise<void>
  deleteComment: (id: string) => Promise<void>
  batchComments: (action: 'approve' | 'reject' | 'spam' | 'delete') => Promise<void>

  // Category Actions
  createCategory: (data: { name: string; slug?: string; description?: string; color?: string; icon?: string }) => Promise<void>
  updateCategory: (id: string, patch: Partial<BlogCategory>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  // Settings Actions
  saveSettings: (settings: Partial<BlogSettings>) => Promise<void>
}

export const useBlogStore = create<BlogStoreState>((set, get) => ({
  activeTab: 'dashboard',
  statusFilter: 'all',
  categoryId: null,
  tag: null,
  search: '',
  sort: 'published_desc',
  viewMode: 'table',
  selectedPostIds: new Set<string>(),

  commentStatusFilter: 'all',
  commentSearch: '',
  selectedCommentIds: new Set<string>(),

  posts: [],
  categories: [],
  comments: [],
  stats: null,
  settings: null,
  loading: false,
  batchBusy: false,

  setActiveTab: (activeTab) => set({ activeTab }),
  setStatusFilter: (statusFilter) => {
    set({ statusFilter })
    void get().loadPosts()
  },
  setCategoryId: (categoryId) => {
    set({ categoryId })
    void get().loadPosts()
  },
  setTag: (tag) => {
    set({ tag })
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
  clearCommentSelection: () => set({ selectedCommentIds: new Set() }),

  loadAll: async () => {
    set({ loading: true })
    try {
      await Promise.allSettled([
        get().loadStats(),
        get().loadPosts(),
        get().loadCategories(),
        get().loadComments(),
        get().loadSettings(),
      ])
    } finally {
      set({ loading: false })
    }
  },

  loadPosts: async () => {
    const { statusFilter, categoryId, tag, search, sort } = get()
    try {
      const res = await api.blog.posts.list({
        status: statusFilter,
        categoryId: categoryId || undefined,
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
  },

  savePost: async (data) => {
    const res = await api.blog.posts.create(data)
    await Promise.all([get().loadPosts(), get().loadStats()])
    return res
  },

  updatePost: async (id, patch) => {
    await api.blog.posts.patch(id, patch)
    await Promise.all([get().loadPosts(), get().loadStats()])
  },

  deletePost: async (id) => {
    await api.blog.posts.remove(id)
    await Promise.all([get().loadPosts(), get().loadStats()])
  },

  syncPost: async (id) => {
    await api.blog.posts.sync(id)
    await get().loadPosts()
  },

  batchPosts: async (action, categoryId) => {
    const ids = Array.from(get().selectedPostIds)
    if (!ids.length) return
    set({ batchBusy: true })
    try {
      await api.blog.posts.batch(action, ids, categoryId)
      get().clearPostSelection()
      await Promise.all([get().loadPosts(), get().loadStats()])
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
  },
}))
