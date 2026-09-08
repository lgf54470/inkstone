import { create } from 'zustand'
import type { BlogStoreState } from './types'
import { initialFilters, initialRetention } from './state'
import { blogFiltersActions } from './filters'
import { blogLoadersActions } from './loaders'
import { blogContentActions } from './content'
import { blogActionsActions } from './actions'
import { blogLinksActions } from './links'
import { getVisibilitySnapshot, pushVisibilitySnapshot } from '../../../store/visibility-sources'

export const useBlogStore = create<BlogStoreState>((set, get) => ({
    ...initialBlogState(),
    ...blogFiltersActions(set, get),
    ...blogLoadersActions(set, get),
    ...blogContentActions(set, get),
    ...blogActionsActions(set, get),
    ...blogLinksActions(set, get),
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
        folders: [],
        tags: [],
        categories: [],
        comments: [],
        links: [],
        linkCategories: [],
        linkStats: null,
        stats: null,
        settings: null,
        loading: false,
        batchBusy: false,
        excludeBots: initialFilters.excludeBots,
        excludeSelfReferrers: initialFilters.excludeSelfReferrers,
        excludeOwner: initialFilters.excludeOwner,
        logRetentionDays: initialRetention.logRetentionDays,
        maxLogRecords: initialRetention.maxLogRecords,
    }
}

export type { BlogTab, BlogFolderNode, BlogStoreState } from './types'
export { buildBlogFolderTree } from './folders'

// Feed the notes store's visibility projection (published note ids) without
// creating a store → feature import edge: selectors read the neutral registry
// in store/visibility-sources.ts, not this module.
useBlogStore.subscribe((state) => {
  pushVisibilitySnapshot({
    ...getVisibilitySnapshot(),
    publishedNoteIds: new Set(state.posts.filter((post) => post.isPublished).map((post) => post.noteId)),
  })
})