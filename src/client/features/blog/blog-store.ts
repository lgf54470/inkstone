import { create } from 'zustand'
import type {
  BlogPost,
  BlogCategory,
  BlogComment,
  BlogCommentStatus,
  BlogStats,
  BlogSettings,
  BlogFolder,
  BlogTag,
} from '@shared/types'
import { extractCoverUrl } from '@shared/markdown-utils'
import { api } from '../../lib/api'

export type BlogTab = 'dashboard' | 'posts' | 'comments' | 'categories' | 'settings'

export interface BlogFolderNode {
  folder: BlogFolder
  children: BlogFolderNode[]
  depth: number
}

export function buildBlogFolderTree(folders: BlogFolder[]): BlogFolderNode[] {
  const map = new Map<string, BlogFolderNode>()
  const roots: BlogFolderNode[] = []
  for (const f of folders) {
    map.set(f.id, { folder: f, children: [], depth: 0 })
  }
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parentId && map.has(f.parentId)) {
      const parent = map.get(f.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

interface BlogStoreState {
  activeTab: BlogTab
  statusFilter: 'all' | 'published' | 'draft' | 'pinned'
  categoryId: string | null
  folderId: string | null
  tag: string | null
  search: string
  sort: string
  viewMode: 'table' | 'grid'
  selectedPostIds: Set<string>

  commentStatusFilter: 'all' | 'pending' | 'approved' | 'rejected' | 'spam'
  commentSearch: string
  selectedCommentIds: Set<string>

  posts: BlogPost[]
  folders: BlogFolder[]
  tags: BlogTag[]
  categories: BlogCategory[]
  comments: BlogComment[]
  stats: BlogStats | null
  settings: BlogSettings | null
  loading: boolean
  batchBusy: boolean

  setActiveTab: (tab: BlogTab) => void
  setStatusFilter: (status: 'all' | 'published' | 'draft' | 'pinned') => void
  setCategoryId: (id: string | null) => void
  setFolderId: (folderId: string | null) => void
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
  loadFolders: () => Promise<void>
  loadTags: () => Promise<void>
  loadCategories: () => Promise<void>
  loadComments: () => Promise<void>
  loadStats: () => Promise<void>
  loadSettings: () => Promise<void>

  createFolder: (name: string, parentId?: string | null, color?: string | null, icon?: string | null) => Promise<BlogFolder | null>
  patchFolder: (id: string, patch: { name?: string; parentId?: string | null; color?: string | null; icon?: string | null; position?: number }) => Promise<BlogFolder | null>
  deleteFolder: (id: string) => Promise<boolean>

  createTag: (name: string, color?: string | null) => Promise<BlogTag | null>
  patchTag: (id: string, patch: { name?: string; color?: string | null; isPinned?: boolean }) => Promise<BlogTag | null>
  deleteTag: (id: string) => Promise<boolean>

  batchToggleGroup: (type: 'folder' | 'tag', target: string, enabled: boolean) => Promise<boolean>
  batchMoveToFolder: (postIds: string[], folderId: string | null) => Promise<boolean>

  savePost: (data: {
    noteId: string
    title: string
    slug?: string
    excerpt?: string
    content?: string
    coverUrl?: string
    folderId?: string | null
    categoryId?: string | null
    tags?: string[]
    isPublished?: boolean
    allowComments?: boolean
    isPinned?: boolean
  }) => Promise<{ ok: boolean; id: string; slug: string }>
  updatePost: (id: string, patch: Partial<BlogPost>) => Promise<void>
  deletePost: (id: string) => Promise<void>
  syncPost: (id: string) => Promise<void>
  batchPosts: (
    action: 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned',
    extraId?: string | null,
    pinnedState?: boolean,
  ) => Promise<void>

  updateCommentStatus: (id: string, status: BlogCommentStatus) => Promise<void>
  deleteComment: (id: string) => Promise<void>
  batchComments: (action: 'approve' | 'reject' | 'spam' | 'delete') => Promise<void>

  createCategory: (data: { name: string; slug?: string; description?: string; color?: string; icon?: string }) => Promise<void>
  updateCategory: (id: string, patch: Partial<BlogCategory>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  saveSettings: (settings: Partial<BlogSettings>) => Promise<void>
}

export const useBlogStore = create<BlogStoreState>((set, get) => ({
  activeTab: 'dashboard',
  statusFilter: 'all',
  categoryId: null,
  folderId: null,
  tag: null,
  search: '',
  sort: 'published_desc',
  viewMode: 'table',
  selectedPostIds: new Set<string>(),

  commentStatusFilter: 'all',
  commentSearch: '',
  selectedCommentIds: new Set<string>(),

  posts: [],
  folders: [],
  tags: [],
  categories: [],
  comments: [],
  stats: null,
  settings: null,
  loading: false,
  batchBusy: false,

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
  clearCommentSelection: () => set({ selectedCommentIds: new Set() }),

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
  },

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
  },

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
    try {
      await api.blog.posts.batch('setFolder', postIds, { folderId })
      get().clearPostSelection()
      await Promise.all([get().loadPosts(), get().loadStats()])
      return true
    } catch {
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
  },
}))
