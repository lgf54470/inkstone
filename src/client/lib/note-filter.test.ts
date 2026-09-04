import { describe, expect, it } from 'vitest';
import type { NoteSummary, ViewKind } from '@shared/types';
import { matchesView } from './note-filter';

function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
    return {
        id: 'n1',
        title: 'Note',
        excerpt: '',
        folderId: null,
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        wordCount: 0,
        charCount: 0,
        rev: 1,
        position: 0,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        ...overrides,
    };
}

const base: ViewKind[] = ['all', 'recent', 'starred', 'unfiled', 'folder', 'tag', 'untagged'];

describe('matchesView', () => {
    it('includes live notes in all/recent, excludes deleted ones everywhere', () => {
        for (const view of ['all', 'recent'] as ViewKind[]) {
            expect(matchesView(note(), view, null, null)).toBe(true);
            expect(matchesView(note({ deletedAt: 1 }), view, null, null)).toBe(false);
        }
        for (const view of base) {
            expect(matchesView(note({ deletedAt: 1 }), view, null, null)).toBe(false);
        }
    });

    it('only matches trash view for deleted notes', () => {
        const deleted = note({ deletedAt: 5 });
        expect(matchesView(deleted, 'trash', null, null)).toBe(true);
        expect(matchesView(note(), 'trash', null, null)).toBe(false);
    });

    it('only matches archived view for archived notes', () => {
        const archived = note({ isArchived: true });
        expect(matchesView(archived, 'archived', null, null)).toBe(true);
        expect(matchesView(note(), 'archived', null, null)).toBe(false);
    });

    it('filters starred, unfiled and untagged views', () => {
        expect(matchesView(note({ isStarred: true }), 'starred', null, null)).toBe(true);
        expect(matchesView(note(), 'starred', null, null)).toBe(false);
        expect(matchesView(note({ folderId: null }), 'unfiled', null, null)).toBe(true);
        expect(matchesView(note({ folderId: 'f1' }), 'unfiled', null, null)).toBe(false);
        expect(matchesView(note({ tags: [] }), 'untagged', null, null)).toBe(true);
        expect(matchesView(note({ tags: ['todo'] }), 'untagged', null, null)).toBe(false);
    });

    it('filters pinned and shared views', () => {
        expect(matchesView(note({ isPinned: true }), 'pinned', null, null)).toBe(true);
        expect(matchesView(note(), 'pinned', null, null)).toBe(false);
        const sharedIds = new Set(['s1']);
        expect(matchesView(note({ id: 's1' }), 'shared', null, null, undefined, [], 'any', null, undefined, sharedIds)).toBe(true);
        expect(matchesView(note({ id: 's2' }), 'shared', null, null, undefined, [], 'any', null, undefined, sharedIds)).toBe(false);
    });

    it('matches folder view by folder id and by descendant scope', () => {
        const inFolder = note({ folderId: 'f1' });
        expect(matchesView(inFolder, 'folder', 'f1', null)).toBe(true);
        expect(matchesView(inFolder, 'folder', 'f2', null)).toBe(false);
        expect(matchesView(inFolder, 'folder', 'f2', null, new Set(['f3', 'f1']))).toBe(true);
        expect(matchesView(note(), 'folder', 'f1', null)).toBe(false);
    });

    it('matches the tag view against the viewed tag', () => {
        const tagged = note({ tags: ['reading'] });
        expect(matchesView(tagged, 'tag', null, 'reading')).toBe(true);
        expect(matchesView(tagged, 'tag', null, 'work')).toBe(false);
        expect(matchesView(note(), 'tag', null, 'reading')).toBe(false);
    });

    it('matches the tag view against the viewed tag including descendants', () => {
        const tagged = note({ tags: ['work/projectA'] });
        expect(matchesView(tagged, 'tag', null, 'work')).toBe(true);
        expect(matchesView(tagged, 'tag', null, 'work/projectA')).toBe(true);
        expect(matchesView(tagged, 'tag', null, 'work/projectB')).toBe(false);
    });

    it('stacks multi-tag selection with any view using any-match by default', () => {
        const tagged = note({ tags: ['reading', 'work'] });
        expect(matchesView(tagged, 'all', null, null, undefined, ['reading'])).toBe(true);
        expect(matchesView(tagged, 'all', null, null, undefined, ['reading', 'work'])).toBe(true);
        expect(matchesView(tagged, 'all', null, null, undefined, ['music'])).toBe(false);
        expect(matchesView(tagged, 'all', null, null, undefined, ['music', 'work'])).toBe(true);
    });

    it('uses all-match when requested', () => {
        const tagged = note({ tags: ['reading', 'work'] });
        expect(matchesView(tagged, 'all', null, null, undefined, ['reading', 'work'], 'all')).toBe(true);
        expect(matchesView(tagged, 'all', null, null, undefined, ['reading', 'music'], 'all')).toBe(false);
    });

    it('stacks the selection with folder and tag views', () => {
        const inFolder = note({ folderId: 'f1', tags: ['work'] });
        expect(matchesView(inFolder, 'folder', 'f1', null, undefined, ['work'])).toBe(true);
        expect(matchesView(inFolder, 'folder', 'f1', null, undefined, ['work', 'personal'], 'all')).toBe(false);
        expect(matchesView(inFolder, 'tag', null, 'work', undefined, ['work'])).toBe(true);
        expect(matchesView(inFolder, 'tag', null, 'work', undefined, ['personal'])).toBe(false);
    });

    it('ignores the selection for trash and archived views', () => {
        const deleted = note({ deletedAt: 1, tags: ['work'] });
        const archived = note({ isArchived: true, tags: ['personal'] });
        expect(matchesView(deleted, 'trash', null, null, undefined, ['personal'])).toBe(true);
        expect(matchesView(archived, 'archived', null, null, undefined, ['work'])).toBe(true);
    });

    it('is case sensitive on tag names like the tag facets', () => {
        const tagged = note({ tags: ['Reading'] });
        expect(matchesView(tagged, 'all', null, null, undefined, ['reading'])).toBe(false);
        expect(matchesView(tagged, 'all', null, null, undefined, ['Reading'])).toBe(true);
    });

    it('matches calendar folder ids by note creation time', () => {
        const created = note({ createdAt: new Date(2026, 8, 1, 12).getTime() });
        expect(matchesView(created, 'folder', 'cal', null)).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2026', null)).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2026:q3', null)).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2026:q3:09', null)).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2026:q3:09:w36', null)).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2025', null)).toBe(false);
        expect(matchesView(created, 'folder', 'cal:2026:q4', null)).toBe(false);
        expect(matchesView(created, 'folder', 'cal:2026:q3:07', null)).toBe(false);
        expect(matchesView(created, 'folder', 'cal:2026:q3:09:w35', null)).toBe(false);
        expect(matchesView(created, 'folder', 'cal:2026:q3:09:w36', null, new Set(['cal']))).toBe(true);
    });

    it('stacks tag selection on top of calendar folder views', () => {
        const created = note({ createdAt: new Date(2026, 8, 1, 12).getTime(), tags: ['work'] });
        expect(matchesView(created, 'folder', 'cal:2026:q3:09', null, undefined, ['work'])).toBe(true);
        expect(matchesView(created, 'folder', 'cal:2026:q3:09', null, undefined, ['personal'])).toBe(false);
    });

    it('applies the day filter before the calendar membership check', () => {
        const created = note({ createdAt: new Date(2026, 8, 1, 12).getTime(), updatedAt: new Date(2020, 0, 1).getTime() });
        expect(matchesView(created, 'folder', 'cal', null, undefined, [], 'any', { start: '2019-01-01', end: '2019-01-03' })).toBe(false);
        expect(matchesView(created, 'folder', 'cal', null, undefined, [], 'any', { start: '2019-12-30', end: '2020-01-03' })).toBe(true);
    });

    it('matches todo folder ids by creation time and the todo tag', () => {
        const tagged = note({ id: 'a', tags: ['待办'], createdAt: new Date(2026, 8, 1, 12).getTime() });
        const plain = note({ id: 'b', createdAt: new Date(2026, 8, 2, 12).getTime() });
        for (const id of ['todo', 'todo:2026', 'todo:2026:q3', 'todo:2026:q3:09', 'todo:2026:q3:09:w36']) {
            expect(matchesView(tagged, 'folder', id, null)).toBe(true);
            expect(matchesView(plain, 'folder', id, null)).toBe(false);
        }
        expect(matchesView(tagged, 'folder', 'todo:2026:q3:07', null)).toBe(false);
        expect(matchesView(tagged, 'folder', 'cal:2026:q3:09', null)).toBe(true);
        expect(matchesView(plain, 'folder', 'cal:2026:q3:09', null)).toBe(true);
    });

    it('uses the configured todo tag text for todo folder matching', () => {
        const todo = note({ id: 'a', tags: ['todo'], createdAt: new Date(2026, 8, 1, 12).getTime() });
        const chinese = note({ id: 'b', tags: ['待办'], createdAt: new Date(2026, 8, 2, 12).getTime() });
        expect(matchesView(todo, 'folder', 'todo:2026:q3:09', null, undefined, [], 'any', null, 'todo')).toBe(true);
        expect(matchesView(chinese, 'folder', 'todo:2026:q3:09', null, undefined, [], 'any', null, 'todo')).toBe(false);
        expect(matchesView(chinese, 'folder', 'todo:2026:q3:09', null, undefined, [], 'any', null, '待办, urgent')).toBe(true);
        expect(matchesView(todo, 'folder', 'cal:2026:q3:09', null, undefined, [], 'any', null, 'todo')).toBe(true);
    });
});