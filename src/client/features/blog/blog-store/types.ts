import type { BlogPost, BlogCategory, BlogComment, BlogCommentStatus, BlogStats, BlogSettings, BlogFolder, BlogTag, BlogLink, BlogLinkCategory, BlogLinkStatus, BlogLinkStats } from '@shared/types'
import type { StoreApi } from 'zustand'

export type SetBlogStoreState = StoreApi<BlogStoreState>['setState']

export type BlogTab = 'dashboard' | 'posts' | 'comments' | 'categories' | 'links' | 'settings'

/**
 * The lists whose load result a view draws. A failed load is a state of its own — the alternative
 * was rendering it as an empty list, which told the reader their data was gone.
 */
export type BlogLoadScope = 'posts' | 'comments' | 'links' | 'stats'



export interface BlogFolderNode {
  folder: BlogFolder
  children: BlogFolderNode[]
  depth: number
}



export type BlogLinkFilterType = 'all' | 'pending' | 'approved' | 'rejected' | 'pinned' | 'favorite'

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

  linkStatusFilter: BlogLinkFilterType
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

  /**
   * Scopes whose last load failed. A refresh failure leaves the previous data in place — only a view
   * with nothing to show asks this flag to render a failure instead of an empty state.
   */
  loadErrors: Set<BlogLoadScope>

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

  setLinkStatusFilter: (status: BlogLinkFilterType) => void
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

  /**
   * Everything below is a mutation: it reports its own failure (see `mutation.ts`), resolves to
   * `false`/`null` after a danger toast and rolls back any optimistic change it made, so no caller
   * has to catch a rejection from it.
   */
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
  }) => Promise<{ ok: boolean; id: string; slug: string } | null>
  updatePost: (id: string, patch: Partial<BlogPost>) => Promise<boolean>
  deletePost: (id: string) => Promise<boolean>
  syncPost: (id: string) => Promise<boolean>
  batchPosts: (
    action: 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned',
    extraId?: string | null,
    pinnedState?: boolean,
  ) => Promise<boolean>

  updateCommentStatus: (id: string, status: BlogCommentStatus) => Promise<boolean>
  deleteComment: (id: string) => Promise<boolean>
  batchComments: (action: 'approve' | 'reject' | 'spam' | 'delete') => Promise<boolean>

  createCategory: (data: { name: string; slug?: string; description?: string; color?: string; icon?: string }) => Promise<boolean>
  updateCategory: (id: string, patch: Partial<BlogCategory>) => Promise<boolean>
  deleteCategory: (id: string) => Promise<boolean>

  createLink: (data: Partial<BlogLink>) => Promise<BlogLink | null>
  updateLink: (id: string, patch: Partial<BlogLink>) => Promise<boolean>
  deleteLink: (id: string) => Promise<boolean>
  updateLinkStatus: (id: string, status: BlogLinkStatus) => Promise<boolean>
  togglePinLink: (id: string, isPinned: boolean) => Promise<boolean>
  toggleFavoriteLink: (id: string, isFavorite: boolean) => Promise<boolean>
  reorderLinks: (orders: Array<{ id: string; sortOrder?: number; pinnedOrder?: number }>) => Promise<boolean>
  batchLinks: (
    action: 'approve' | 'reject' | 'delete' | 'setCategory' | 'pin' | 'unpin' | 'favorite' | 'unfavorite',
    categoryId?: string | null,
  ) => Promise<boolean>

  createLinkCategory: (data: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<BlogLinkCategory | null>
  updateLinkCategory: (id: string, patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<boolean>
  deleteLinkCategory: (id: string) => Promise<boolean>
  importLinksData: (payload: { categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>; links: Array<Partial<BlogLink>> }) => Promise<{ importedCategories: number; importedLinks: number } | null>

  /**
   * The post list's in-flight request: `seq` lets a late answer be dropped (the reader may have
   * typed again since), and the controller cancels the request the newest one replaces. Both are
   * request lifecycle, not data — the list itself lives in `posts`.
   */
  postsRequestSeq: number
  postsAbort: AbortController | null

  /** The same latest-wins rule as the post list, for the link list's status/category/search. */
  linksRequestSeq: number
  linksAbort: AbortController | null

  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
  hydrateTrafficFilters: () => void
  setFilters: (filters: Partial<{ excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }>) => void

  saveSettings: (settings: Partial<BlogSettings>) => Promise<boolean>
}
