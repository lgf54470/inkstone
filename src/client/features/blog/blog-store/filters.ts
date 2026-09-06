import { TRAFFIC_FILTERS_KEY, RETENTION_SETTINGS_KEY } from './state';
import type { BlogStoreState, SetBlogStoreState } from './types';

export const blogFiltersActions = (set: SetBlogStoreState, get: () => BlogStoreState): Pick<BlogStoreState, 'setActiveTab' | 'setStatusFilter' | 'setCategoryId' | 'setFolderId' | 'setTag' | 'setSearch' | 'setSort' | 'setViewMode' | 'toggleSelectPost' | 'selectAllPosts' | 'clearPostSelection' | 'setCommentStatusFilter' | 'setCommentSearch' | 'toggleSelectComment' | 'selectAllComments' | 'clearCommentSelection' | 'setFilters' | 'setRetentionSettings'> => ({
    setFilters: (newFilters) => setFiltersImpl(newFilters, set, get),
    setRetentionSettings: (newSettings) => setRetentionSettingsImpl(newSettings, set),
    setActiveTab: (activeTab) => set({ activeTab }),
    setStatusFilter: (statusFilter) => applyPostFilter(set, get, { statusFilter, folderId: null, tag: null, activeTab: 'posts' }),
    setCategoryId: (categoryId) => applyPostFilter(set, get, { categoryId, activeTab: 'posts' }),
    setFolderId: (folderId) => applyPostFilter(set, get, { folderId, tag: null, statusFilter: 'all', activeTab: 'posts' }),
    setTag: (tag) => applyPostFilter(set, get, { tag, folderId: null, statusFilter: 'all', activeTab: 'posts' }),
    setSearch: (search) => applyPostFilter(set, get, { search }),
    setSort: (sort) => applyPostFilter(set, get, { sort }),
    setViewMode: (viewMode) => set({ viewMode }),
    toggleSelectPost: (id) => set((state) => ({ selectedPostIds: toggleSelectedId(state.selectedPostIds, id) })),
    selectAllPosts: (ids) => set({ selectedPostIds: new Set(ids) }),
    clearPostSelection: () => set({ selectedPostIds: new Set() }),
    setCommentStatusFilter: (commentStatusFilter) => applyCommentFilter(set, get, { commentStatusFilter }),
    setCommentSearch: (commentSearch) => applyCommentFilter(set, get, { commentSearch }),
    toggleSelectComment: (id) => set((state) => ({ selectedCommentIds: toggleSelectedId(state.selectedCommentIds, id) })),
    selectAllComments: (ids) => set({ selectedCommentIds: new Set(ids) }),
    clearCommentSelection: () => set({ selectedCommentIds: new Set() }),
});

function applyPostFilter(set: SetBlogStoreState, get: () => BlogStoreState, patch: Partial<BlogStoreState>): void {
    set(patch);
    void get().loadPosts();
}

function applyCommentFilter(set: SetBlogStoreState, get: () => BlogStoreState, patch: Partial<BlogStoreState>): void {
    set(patch);
    void get().loadComments();
}

function toggleSelectedId(ids: Set<string>, id: string): Set<string> {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

function setFiltersImpl(
    newFilters: Parameters<BlogStoreState['setFilters']>[0],
    set: SetBlogStoreState,
    get: () => BlogStoreState,
): void {
    set((state) => {
        const updated = {
            excludeBots: newFilters.excludeBots ?? state.excludeBots,
            excludeSelfReferrers: newFilters.excludeSelfReferrers ?? state.excludeSelfReferrers,
            excludeOwner: newFilters.excludeOwner ?? state.excludeOwner,
        };
        persistTrafficFilters(updated);
        return updated;
    });
    void get().loadPosts();
    void get().loadStats();
}

function persistTrafficFilters(updated: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(TRAFFIC_FILTERS_KEY, JSON.stringify(updated));
    } catch (error) {
        console.warn('[blog-store] failed to persist traffic filters', error);
    }
}

function setRetentionSettingsImpl(
    newSettings: Parameters<BlogStoreState['setRetentionSettings']>[0],
    set: SetBlogStoreState,
): void {
    set({
        logRetentionDays: newSettings.logRetentionDays,
        maxLogRecords: newSettings.maxLogRecords,
    });
    persistRetentionSettings(newSettings);
}

function persistRetentionSettings(settings: Parameters<BlogStoreState['setRetentionSettings']>[0]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(RETENTION_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[blog-store] failed to persist retention settings', error);
    }
}