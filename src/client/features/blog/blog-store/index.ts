import { create } from 'zustand'
import type { BlogStoreState } from './types'
import { initialFilters, initialRetention } from './state'
import { blogFiltersActions } from './filters';
import { blogLoadersActions } from './loaders';
import { blogContentActions } from './content';
import { blogActionsActions } from './actions';

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


  excludeBots: initialFilters.excludeBots,

  excludeSelfReferrers: initialFilters.excludeSelfReferrers,

  excludeOwner: initialFilters.excludeOwner,


  logRetentionDays: initialRetention.logRetentionDays,

  maxLogRecords: initialRetention.maxLogRecords,
  ...blogFiltersActions(set, get),
  ...blogLoadersActions(set, get),
  ...blogContentActions(set, get),
  ...blogActionsActions(set, get),
}))

export type { BlogTab, BlogFolderNode, BlogStoreState } from './types'
export { buildBlogFolderTree } from './folders';
