import { extractCoverUrl } from '@shared/markdown-utils'
import { api } from '../../../lib/api'
import { markDataLoaded, markLoadFailed, markLoadSucceeded } from './state'
import type { BlogDataScope, BlogStoreState, BlogTab, SetBlogStoreState } from './types'

/** How long an answer stays fresh: reopening the hub within this window reads what is already here. */
export const BLOG_HUB_SWR_MS = 30_000

/**
 * What each tab draws. The sidebar (folders, tags, categories, settings) and the navigation counts
 * (`stats`) are shared by every tab, so they are the common part; everything else belongs to the tab
 * that renders it. The dashboard reads stats and the pending comments card — not `posts`, whose
 * length stopped being the account's post count when the list became one page.
 */
const BLOG_TAB_SCOPES: Record<BlogTab, BlogDataScope[]> = {
  dashboard: ['folders', 'tags', 'categories', 'settings', 'stats', 'comments'],
  posts: ['folders', 'tags', 'categories', 'settings', 'stats', 'posts', 'postIndex'],
  comments: ['folders', 'tags', 'categories', 'settings', 'stats', 'comments'],
  links: ['folders', 'tags', 'categories', 'settings', 'stats', 'links'],
  categories: ['folders', 'tags', 'categories', 'settings', 'stats'],
  settings: ['folders', 'tags', 'categories', 'settings', 'stats'],
}

const BLOG_SCOPE_LOADERS: Record<BlogDataScope, (get: () => BlogStoreState) => Promise<void>> = {
  posts: (get) => get().loadPosts(),
  postIndex: (get) => get().loadPostIndex(),
  folders: (get) => get().loadFolders(),
  tags: (get) => get().loadTags(),
  categories: (get) => get().loadCategories(),
  comments: (get) => get().loadComments(),
  stats: (get) => get().loadStats(),
  links: (get) => get().loadLinks(),
  settings: (get) => get().loadSettings(),
}

export const blogLoadersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'loadHubData' | 'loadPosts' | 'loadPostIndex' | 'loadFolders' | 'loadTags' | 'loadCategories' | 'loadComments' | 'loadStats' | 'loadSettings'> => ({
  loadHubData: (options) => loadHubDataImpl(options?.force ?? false, set, get),
  loadPosts: () => loadPostsImpl(set, get),
  loadPostIndex: () => loadPostIndexImpl(set),
  loadFolders: () => loadFoldersImpl(set),
  loadTags: () => loadTagsImpl(set),
  loadCategories: () => loadCategoriesImpl(set),
  loadComments: () => loadCommentsImpl(set, get),
  loadStats: () => loadStatsImpl(set),
  loadSettings: () => loadSettingsImpl(set),
})

/**
 * The hub's bootstrap: ask for the current tab's scopes, skipping whatever answered within the
 * freshness window, and never ask for another tab's data. An explicit refresh passes `force`, so the
 * reader's own click always gets a new answer; everything else settles for a recent one.
 */
async function loadHubDataImpl(force: boolean, set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const scopes = BLOG_TAB_SCOPES[get().activeTab]
  const loadedAt = get().dataLoadedAt
  const now = Date.now()
  const due = scopes.filter((scope) => force || now - (loadedAt[scope] ?? 0) >= BLOG_HUB_SWR_MS)
  if (due.length === 0) return
  set({ loading: true })
  try {
    await Promise.allSettled(due.map((scope) => BLOG_SCOPE_LOADERS[scope](get)))
  } finally {
    set({ loading: false })
  }
}

/**
 * The post list, asked once per change of the query and answered with the newest answer only. Two
 * things follow from that: the request a newer one replaces is cancelled (a search box sends one per
 * keystroke) and an answer that arrives after a newer request went out is dropped, because comparing
 * sequence numbers is the only way to know which of two responses is current. The dropped answer is
 * not an error — the caller asked for it and then changed its mind.
 */
