import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@shared/types';
import {
    buildVirtualTree,
    buildVirtualTreeCached,
    CALENDAR_TREE,
    filterTodoNotes,
    splitTodoTags,
    TODO_TREE,
    virtualPeriodMatchesNote,
    treeRowIndent,
    virtualTreeRowIndent,
} from '../calendar-tree';
import type { CalendarNode } from '../calendar-tree';
import { note } from './helpers';

describe('buildVirtualTree', () => {
    it('builds year → quarter → month → week only for periods with notes', () => {
        const sept1 = note({ id: 'a', createdAt: new Date(2026, 8, 1, 10).getTime() });
        const sept2 = note({ id: 'b', createdAt: new Date(2026, 8, 2, 10).getTime() });
        const july = note({ id: 'c', createdAt: new Date(2026, 6, 15, 10).getTime() });
        const jan2025 = note({ id: 'd', createdAt: new Date(2025, 0, 2, 10).getTime() });
        const deleted = note({ id: 'e', createdAt: new Date(2026, 8, 3, 10).getTime(), deletedAt: 1 });
        const tree = buildVirtualTree([sept1, sept2, july, jan2025, deleted], CALENDAR_TREE);
        expect(tree).toEqual([
            {
                id: 'cal:2025',
                name: '2025',
                depth: 0,
                count: 1,
                children: [
                    {
                        id: 'cal:2025:q1',
                        name: 'Q1',
                        depth: 1,
                        count: 1,
                        children: [
                            {
                                id: 'cal:2025:q1:01',
                                name: '01',
                                depth: 2,
                                count: 1,
                                children: [
                                    {
                                        id: 'cal:2025:q1:01:w01',
                                        name: 'ww01',
                                        depth: 3,
                                        count: 1,
                                        children: [],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                id: 'cal:2026',
                name: '2026',
                depth: 0,
                count: 3,
                children: [
                    {
                        id: 'cal:2026:q3',
                        name: 'Q3',
                        depth: 1,
                        count: 3,
                        children: [
                            {
                                id: 'cal:2026:q3:07',
                                name: '07',
                                depth: 2,
                                count: 1,
                                children: [
                                    {
                                        id: 'cal:2026:q3:07:w29',
                                        name: 'ww29',
                                        depth: 3,
                                        count: 1,
                                        children: [],
                                    },
                                ],
                            },
                            {
                                id: 'cal:2026:q3:09',
                                name: '09',
                                depth: 2,
                                count: 2,
                                children: [
                                    {
                                        id: 'cal:2026:q3:09:w36',
                                        name: 'ww36',
                                        depth: 3,
                                        count: 2,
                                        children: [],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]);
        expect(tree[1]?.children[0]?.children[1]?.children[0]?.name ?? '').toBe('ww36');
    });

    it('returns an empty list when there are no live notes', () => {
        expect(buildVirtualTree([], CALENDAR_TREE)).toEqual([]);
        expect(buildVirtualTree([note({ deletedAt: 1 })], CALENDAR_TREE)).toEqual([]);
    });

    it('fills the year/quarter/month skeleton with zero counts when includeEmpty', () => {
        const aug = note({ id: 'a', createdAt: new Date(2026, 7, 5, 10).getTime() });
        const tree = buildVirtualTree([aug], CALENDAR_TREE, true);
        expect(tree.map((y) => [y.name, y.count])).toEqual([['2026', 1]]);
        expect(tree[0]!.children.map((q) => [q.name, q.count])).toEqual([['Q1', 0], ['Q2', 0], ['Q3', 1], ['Q4', 0]]);
        const q1 = tree[0]!.children[0]!;
        expect(q1.children.map((m) => [m.name, m.count])).toEqual([['01', 0], ['02', 0], ['03', 0]]);
        expect(q1.children[0]!.children).toEqual([]);
        const q3 = tree[0]!.children[2]!;
        expect(q3.children.map((m) => [m.name, m.count])).toEqual([['07', 0], ['08', 1], ['09', 0]]);
        expect(q3.children[0]!.children).toEqual([]);
        expect(q3.children[1]!.children.map((w) => [w.name, w.count])).toEqual([['ww32', 1]]);
    });

    it('spans the full year range when includeEmpty, staying sparse by default', () => {
        const a = note({ id: 'a', createdAt: new Date(2025, 0, 15, 10).getTime() });
        const b = note({ id: 'b', createdAt: new Date(2027, 2, 20, 10).getTime() });
        const full = buildVirtualTree([a, b], CALENDAR_TREE, true);
        expect(full.map((y) => y.name)).toEqual(['2025', '2026', '2027']);
        expect(full[1]!.count).toBe(0);
        expect(full[1]!.children.length).toBe(4);
        const sparse = buildVirtualTree([a, b], CALENDAR_TREE, false);
        expect(sparse.map((y) => y.name)).toEqual(['2025', '2027']);
        expect(buildVirtualTree([], CALENDAR_TREE, true)).toEqual([]);
        expect(buildVirtualTree([note({ deletedAt: 1 })], CALENDAR_TREE, true)).toEqual([]);
    });

    it('builds a todo tree from tagged notes with the todo namespace ids', () => {
        const taggedSep = note({ id: 'a', tags: ['待办'], createdAt: new Date(2026, 8, 1, 10).getTime() });
        const taggedJul = note({ id: 'b', tags: ['work', '待办'], createdAt: new Date(2026, 6, 15, 10).getTime() });
        const plainSep = note({ id: 'c', createdAt: new Date(2026, 8, 2, 10).getTime() });
        const tree = buildVirtualTree(filterTodoNotes([taggedSep, taggedJul, plainSep]), TODO_TREE);
        expect(tree.map((y) => [y.id, y.count])).toEqual([['todo:2026', 2]]);
        expect(tree[0]!.children.map((q) => [q.id, q.count])).toEqual([['todo:2026:q3', 2]]);
        expect(tree[0]!.children[0]!.children.map((m) => [m.id, m.count])).toEqual([['todo:2026:q3:07', 1], ['todo:2026:q3:09', 1]]);
        const jul = tree[0]!.children[0]!.children[0]!;
        expect(jul.children.map((w) => [w.id, w.name, w.count])).toEqual([['todo:2026:q3:07:w29', 'ww29', 1]]);
        expect(virtualPeriodMatchesNote({ kind: 'month', year: 2026, month: 9 }, taggedSep, TODO_TREE)).toBe(true);
        expect(virtualPeriodMatchesNote({ kind: 'month', year: 2026, month: 9 }, plainSep, TODO_TREE)).toBe(false);
        expect(virtualPeriodMatchesNote({ kind: 'month', year: 2026, month: 9 }, plainSep, CALENDAR_TREE)).toBe(true);
        expect(virtualPeriodMatchesNote({ kind: 'root' }, plainSep, TODO_TREE)).toBe(false);
    });
});

describe('tree row indentation', () => {
    const indentFailures = (nodes: CalendarNode[], parentDepth: number): string[] =>
        nodes.flatMap((node) => {
            const bad = virtualTreeRowIndent(node.depth) > virtualTreeRowIndent(parentDepth)
                ? [] : [`${node.name} (depth ${node.depth}) not indented past depth ${parentDepth}`];
            return bad.concat(indentFailures(node.children, node.depth));
        });

    it('shares one 13px-step formula between folder rows and virtual rows', () => {
        expect(treeRowIndent(0)).toBe(6);
        expect(treeRowIndent(1)).toBe(19);
        expect(treeRowIndent(4)).toBe(58);
        expect(virtualTreeRowIndent(-1)).toBe(6);
        expect(virtualTreeRowIndent(0)).toBe(19);
        expect(virtualTreeRowIndent(1)).toBe(32);
        expect(virtualTreeRowIndent(2)).toBe(45);
        expect(virtualTreeRowIndent(3)).toBe(58);
        expect(virtualTreeRowIndent(4)).toBe(71);
    });

    it('keeps every filled child level visually nested under its parent', () => {
        const a = note({ id: 'a', createdAt: new Date(2025, 0, 31, 10).getTime() });
        const b = note({ id: 'b', createdAt: new Date(2026, 7, 12, 10).getTime() });
        const tree = buildVirtualTree([a, b], CALENDAR_TREE, false);
        expect(tree.map((y) => [y.name, y.depth])).toEqual([['2025', 0], ['2026', 0]]);
        expect(indentFailures(tree, -1)).toEqual([]);
    });

    it('keeps includeEmpty skeletons nested through sparse years in both trees', () => {
        const calNotes = [
            note({ id: 'a', createdAt: new Date(2025, 0, 31, 10).getTime() }),
            note({ id: 'b', createdAt: new Date(2027, 2, 20, 10).getTime() }),
        ];
        const todoNotes = [
            note({ id: 'c', tags: ['待办'], createdAt: new Date(2025, 0, 31, 10).getTime() }),
            note({ id: 'd', tags: ['待办'], createdAt: new Date(2027, 2, 20, 10).getTime() }),
        ];
        const trees = [
            buildVirtualTree(calNotes, CALENDAR_TREE, true),
            buildVirtualTree(filterTodoNotes(todoNotes), TODO_TREE, true),
        ];
        for (const tree of trees) {
            expect(tree.map((y) => y.name)).toEqual(['2025', '2026', '2027']);
            expect(indentFailures(tree, -1)).toEqual([]);
            const y2026 = tree[1]!;
            expect(virtualTreeRowIndent(y2026.depth)).toBe(19);
            expect(y2026.children.map((q) => virtualTreeRowIndent(q.depth))).toEqual([32, 32, 32, 32]);
            const q1 = y2026.children[0]!;
            expect(q1.children.map((m) => [m.name, virtualTreeRowIndent(m.depth)])).toEqual([['01', 45], ['02', 45], ['03', 45]]);
            const mar27 = tree[2]!.children[0]!.children[2]!;
            expect(mar27.children.map((w) => virtualTreeRowIndent(w.depth))).toEqual([58]);
        }
    });
});

describe('buildVirtualTreeCached', () => {
    const asRecord = (items: NoteSummary[]): Record<string, NoteSummary> =>
        Object.fromEntries(items.map((item) => [item.id, item]));
    const sept1 = note({ id: 'n1', createdAt: new Date(2026, 8, 1, 10).getTime(), updatedAt: 100 });
    const sept2 = note({ id: 'n2', createdAt: new Date(2026, 8, 2, 10).getTime(), updatedAt: 200 });
    const july = note({ id: 'n3', createdAt: new Date(2026, 6, 15, 10).getTime() });

    it('returns the same tree identity when only a summary changed', () => {
        const first = buildVirtualTreeCached(asRecord([sept1, sept2, july]), CALENDAR_TREE, false);
        // A typing-derived summary commit clones the whole map but changes only
        // excerpt/wordCount/updatedAt on one note — none of which feed the tree.
        const edited = {
            ...sept2,
            excerpt: 'new excerpt',
            wordCount: 42,
            charCount: 300,
            updatedAt: 9_000,
        };
        const nextMap = asRecord([sept1, edited, july]);
        const second = buildVirtualTreeCached(nextMap, CALENDAR_TREE, false);
        expect(second).toBe(first);
        expect(second).toEqual(buildVirtualTree([sept1, sept2, july], CALENDAR_TREE, false));
    });

    it('rebuilds when a note is added, removed, or structurally changed', () => {
        const base = asRecord([sept1, sept2, july]);
        const first = buildVirtualTreeCached(base, CALENDAR_TREE, false);
        expect(buildVirtualTreeCached({ ...base, n4: note({ id: 'n4', createdAt: new Date(2026, 9, 3, 10).getTime() }) }, CALENDAR_TREE, false)).not.toBe(first);
        expect(buildVirtualTreeCached(asRecord([sept1, july]), CALENDAR_TREE, false)).not.toBe(first);
        const trashed = { ...sept2, deletedAt: 5_000 };
        expect(buildVirtualTreeCached(asRecord([sept1, trashed, july]), CALENDAR_TREE, false)).not.toBe(first);
        const moved = { ...sept2, createdAt: new Date(2027, 0, 5, 10).getTime() };
        expect(buildVirtualTreeCached(asRecord([sept1, moved, july]), CALENDAR_TREE, false)).not.toBe(first);
        const restored = { ...sept2, deletedAt: null };
        expect(buildVirtualTreeCached(asRecord([sept1, restored, july]), CALENDAR_TREE, false)).not.toBe(first);
    });

    it('ignores summary-only and tag-noise changes for the calendar tree', () => {
        const base = asRecord([sept1, sept2, july]);
        const first = buildVirtualTreeCached(base, CALENDAR_TREE, false);
        const moved = { ...sept2, title: 'Renamed', tags: ['noise'], isStarred: true, folderId: 'f1' };
        expect(buildVirtualTreeCached(asRecord([sept1, moved, july]), CALENDAR_TREE, false)).toBe(first);
    });

    it('rebuilds the todo tree when todo membership flips', () => {
        const tags = splitTodoTags('待办');
        const plain = note({ id: 'p1', createdAt: new Date(2026, 8, 1, 10).getTime() });
        const tagged = note({ id: 'p2', tags: ['待办'], createdAt: new Date(2026, 8, 2, 10).getTime() });
        const map = asRecord([plain, tagged]);
        const first = buildVirtualTreeCached(map, TODO_TREE, false, tags);
        // Summary-only edits keep the tree identity.
        const edited = { ...tagged, excerpt: 'new excerpt', updatedAt: 9_000 };
        expect(buildVirtualTreeCached(asRecord([plain, edited]), TODO_TREE, false, tags)).toBe(first);
        // Losing the todo tag removes the note from the todo tree.
        const untaggedMap = asRecord([plain, { ...tagged, tags: [] }]);
        const afterFlip = buildVirtualTreeCached(untaggedMap, TODO_TREE, false, tags);
        expect(afterFlip).not.toBe(first);
        // Renaming the configured todo tag rebuilds against the new membership.
        const renamed = buildVirtualTreeCached(untaggedMap, TODO_TREE, false, splitTodoTags('todo'));
        expect(renamed).not.toBe(afterFlip);
        // A summary-only edit under the new tag set still hits the cache.
        expect(buildVirtualTreeCached(asRecord([plain, { ...tagged, tags: [], excerpt: 'y' }]), TODO_TREE, false, splitTodoTags('todo'))).toBe(renamed);
        // Dropping the todo filter widens the tree to every note (same slot, new build).
        const withoutFilter = buildVirtualTreeCached(untaggedMap, TODO_TREE, false, null);
        expect(withoutFilter).not.toBe(renamed);
    });

    it('separates cache slots per namespace and includeEmpty flag', () => {
        const map = asRecord([sept1, sept2, july]);
        expect(buildVirtualTreeCached(map, CALENDAR_TREE, false)).not.toBe(buildVirtualTreeCached(map, CALENDAR_TREE, true));
        expect(buildVirtualTreeCached(map, CALENDAR_TREE, false)).not.toBe(buildVirtualTreeCached(map, TODO_TREE, false, splitTodoTags('待办')));
    });
});
