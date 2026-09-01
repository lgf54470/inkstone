import { LIMITS } from '@shared/constants';

export const LIST_FILTER_PERSIST_KEY = 'inkstone.list-filter.v1';

export interface ListFilterPersistState {
    query: string;
    dateFilter: string | null;
    selectedTags: string[];
    selectedTagsMatch: 'any' | 'all';
}

export function emptyListFilterPersist(): ListFilterPersistState {
    return { query: '', dateFilter: null, selectedTags: [], selectedTagsMatch: 'any' };
}

export function loadListFilterPersist(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): ListFilterPersistState {
    try {
        const raw = storage?.getItem(LIST_FILTER_PERSIST_KEY);
        if (!raw)
            return emptyListFilterPersist();
        const value = JSON.parse(raw) as { query?: unknown; dateFilter?: unknown; selectedTags?: unknown; selectedTagsMatch?: unknown };
        return {
            query: typeof value.query === 'string' ? value.query.slice(0, 500) : '',
            dateFilter: typeof value.dateFilter === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dateFilter) ? value.dateFilter : null,
            selectedTags: Array.isArray(value.selectedTags)
                ? [...new Set(value.selectedTags.filter((item): item is string => typeof item === 'string').slice(0, LIMITS.tagSelectionMax).map((item) => item.slice(0, 64)))]
                : [],
            selectedTagsMatch: value.selectedTagsMatch === 'all' ? 'all' : 'any',
        };
    }
    catch {
        return emptyListFilterPersist();
    }
}

export function saveListFilterPersist(state: ListFilterPersistState, storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
    try {
        storage?.setItem(LIST_FILTER_PERSIST_KEY, JSON.stringify(state));
    }
    catch {
    }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
}