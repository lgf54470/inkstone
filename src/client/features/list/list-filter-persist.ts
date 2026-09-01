import { LIMITS } from '@shared/constants';
import type { DateRangeFilter, RelativeFilter } from '@shared/types';

export const LIST_FILTER_SESSION_KEY = 'inkstone.list-filter.session.v1';
export const LIST_FILTER_REMEMBER_KEY = 'inkstone.list-filter.remember.v1';

export interface ListFilterPersistState {
    query: string;
    dateFilter: DateRangeFilter | null;
    relativeFilter: RelativeFilter | null;
    selectedTags: string[];
    selectedTagsMatch: 'any' | 'all';
}

export function emptyListFilterPersist(): ListFilterPersistState {
    return { query: '', dateFilter: null, relativeFilter: null, selectedTags: [], selectedTagsMatch: 'any' };
}

function parseState(value: unknown): ListFilterPersistState {
    if (!value || typeof value !== 'object')
        return emptyListFilterPersist();
    const record = value as { query?: unknown; dateFilter?: unknown; relativeFilter?: unknown; selectedTags?: unknown; selectedTagsMatch?: unknown };
    let dateFilter: DateRangeFilter | null = null;
    if (record.dateFilter && typeof record.dateFilter === 'object') {
        const range = record.dateFilter as { start?: unknown; end?: unknown };
        if (typeof range.start === 'string' && typeof range.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(range.start) && /^\d{4}-\d{2}-\d{2}$/.test(range.end)) {
            dateFilter = range.start <= range.end
                ? { start: range.start, end: range.end }
                : { start: range.end, end: range.start };
        }
    }
    let relativeFilter: RelativeFilter | null = null;
    if (record.relativeFilter && typeof record.relativeFilter === 'object') {
        const relative = record.relativeFilter as { days?: unknown; direction?: unknown };
        if (typeof relative.days === 'number' && Number.isInteger(relative.days) && relative.days >= 1 && relative.days <= 365 && (relative.direction === 'edit' || relative.direction === 'today')) {
            relativeFilter = { days: relative.days, direction: relative.direction };
        }
    }
    return {
        query: typeof record.query === 'string' ? record.query.slice(0, 500) : '',
        dateFilter,
        relativeFilter,
        selectedTags: Array.isArray(record.selectedTags)
            ? [...new Set(record.selectedTags.filter((item): item is string => typeof item === 'string').slice(0, LIMITS.tagSelectionMax).map((item) => item.slice(0, 64)))]
            : [],
        selectedTagsMatch: record.selectedTagsMatch === 'all' ? 'all' : 'any',
    };
}

export function loadSessionFilter(storage: Pick<Storage, 'getItem'> | null = defaultSessionStorage()): ListFilterPersistState {
    try {
        const raw = storage?.getItem(LIST_FILTER_SESSION_KEY);
        return raw ? parseState(JSON.parse(raw)) : emptyListFilterPersist();
    }
    catch {
        return emptyListFilterPersist();
    }
}

export function saveSessionFilter(state: ListFilterPersistState, storage: Pick<Storage, 'setItem'> | null = defaultSessionStorage()): void {
    try {
        storage?.setItem(LIST_FILTER_SESSION_KEY, JSON.stringify(state));
    }
    catch {
    }
}

export function loadRememberedFilter(storage: Pick<Storage, 'getItem'> | null = defaultLocalStorage()): ListFilterPersistState | null {
    try {
        const raw = storage?.getItem(LIST_FILTER_REMEMBER_KEY);
        if (!raw)
            return null;
        const value = JSON.parse(raw) as { state?: unknown };
        const state = parseState(value.state);
        return state.query === '' && state.dateFilter === null && state.relativeFilter === null && state.selectedTags.length === 0 ? null : state;
    }
    catch {
        return null;
    }
}

export function saveRememberedFilter(state: ListFilterPersistState | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = defaultLocalStorage()): void {
    try {
        if (state) {
            const payload = parseState(state);
            if (payload.query === '' && payload.dateFilter === null && payload.relativeFilter === null && payload.selectedTags.length === 0)
                storage?.removeItem(LIST_FILTER_REMEMBER_KEY);
            else
                storage?.setItem(LIST_FILTER_REMEMBER_KEY, JSON.stringify({ state: payload }));
        }
        else {
            storage?.removeItem(LIST_FILTER_REMEMBER_KEY);
        }
    }
    catch {
    }
}

function defaultSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

function defaultLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
}