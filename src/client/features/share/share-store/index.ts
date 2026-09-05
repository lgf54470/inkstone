import { create } from 'zustand'
import type { ShareStoreState } from './types'
import { initialFilters, initialRetention } from './state'
import { shareFiltersActions } from './filters';
import { shareLoadersActions } from './loaders';
import { shareContentActions } from './content';
import { shareSharesActions } from './shares';

export const useShareStore = create<ShareStoreState>((set, get) => ({
category: 'dashboard',

  folderId: null,

  tag: null,

  statusFilter: 'all',

  search: '',

  sort: 'views_desc',

  viewMode: 'table',

  selectedNoteIds: new Set<string>(),

  shares: [],

  folders: [],

  tags: [],

  globalStats: null,

  loading: false,

  batchBusy: false,

  excludeBots: initialFilters.excludeBots,

  excludeSelfReferrers: initialFilters.excludeSelfReferrers,

  excludeOwner: initialFilters.excludeOwner,

  logRetentionDays: initialRetention.logRetentionDays,

  maxLogRecords: initialRetention.maxLogRecords,
  ...shareFiltersActions(set, get),
  ...shareLoadersActions(set, get),
  ...shareContentActions(set, get),
  ...shareSharesActions(set, get),
}))

export type { ShareFolderNode, ShareStoreState } from './types'
export { buildShareFolderTree } from './folders';
