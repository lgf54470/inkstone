import { create } from 'zustand'
import type { ShareStoreState } from './types'
import { initialFilters, initialRetention } from './state'
import { shareFiltersActions } from './filters';
import { shareLoadersActions } from './loaders';
import { shareContentActions } from './content';
import { shareSharesActions } from './shares';
import { getVisibilitySnapshot, pushVisibilitySnapshot } from '../../../store/visibility-sources';

export const useShareStore = create<ShareStoreState>((set, get) => ({
    ...initialShareState(),
    ...shareFiltersActions(set, get),
    ...shareLoadersActions(set, get),
    ...shareContentActions(set, get),
    ...shareSharesActions(set, get),
}) as ShareStoreState)

function initialShareState(): Partial<ShareStoreState> {
    return {
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
    }
}

export type { ShareFolderNode, ShareStoreState } from './types'
export { buildShareFolderTree } from './folders';

// Feed the notes store's visibility projection (shared note ids) without
// creating a store → feature import edge: selectors read the neutral registry
// in store/visibility-sources.ts, not this module.
useShareStore.subscribe((state) => {
  pushVisibilitySnapshot({
    ...getVisibilitySnapshot(),
    sharedNoteIds: new Set(state.shares.map((share) => share.noteId)),
  })
})