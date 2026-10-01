import type { BlogPost, BlogPostIndexEntry, BlogPostSummary, BlogTrashEntry, BlogCategory, BlogComment, BlogCommentsCounts, BlogCommentStatus, BlogStats, BlogSettings, BlogFolder, BlogTag, BlogLink, BlogLinkCategory, BlogLinkStatus, BlogLinkStats } from '@shared/types'
import type { StoreApi } from 'zustand'

export type SetBlogStoreState = StoreApi<BlogStoreState>['setState']

export type BlogTab = 'dashboard' | 'posts' | 'comments' | 'categories' | 'links' | 'settings' | 'trash'

/**
 * The lists whose load result a view draws. A failed load is a state of its own — the alternative
 * was rendering it as an empty list, which told the reader their data was gone.
 */
export type BlogLoadScope = 'posts' | 'comments' | 'links' | 'stats' | 'trash'

/**
 * Everything the hub caches, with one timestamp each. Opening the hub or switching tabs asks only
 * for what the current tab draws and for whatever is older than the freshness window — the first
 * version asked for all of it on every open, and again whenever the open note changed.
 */
export type BlogDataScope = 'posts' | 'postIndex' | 'folders' | 'tags' | 'categories' | 'comments' | 'stats' | 'links' | 'settings' | 'trash'



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

  posts: BlogPostSummary[]
  /**
   * Every post of the account in its body-free index form (see `BlogPostIndexEntry`). The list above
   * is one page, so the note list cannot read "which notes are published" from it, and the publish
   * dialog cannot be pre-filled from it either.
   */
  postIndex: BlogPostIndexEntry[]
  /**
   * What waits in the recycle bin. It is loaded only by its own tab, so a delete elsewhere must ask
   * for it again rather than assume the bin it left behind is still accurate.
   */
  trashPosts: BlogTrashEntry[]
  folders: BlogFolder[]
  tags: BlogTag[]
  categories: BlogCategory[]
  comments: BlogComment[]
  /**
   * The moderation tabs' real sizes, answered by the server without the status filter. Counting the
   * rows on screen (which the status filter already narrowed) drew every other tab as zero.
   */
  commentStats: BlogCommentsCounts | null
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

  /** When each scope last answered successfully; see `BlogDataScope` and `loadHubData`. */
  dataLoadedAt: Partial<Record<BlogDataScope, number>>

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

  loadHubData: (options?: { force?: boolean }) => Promise<void>
  loadPosts: () => Promise<void>
  loadPostIndex: () => Promise<void>
  loadTrash: () => Promise<void>
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
    publishedAt?: number
    allowComments?: boolean
    isPinned?: boolean
    seoTitle?: string
    seoDescription?: string
    seoImageUrl?: string
    seoCanonicalUrl?: string
    seoNoindex?: boolean
  }) => Promise<{ ok: boolean; id: string; slug: string } | null>
  updatePost: (id: string, patch: Partial<BlogPost>) => Promise<boolean>
  deletePost: (id: string) => Promise<boolean>
  /** Puts a trashed post back on the blog; `purgePost` erases it for good. */
  restorePost: (id: string) => Promise<boolean>
  purgePost: (id: string) => Promise<boolean>
  emptyTrash: () => Promise<boolean>
  syncPost: (id: string) => Promise<boolean>
  batchPosts: (
    action: 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned',
    extraId?: string | null,
    pinnedState?: boolean,
  ) => Promise<boolean>

  updateCommentStatus: (id: string, status: BlogCommentStatus) => Promise<boolean>
  /** The author's answer to one reader (FEA-06); it lands approved, nested under that comment. */
  replyToComment: (id: string, content: string) => Promise<boolean>
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
  batchDeleteLinks: (ids: string[]) => Promise<boolean>

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

  /** Which page of the post list is on screen, and what the server said about the whole list. */
  postsPage: number
  postsTotal: number
  postsTotalPages: number
  setPostsPage: (page: number) => void

  /** The same latest-wins rule as the post list, for the comment list's status/search. */
  commentsRequestSeq: number
  commentsAbort: AbortController | null

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
