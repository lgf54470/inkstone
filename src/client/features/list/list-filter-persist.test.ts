import { beforeEach, describe, expect, it } from 'vitest';
import { LIST_FILTER_PERSIST_KEY, emptyListFilterPersist, loadListFilterPersist, saveListFilterPersist } from './list-filter-persist';

describe('list filter persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to an empty combo when nothing is stored', () => {
        expect(loadListFilterPersist(localStorage)).toEqual(emptyListFilterPersist());
    });

    it('round-trips the full filter combo', () => {
        const state = { query: 'Inkstone diary', dateFilter: '2026-09-02', selectedTags: ['reading', 'work'], selectedTagsMatch: 'all' as const };
        saveListFilterPersist(state, localStorage);
        expect(loadListFilterPersist(localStorage)).toEqual(state);
    });

    it('falls back safely on corrupt JSON', () => {
        localStorage.setItem(LIST_FILTER_PERSIST_KEY, '{broken');
        expect(loadListFilterPersist(localStorage)).toEqual(emptyListFilterPersist());
    });

    it('rejects malformed date filters and tag lists', () => {
        localStorage.setItem(LIST_FILTER_PERSIST_KEY, JSON.stringify({
            query: 'x',
            dateFilter: 'today',
            selectedTags: ['ok', 42, null],
            selectedTagsMatch: 'weird',
        }));
        expect(loadListFilterPersist(localStorage)).toEqual({ query: 'x', dateFilter: null, selectedTags: ['ok'], selectedTagsMatch: 'any' });
    });

    it('tolerates a missing storage object', () => {
        expect(loadListFilterPersist(null)).toEqual(emptyListFilterPersist());
        expect(() => saveListFilterPersist(emptyListFilterPersist(), null)).not.toThrow();
    });
});