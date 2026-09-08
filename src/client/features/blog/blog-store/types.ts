import type { BlogPost, BlogCategory, BlogComment, BlogCommentStatus, BlogStats, BlogSettings, BlogFolder, BlogTag, BlogLink, BlogLinkCategory, BlogLinkStatus, BlogLinkStats } from '@shared/types'
import type { StoreApi } from 'zustand'

export type SetBlogStoreState = StoreApi<BlogStoreState>['setState']

export type BlogTab = 'dashboard' | 'posts' | 'comments' | 'categories' | 'links' | 'settings'



export interface BlogFolderNode {
  folder: BlogFolder
  children: BlogFolderNode[]
  depth: number
}



export interface BlogStoreState {
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

  linkStatusFilter: 'all' | 'pending' | 'approved' | 'rejected'
  linkCategoryId: string | null
  linkSearch: string
  selectedLinkIds: Set<string>

  posts: BlogPost[]
  folders: BlogFolder[]
  tags: BlogTag[]
  categories: BlogCategory[]
  comments: BlogComment[]
  links: BlogLink[]
  linkCategories: BlogLinkCategory[]
  linkStats: BlogLinkStats | null
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

  setLinkStatusFilter: (status: 'all' | 'pending' | 'approved' | 'rejected') => void
  setLinkCategoryId: (id: string | null) => void
  setLinkSearch: (search: string) => void
  toggleSelectLink: (id: string) => void
  selectAllLinks: (ids: string[]) => void
  clearLinkSelection: () => void

  loadAll: () => Promise<void>
  loadPosts: () => Promise<void>
  loadFolders: () => Promise<void>
  loadTags: () => Promise<void>
  loadCategories: () => Promise<void>
  loadComments: () => Promise<void>
  loadLinks: () => Promise<void>
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

  createLink: (data: Partial<BlogLink>) => Promise<BlogLink | null>
  updateLink: (id: string, patch: Partial<BlogLink>) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  updateLinkStatus: (id: string, status: BlogLinkStatus) => Promise<void>
  togglePinLink: (id: string, isPinned: boolean) => Promise<void>
  batchLinks: (action: 'approve' | 'reject' | 'delete' | 'setCategory' | 'pin' | 'unpin', categoryId?: string | null) => Promise<void>

  createLinkCategory: (data: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<BlogLinkCategory | null>
  updateLinkCategory: (id: string, patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<void>
  deleteLinkCategory: (id: string) => Promise<void>
  importLinksData: (payload: { categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>; links: Array<Partial<BlogLink>> }) => Promise<{ importedCategories: number; importedLinks: number }>

  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
  setFilters: (filters: Partial<{ excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }>) => void

  logRetentionDays: number
  maxLogRecords: number
  setRetentionSettings: (settings: { logRetentionDays: number; maxLogRecords: number }) => void

  saveSettings: (settings: Partial<BlogSettings>) => Promise<void>
}
