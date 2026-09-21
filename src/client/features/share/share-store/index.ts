import { create } from 'zustand'
import type { ShareStoreState } from './types'
import { initialFilters } from './state'
import { shareFiltersActions } from './filters'
import { shareLoadersActions } from './loaders'
import { shareContentActions } from './content'
import { shareSharesActions } from './shares'
import { getVisibilitySnapshot, pushVisibilitySnapshot } from '../../../store/visibility-sources'

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
        truncated: false,
        folders: [],
        tags: [],
        globalStats: null,
        summary: null,
        loading: false,
        error: false,
        batchBusy: false,
        excludeBots: initialFilters.excludeBots,
        excludeSelfReferrers: initialFilters.excludeSelfReferrers,
        excludeOwner: initialFilters.excludeOwner,
    }
}

export type { ShareFolderNode, ShareStoreState } from './types'
export { buildShareFolderTree } from './folders'
export { isNoteShared, selectShareRow, shareRowIndex, useNoteIsShared, useShareRowForNote } from './row-index'

// Feed the notes store's visibility projection (shared note ids) without
// creating a store → feature import edge: selectors read the neutral registry
// in store/visibility-sources.ts, not this module.
//
// The projection is derived from exactly two state slices, so the two references are
// remembered and any other write returns immediately: a keystroke, a row selection or a
// view toggle produces a new state object with the same arrays, and rebuilding the id set
// for it would allocate and then compare every row to reach the same answer.
let projectedShares: ShareStoreState['shares'] | null = null
let projectedSummary: ShareStoreState['summary'] | null = null

useShareStore.subscribe((state) => {
  if (state.shares === projectedShares && state.summary === projectedSummary) return
  projectedShares = state.shares
  projectedSummary = state.summary
  pushVisibilitySnapshot({
    ...getVisibilitySnapshot(),
    // Before the hub loads the full list, the startup summary set carries the
    // shared view's membership; list membership wins as soon as it exists.
    sharedNoteIds: new Set([
      ...state.shares.map((share) => share.noteId),
      ...(state.summary?.sharedNoteIds ?? []),
    ]),
  })
})