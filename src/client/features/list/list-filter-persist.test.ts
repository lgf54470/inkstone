import { beforeEach, describe, expect, it } from 'vitest';
import { LIST_FILTER_REMEMBER_KEY, LIST_FILTER_SESSION_KEY, emptyListFilterPersist, loadRememberedFilter, loadSessionFilter, saveRememberedFilter, saveSessionFilter } from './list-filter-persist';

describe('list filter session persistence', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('defaults to an empty combo when nothing is stored', () => {
        expect(loadSessionFilter(sessionStorage)).toEqual(emptyListFilterPersist());
    });

    it('round-trips the full filter combo', () => {
        const state = { query: 'Inkstone diary', dateFilter: { start: '2026-09-02', end: '2026-09-04' }, relativeFilter: { days: 7, direction: 'edit' as const }, selectedTags: ['reading', 'work'], selectedTagsMatch: 'all' as const };
        saveSessionFilter(state, sessionStorage);
        expect(loadSessionFilter(sessionStorage)).toEqual(state);
    });

    it('falls back safely on corrupt JSON', () => {
        sessionStorage.setItem(LIST_FILTER_SESSION_KEY, '{broken');
        expect(loadSessionFilter(sessionStorage)).toEqual(emptyListFilterPersist());
    });

    it('rejects malformed ranges, rolling filters, tags, and match modes', () => {
        sessionStorage.setItem(LIST_FILTER_SESSION_KEY, JSON.stringify({
            query: 'x',
            dateFilter: { start: 'oops', end: '2026-09-04' },
            relativeFilter: { days: 999, direction: 'weird' },
            selectedTags: ['ok', 42, null],
            selectedTagsMatch: 'weird',
        }));
        expect(loadSessionFilter(sessionStorage)).toEqual({ query: 'x', dateFilter: null, relativeFilter: null, selectedTags: ['ok'], selectedTagsMatch: 'any' });
    });

    it('accepts a valid rolling filter and normalizes reversed ranges', () => {
        sessionStorage.setItem(LIST_FILTER_SESSION_KEY, JSON.stringify({
            query: '',
            dateFilter: { start: '2026-09-09', end: '2026-09-02' },
            relativeFilter: { days: 14, direction: 'today' },
        }));
        const loaded = loadSessionFilter(sessionStorage);
        expect(loaded.dateFilter).toEqual({ start: '2026-09-02', end: '2026-09-09' });
        expect(loaded.relativeFilter).toEqual({ days: 14, direction: 'today' });
    });

    it('normalizes reversed ranges', () => {
        saveSessionFilter({ ...emptyListFilterPersist(), dateFilter: { start: '2026-09-09', end: '2026-09-02' } }, sessionStorage);
        expect(loadSessionFilter(sessionStorage).dateFilter).toEqual({ start: '2026-09-02', end: '2026-09-09' });
    });
});

describe('list filter remembered persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns null when nothing is remembered', () => {
        expect(loadRememberedFilter(localStorage)).toBeNull();
    });

    it('round-trips a remembered combo', () => {
        const state = { query: 'diary', dateFilter: { start: '2026-09-02', end: '2026-09-02' }, relativeFilter: { days: 30, direction: 'edit' as const }, selectedTags: ['work'], selectedTagsMatch: 'any' as const };
        saveRememberedFilter(state, localStorage);
        expect(loadRememberedFilter(localStorage)).toEqual(state);
        saveRememberedFilter(null, localStorage);
        expect(loadRememberedFilter(localStorage)).toBeNull();
        expect(localStorage.getItem(LIST_FILTER_REMEMBER_KEY)).toBeNull();
    });

    it('removes the entry when forgetting an empty combo', () => {
        saveRememberedFilter(emptyListFilterPersist(), localStorage);
        expect(loadRememberedFilter(localStorage)).toBeNull();
        expect(localStorage.getItem(LIST_FILTER_REMEMBER_KEY)).toBeNull();
    });

    it('tolerates a missing storage object', () => {
        expect(loadSessionFilter(null)).toEqual(emptyListFilterPersist());
        expect(loadRememberedFilter(null)).toBeNull();
        expect(() => saveSessionFilter(emptyListFilterPersist(), null)).not.toThrow();
        expect(() => saveRememberedFilter(emptyListFilterPersist(), null)).not.toThrow();
    });
});