import { create } from 'zustand'
import type { BlogPostIndexEntry } from '@shared/types'
import type { BlogStoreState } from './types'
import { DEFAULT_TRAFFIC_FILTERS } from './state'
import { blogFiltersActions } from './filters'
import { blogLoadersActions } from './loaders'
import { blogContentActions } from './content'
import { blogActionsActions } from './actions'
import { blogLinksActions } from './links'
import { blogRevisionsActions, blogRevisionsInitialState } from './revisions'
import { getVisibilitySnapshot, pushVisibilitySnapshot } from '../../../store/visibility-sources'

export const useBlogStore = create<BlogStoreState>((set, get) => ({
    ...initialBlogState(),
    ...blogFiltersActions(set, get),
    ...blogLoadersActions(set, get),
    ...blogContentActions(set, get),
    ...blogActionsActions(set, get),
    ...blogLinksActions(set, get),
    ...blogRevisionsActions(set, get),
}) as BlogStoreState)

function initialBlogState(): Partial<BlogStoreState> {
    return {
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
        linkStatusFilter: 'all',
        linkCategoryId: null,
        linkSearch: '',
        selectedLinkIds: new Set<string>(),
        posts: [],
        postIndex: [],
        trashPosts: [],
        folders: [],
        tags: [],
        categories: [],
        comments: [],
        commentStats: null,
        links: [],
        linkCategories: [],
        linkStats: null,
        stats: null,
        settings: null,
        loading: false,
        batchBusy: false,
        loadErrors: new Set(),
        dataLoadedAt: {},
        postsRequestSeq: 0,
        postsAbort: null,
        postsPage: 1,
        postsTotal: 0,
        postsTotalPages: 0,
        commentsRequestSeq: 0,
        commentsAbort: null,
        linksRequestSeq: 0,
        linksAbort: null,
        excludeBots: DEFAULT_TRAFFIC_FILTERS.excludeBots,
        excludeSelfReferrers: DEFAULT_TRAFFIC_FILTERS.excludeSelfReferrers,
        excludeOwner: DEFAULT_TRAFFIC_FILTERS.excludeOwner,
        ...blogRevisionsInitialState(),
    }
}

export type { BlogTab, BlogFolderNode, BlogStoreState, BlogLinkFilterType, BlogLoadScope } from './types'
export { buildBlogFolderTree } from './folders'

// Feed the notes store's visibility projection (published note ids) without
// creating a store → feature import edge: selectors read the neutral registry
// in store/visibility-sources.ts, not this module. The projection reads the
// body-free index, not the page on screen: whether a note is published does not
// depend on which page of the management list happens to be open.
/**
 * The projection is rebuilt only when the index array itself is replaced. `subscribe` fires on every
 * `set` — each keystroke in the search box, each selection toggle — and rebuilding the set there
 * allocated a fresh Set per store write for a value that had not changed.
 */
export function createPostIndexProjection(): (postIndex: BlogPostIndexEntry[]) => Set<string> {
  let lastIndex: BlogPostIndexEntry[] | null = null
  let publishedNoteIds = new Set<string>()
  return (postIndex) => {
    if (postIndex !== lastIndex) {
      lastIndex = postIndex
      publishedNoteIds = new Set(postIndex.filter((post) => post.isPublished).map((post) => post.noteId))
    }
    return publishedNoteIds
  }
}

const projectPublishedNoteIds = createPostIndexProjection()

useBlogStore.subscribe((state) => {
  pushVisibilitySnapshot({
    ...getVisibilitySnapshot(),
    publishedNoteIds: projectPublishedNoteIds(state.postIndex),
  })
})