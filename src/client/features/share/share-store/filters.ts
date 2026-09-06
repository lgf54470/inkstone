import type { ShareCategory } from '@shared/types';
import type { ShareStoreState, SetShareStoreState } from './types';

export const shareFiltersActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'setCategory' | 'setFolderId' | 'setTag' | 'setStatusFilter' | 'setSearch' | 'setSort' | 'setViewMode' | 'setFilters' | 'setRetentionSettings' | 'toggleSelect' | 'toggleSelectAll' | 'clearSelection'> => ({
    setRetentionSettings: (settings) => setRetentionSettingsImpl(settings, set),
    setFilters: (newFilters) => setFiltersImpl(newFilters, set, get),
    setCategory: (category) => setCategoryImpl(category, set, get),
    setFolderId: (folderId) => setFolderIdImpl(folderId, set, get),
    setTag: (tag) => setTagImpl(tag, set, get),
    setStatusFilter: (statusFilter) => applyShareFilter(set, get, { statusFilter }),
    setSearch: (search) => applyShareFilter(set, get, { search }),
    setSort: (sort) => applyShareFilter(set, get, { sort }),
    setViewMode: (viewMode) => set({ viewMode }),
    toggleSelect: (noteId) => set((state) => ({ selectedNoteIds: toggleSelectedId(state.selectedNoteIds, noteId) })),
    toggleSelectAll: () => toggleSelectAllImpl(get, set),
    clearSelection: () => set({ selectedNoteIds: new Set() }),
});

function applyShareFilter(set: SetShareStoreState, get: () => ShareStoreState, patch: Partial<ShareStoreState>): void {
    set(patch);
    void get().loadShares();
}

function toggleSelectedId(ids: Set<string>, noteId: string): Set<string> {
    const next = new Set(ids);
    if (next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    return next;
}

function toggleSelectAllImpl(get: () => ShareStoreState, set: SetShareStoreState): void {
    const { shares, selectedNoteIds } = get();
    if (selectedNoteIds.size === shares.length) {
        set({ selectedNoteIds: new Set() });
    } else {
        set({ selectedNoteIds: new Set(shares.map((s) => s.noteId)) });
    }
}

function setRetentionSettingsImpl(
    settings: Parameters<ShareStoreState['setRetentionSettings']>[0],
    set: SetShareStoreState,
): void {
    set((state) => {
        const updated = {
            logRetentionDays: settings.logRetentionDays ?? state.logRetentionDays,
            maxLogRecords: settings.maxLogRecords ?? state.maxLogRecords,
        };
        persistShareRetention(updated);
        return updated;
    });
}

function persistShareRetention(updated: { logRetentionDays: number; maxLogRecords: number }): void {
    try {
        if (typeof window !== 'undefined') {
            localStorage.setItem('inkstone_share_retention', JSON.stringify(updated));
        }
    } catch (error) {
        console.warn('[share-store] failed to persist retention settings', error);
    }
}

function setFiltersImpl(
    newFilters: Parameters<ShareStoreState['setFilters']>[0],
    set: SetShareStoreState,
    get: () => ShareStoreState,
): void {
    set((state) => {
        const updated = {
            excludeBots: newFilters.excludeBots ?? state.excludeBots,
            excludeSelfReferrers: newFilters.excludeSelfReferrers ?? state.excludeSelfReferrers,
            excludeOwner: newFilters.excludeOwner ?? state.excludeOwner,
        };
        persistShareFilters(updated);
        return updated;
    });
    void get().loadShares();
}

function persistShareFilters(updated: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }): void {
    try {
        if (typeof window !== 'undefined') {
            localStorage.setItem('inkstone_share_filters_v2', JSON.stringify(updated));
        }
    } catch (error) {
        console.warn('[share-store] failed to persist traffic filters', error);
    }
}

function setCategoryImpl(category: ShareCategory, set: SetShareStoreState, get: () => ShareStoreState): void {
    set({
        category,
        folderId: null,
        tag: null,
        selectedNoteIds: new Set(),
        statusFilter: statusForCategory(category),
    });
    void get().loadShares();
}

function statusForCategory(category: ShareCategory): ShareStoreState['statusFilter'] {
    if (category === 'active') return 'active';
    if (category === 'paused') return 'paused';
    if (category === 'pinned') return 'pinned';
    if (category === 'starred') return 'starred';
    if (category === 'password') return 'password';
    if (category === 'expiring') return 'expiring';
    if (category === 'permanent') return 'permanent';
    if (category === 'expired') return 'expired';
    return 'all';
}

function setFolderIdImpl(folderId: string | null, set: SetShareStoreState, get: () => ShareStoreState): void {
    set({
        folderId,
        category: folderId ? 'all' : get().category,
        tag: null,
        statusFilter: 'all',
        selectedNoteIds: new Set(),
    });
    void get().loadShares();
}

function setTagImpl(tag: string | null, set: SetShareStoreState, get: () => ShareStoreState): void {
    set({
        tag,
        category: tag ? 'all' : get().category,
        folderId: null,
        statusFilter: 'all',
        selectedNoteIds: new Set(),
    });
    void get().loadShares();
}