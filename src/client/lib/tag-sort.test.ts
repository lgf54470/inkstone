import { describe, expect, it } from 'vitest';
import type { Tag } from '@shared/types';
import { sortTagsForPicker } from './tag-sort';

function tag(name: string, count = 0): Tag {
    return { id: name, name, color: null, count, createdAt: 0 };
}

describe('sortTagsForPicker', () => {
    it('sorts by note count descending, then name, without a query', () => {
        const tags = [tag('zeta', 1), tag('alpha', 5), tag('beta', 5), tag('gamma', 3)];
        expect(sortTagsForPicker(tags, '').map((t) => t.name)).toEqual(['alpha', 'beta', 'gamma', 'zeta']);
    });

    it('keeps only matching tags when a query is present', () => {
        const tags = [tag('weekly', 1), tag('work', 4), tag('reading', 3)];
        expect(sortTagsForPicker(tags, 'work').map((t) => t.name)).toEqual(['work']);
        expect(sortTagsForPicker(tags, 'week').map((t) => t.name)).toEqual(['weekly']);
    });

    it('ranks exact matches over prefixes and earlier substrings over later ones', () => {
        const tags = [tag('reading', 1), tag('read', 9), tag('bread', 5), tag('reading-list', 0)];
        expect(sortTagsForPicker(tags, 'read').map((t) => t.name)).toEqual(['read', 'reading', 'reading-list', 'bread']);
    });

    it('breaks relevance ties by note count and name', () => {
        const tags = [tag('re-read', 1), tag('reload', 3), tag('reload-all', 0)];
        expect(sortTagsForPicker(tags, 're').map((t) => t.name)).toEqual(['reload', 're-read', 'reload-all']);
    });

    it('matches case-insensitively', () => {
        const tags = [tag('WORK', 1), tag('weekly', 2)];
        expect(sortTagsForPicker(tags, 'work').map((t) => t.name)).toEqual(['WORK']);
    });

    it('does not mutate the input array', () => {
        const tags = [tag('b', 2), tag('a', 1)];
        const copy = [...tags];
        sortTagsForPicker(tags, '');
        expect(tags).toEqual(copy);
    });

    it('prioritizes pinned tags ahead of unpinned tags without query', () => {
        const tags = [
            tag('zeta', 10),
            { ...tag('beta', 2), isPinned: true },
            { ...tag('alpha', 1), isPinned: true },
            tag('gamma', 5),
        ];
        expect(sortTagsForPicker(tags, '').map((t) => t.name)).toEqual(['beta', 'alpha', 'zeta', 'gamma']);
    });
});