async function loadPostsImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { statusFilter, categoryId, folderId, tag, search, sort, postsPage, postsRequestSeq, postsAbort } = get()
  const seq = postsRequestSeq + 1
  postsAbort?.abort()
  const controller = new AbortController()
  set({ postsRequestSeq: seq, postsAbort: controller })

  try {
    const res = await api.blog.posts.list({
      status: statusFilter,
      categoryId: categoryId || undefined,
      folderId: folderId || undefined,
      tag: tag || undefined,
      search: search || undefined,
      sort,
      page: postsPage,
    }, controller.signal)
    if (get().postsRequestSeq !== seq) return
    const posts = (res.posts || []).map((p) => ({
      ...p,
      coverUrl: extractCoverUrl(p.coverUrl),
    }))
    const total = res.pagination?.total ?? posts.length
    const totalPages = res.pagination?.totalPages ?? 1
    set((s) => ({ posts, postsTotal: total, postsTotalPages: totalPages, loadErrors: markLoadSucceeded(s.loadErrors, 'posts'), dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'posts') }))
    // The page in hand may have emptied under the reader (a delete on the last page, or a filter
    // that shrank the list): ask once more for the page that exists rather than draw "no posts".
    if (posts.length === 0 && total > 0 && postsPage > totalPages) {
      set({ postsPage: Math.max(1, totalPages) })
      void loadPostsImpl(set, get)
    }
  } catch (err) {
    // A refresh failure leaves the previous list where it is and raises the flag: an empty screen
    // because a request failed would read as "your posts are gone".
    if (controller.signal.aborted) return
    console.error('Failed to load blog posts', err)
    set((s) => ({ loadErrors: markLoadFailed(s.loadErrors, 'posts') }))
  }
}

async function loadPostIndexImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.postIndex()
    set((s) => ({ postIndex: res.posts || [], dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'postIndex') }))
  } catch (err) {
    // The index feeds the note list's published badges and the publish dialog's starting values. A
    // failure keeps the previous answer instead of clearing it, and is logged here rather than shown
    // as a broken note list: there is no surface that could render it without lying about the notes.
    console.error('Failed to load blog post index', err)
  }
}

async function loadFoldersImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const folders = await api.blog.folders.list()
    set((s) => ({ folders, dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'folders') }))
  } catch (err) {
    console.error('Failed to load blog folders', err)
  }
}

async function loadTagsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const tags = await api.blog.tags.list()
    set((s) => ({ tags, dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'tags') }))
  } catch (err) {
    console.error('Failed to load blog tags', err)
  }
}

async function loadCategoriesImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.categories.list()
    set((s) => ({ categories: res.categories, dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'categories') }))
  } catch (err) {
    console.error('Failed to load blog categories', err)
  }
}

/**
 * The comment search is asked of the server now (the box used to filter whatever page arrived), so
 * it needs the same latest-wins rule as the other lists: the request a newer one replaces is
 * cancelled and a late answer is dropped rather than painted over the newer query.
 */
async function loadCommentsImpl(set: SetBlogStoreState, get: () => BlogStoreState): Promise<void> {
  const { commentStatusFilter, commentSearch, commentsRequestSeq, commentsAbort } = get()
  const seq = commentsRequestSeq + 1
  commentsAbort?.abort()
  const controller = new AbortController()
  set({ commentsRequestSeq: seq, commentsAbort: controller })
  try {
    const res = await api.blog.comments.list({
      status: commentStatusFilter,
      search: commentSearch || undefined,
    }, controller.signal)
    if (get().commentsRequestSeq !== seq) return
    set((s) => ({
      comments: res.comments,
      commentStats: res.counts ?? null,
      loadErrors: markLoadSucceeded(s.loadErrors, 'comments'),
      dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'comments'),
    }))
  } catch (err) {
    if (controller.signal.aborted) return
    console.error('Failed to load blog comments', err)
    set((s) => ({ loadErrors: markLoadFailed(s.loadErrors, 'comments') }))
  }
}

async function loadStatsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.stats()
    set((s) => ({ stats: res.stats, loadErrors: markLoadSucceeded(s.loadErrors, 'stats'), dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'stats') }))
  } catch (err) {
    console.error('Failed to load blog stats', err)
    set((s) => ({ loadErrors: markLoadFailed(s.loadErrors, 'stats') }))
  }
}

async function loadSettingsImpl(set: SetBlogStoreState): Promise<void> {
  try {
    const res = await api.blog.settings.get()
    set((s) => ({ settings: res.settings, dataLoadedAt: markDataLoaded(s.dataLoadedAt, 'settings') }))
  } catch (err) {
    console.error('Failed to load blog settings', err)
  }
}
