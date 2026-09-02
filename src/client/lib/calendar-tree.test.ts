import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@shared/types';
import {
    buildVirtualTree,
    CALENDAR_TREE,
    calendarPeriodForIsoWeek,
    calendarPeriodLabel,
    calendarPeriodMatchesNote,
    calendarPeriodsForDate,
    DEFAULT_TODO_TAG,
    filterTodoNotes,
    isCalendarFolderId,
    isTodoFolderId,
    isVirtualFolderId,
    parseCalendarJumpQuery,
    parseVirtualId,
    resolveTodoTag,
    splitTodoTags,
    TODO_TREE,
    virtualAncestorIds,
    virtualId,
    virtualNearestNeighbors,
    virtualPathSegments,
    virtualPeriodKeyRange,
    virtualPeriodMatchesNote,
    treeRowIndent,
    virtualTreeRowIndent,
} from './calendar-tree';
import type { CalendarNode } from './calendar-tree';

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

describe('virtual folder id detection', () => {
    it('recognizes the calendar root and prefixed ids only', () => {
        expect(isCalendarFolderId('cal')).toBe(true);
        expect(isCalendarFolderId('cal:2026')).toBe(true);
        expect(isCalendarFolderId('cal:2026:q3:09:w36')).toBe(true);
        expect(isCalendarFolderId(null)).toBe(false);
        expect(isCalendarFolderId(undefined)).toBe(false);
        expect(isCalendarFolderId('')).toBe(false);
        expect(isCalendarFolderId('calx')).toBe(false);
        expect(isCalendarFolderId('cal:')).toBe(true);
        expect(isCalendarFolderId('abcdefghjkmnpqrstvwxyz012345')).toBe(false);
    });

    it('recognizes the todo namespace separately and together', () => {
        expect(isTodoFolderId('todo')).toBe(true);
        expect(isTodoFolderId('todo:2026:q3:09:w36')).toBe(true);
        expect(isTodoFolderId('cal')).toBe(false);
        expect(isCalendarFolderId('todo')).toBe(false);
        expect(isVirtualFolderId('cal')).toBe(true);
        expect(isVirtualFolderId('todo:2026')).toBe(true);
        expect(isVirtualFolderId('cal:2026')).toBe(true);
        expect(isVirtualFolderId(null)).toBe(false);
        expect(isVirtualFolderId('todo')).toBe(true);
    });
});

describe('virtualId round-trips per namespace', () => {
    it('round-trips generated ids', () => {
        const ids = [
            'cal',
            'cal:2026',
            'cal:2026:q2',
            'cal:2026:q2:06',
            'cal:2026:q2:06:w25',
        ];
        for (const id of ids) {
            expect(virtualId(parseVirtualId(id, CALENDAR_TREE)!, CALENDAR_TREE)).toBe(id);
        }
    });

    it('uses the todo root and prefix', () => {
        expect(virtualId({ kind: 'root' }, TODO_TREE)).toBe('todo');
        expect(virtualId({ kind: 'week', year: 2026, month: 9, week: 36 }, TODO_TREE)).toBe('todo:2026:q3:09:w36');
        expect(parseVirtualId('todo:2026:q3:09:w36', TODO_TREE)).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
        expect(parseVirtualId('todo', TODO_TREE)).toEqual({ kind: 'root' });
        expect(parseVirtualId('cal:2026', TODO_TREE)).toBeNull();
        expect(parseVirtualId('todo:2026', CALENDAR_TREE)).toBeNull();
    });

    it('rejects malformed ids', () => {
        for (const id of [null, undefined, '', 'calx', 'cal:abcd', 'cal:26', 'cal:2026:q5', 'cal:2026:q1:13', 'cal:2026:q1:00', 'cal:2026:q1:01:w00', 'cal:2026:q1:01:w54', 'cal:2026:q1:01:w36:extra']) {
            expect(parseVirtualId(id, CALENDAR_TREE)).toBeNull();
        }
    });

    it('parses every level', () => {
        expect(parseVirtualId('cal', CALENDAR_TREE)).toEqual({ kind: 'root' });
        expect(parseVirtualId('cal:2026', CALENDAR_TREE)).toEqual({ kind: 'year', year: 2026 });
        expect(parseVirtualId('cal:2026:q3', CALENDAR_TREE)).toEqual({ kind: 'quarter', year: 2026, quarter: 3 });
        expect(parseVirtualId('cal:2026:q3:09', CALENDAR_TREE)).toEqual({ kind: 'month', year: 2026, month: 9 });
        expect(parseVirtualId('cal:2026:q3:09:w36', CALENDAR_TREE)).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
    });
});

describe('ISO week assignment', () => {
    it('keeps the week with the Thursday year and month', () => {
        const inSep2026 = note({ createdAt: new Date(2026, 8, 1, 12).getTime() });
        expect(calendarPeriodMatchesNote({ kind: 'week', year: 2026, month: 9, week: 36 }, inSep2026)).toBe(true);
        expect(calendarPeriodMatchesNote({ kind: 'month', year: 2026, month: 9 }, inSep2026)).toBe(true);
        expect(calendarPeriodMatchesNote({ kind: 'quarter', year: 2026, quarter: 3 }, inSep2026)).toBe(true);
        expect(calendarPeriodMatchesNote({ kind: 'year', year: 2026 }, inSep2026)).toBe(true);
    });

    it('assigns a whole week to one month via its Thursday', () => {
        const lastDay = note({ createdAt: new Date(2026, 8, 1, 12).getTime() });
        expect(calendarPeriodMatchesNote({ kind: 'week', year: 2026, month: 8, week: 36 }, lastDay)).toBe(false);
        expect(calendarPeriodMatchesNote({ kind: 'month', year: 2026, month: 8 }, lastDay)).toBe(false);
        expect(calendarPeriodMatchesNote({ kind: 'month', year: 2026, month: 10 }, lastDay)).toBe(false);
    });

    it('handles the year-boundary weeks (ISO rule)', () => {
        const newYearsDay2021 = note({ createdAt: new Date(2021, 0, 1, 12).getTime() });
        expect(calendarPeriodMatchesNote({ kind: 'week', year: 2020, month: 12, week: 53 }, newYearsDay2021)).toBe(true);
        expect(calendarPeriodMatchesNote({ kind: 'year', year: 2021 }, newYearsDay2021)).toBe(false);

        const newYearsEve2024 = note({ createdAt: new Date(2024, 11, 31, 12).getTime() });
        expect(calendarPeriodMatchesNote({ kind: 'week', year: 2025, month: 1, week: 1 }, newYearsEve2024)).toBe(true);
        expect(calendarPeriodMatchesNote({ kind: 'year', year: 2024 }, newYearsEve2024)).toBe(false);
    });

    it('supports 53-week years', () => {
        const lastDay2026 = note({ createdAt: new Date(2026, 11, 31, 12).getTime() });
        expect(calendarPeriodMatchesNote({ kind: 'week', year: 2026, month: 12, week: 53 }, lastDay2026)).toBe(true);
    });
});

describe('virtualPathSegments', () => {
    it('returns the display path without the root', () => {
        expect(virtualPathSegments('cal', CALENDAR_TREE)).toBeNull();
        expect(virtualPathSegments('cal:2026', CALENDAR_TREE)).toEqual(['2026']);
        expect(virtualPathSegments('cal:2026:q3', CALENDAR_TREE)).toEqual(['2026', 'Q3']);
        expect(virtualPathSegments('cal:2026:q3:09', CALENDAR_TREE)).toEqual(['2026', 'Q3', '09']);
        expect(virtualPathSegments('cal:2026:q3:09:w36', CALENDAR_TREE)).toEqual(['2026', 'Q3', '09', 'ww36']);
        expect(virtualPathSegments('todo:2026:q1:02', TODO_TREE)).toEqual(['2026', 'Q1', '02']);
        expect(virtualPathSegments(null, CALENDAR_TREE)).toBeNull();
    });
});

describe('virtualNearestNeighbors', () => {
    const notes = [
        note({ id: 'a', createdAt: new Date(2025, 1, 10, 10).getTime() }),
        note({ id: 'b', createdAt: new Date(2025, 4, 20, 10).getTime() }),
        note({ id: 'c', createdAt: new Date(2026, 7, 5, 10).getTime() }),
        note({ id: 'd', createdAt: new Date(2024, 0, 15, 10).getTime() }),
    ];

    it('finds the nearest months with notes on both sides', () => {
        const { prev, next } = virtualNearestNeighbors({ kind: 'month', year: 2025, month: 3 }, notes, CALENDAR_TREE);
        expect(prev?.id).toBe('cal:2025:q1:02');
        expect(prev?.count).toBe(1);
        expect(next?.id).toBe('cal:2025:q2:05');
        expect(next?.count).toBe(1);
    });

    it('crosses year boundaries', () => {
        const { prev, next } = virtualNearestNeighbors({ kind: 'month', year: 2025, month: 4 }, notes, CALENDAR_TREE);
        expect(prev?.id).toBe('cal:2025:q1:02');
        expect(next?.id).toBe('cal:2025:q2:05');
        const { prev: farPrev, next: farNext } = virtualNearestNeighbors({ kind: 'month', year: 2023, month: 6 }, notes, CALENDAR_TREE);
        expect(farPrev).toBeNull();
        expect(farNext?.id).toBe('cal:2024:q1:01');
    });

    it('works at the year, quarter, and week levels', () => {
        const years = virtualNearestNeighbors({ kind: 'year', year: 2025 }, notes, CALENDAR_TREE);
        expect(years.prev?.id).toBe('cal:2024');
        expect(years.next?.id).toBe('cal:2026');
        const quarters = virtualNearestNeighbors({ kind: 'quarter', year: 2025, quarter: 3 }, notes, CALENDAR_TREE);
        expect(quarters.prev?.id).toBe('cal:2025:q2');
        expect(quarters.next?.id).toBe('cal:2026:q3');
        const weeks = virtualNearestNeighbors({ kind: 'week', year: 2026, month: 9, week: 36 }, notes, CALENDAR_TREE);
        expect(weeks.prev?.id).toBe('cal:2026:q3:08:w32');
        expect(weeks.next).toBeNull();
    });

    it('uses the todo namespace ids for todo neighbors', () => {
        const { prev, next } = virtualNearestNeighbors({ kind: 'month', year: 2025, month: 3 }, notes, TODO_TREE);
        expect(prev?.id).toBe('todo:2025:q1:02');
        expect(next?.id).toBe('todo:2025:q2:05');
    });

    it('returns nulls when no notes exist', () => {
        const { prev, next } = virtualNearestNeighbors({ kind: 'year', year: 2025 }, [], CALENDAR_TREE);
        expect(prev).toBeNull();
        expect(next).toBeNull();
    });
});

describe('calendarPeriodLabel', () => {
    it('formats every period kind', () => {
        expect(calendarPeriodLabel({ kind: 'root' })).toBeNull();
        expect(calendarPeriodLabel({ kind: 'year', year: 2025 })).toBe('2025');
        expect(calendarPeriodLabel({ kind: 'quarter', year: 2025, quarter: 3 })).toBe('2025 · Q3');
        expect(calendarPeriodLabel({ kind: 'month', year: 2025, month: 3 })).toBe('2025-03');
        expect(calendarPeriodLabel({ kind: 'week', year: 2026, month: 9, week: 36 })).toBe('2026 · ww36');
    });
});

describe('virtualPeriodKeyRange', () => {
    it('returns inclusive date-key ranges per node', () => {
        expect(virtualPeriodKeyRange('cal', CALENDAR_TREE)).toBeNull();
        expect(virtualPeriodKeyRange('cal:2026', CALENDAR_TREE)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
        expect(virtualPeriodKeyRange('cal:2026:q3', CALENDAR_TREE)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
        expect(virtualPeriodKeyRange('cal:2026:q4', CALENDAR_TREE)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
        expect(virtualPeriodKeyRange('cal:2026:q1:02', CALENDAR_TREE)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
        expect(virtualPeriodKeyRange('cal:2024:q1:02', CALENDAR_TREE)).toEqual({ start: '2024-02-01', end: '2024-02-29' });
        expect(virtualPeriodKeyRange('cal:2026:q3:09', CALENDAR_TREE)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(virtualPeriodKeyRange('cal:2026:q3:09:w36', CALENDAR_TREE)).toEqual({ start: '2026-08-31', end: '2026-09-06' });
        expect(virtualPeriodKeyRange('todo:2026:q1:02', TODO_TREE)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
        expect(virtualPeriodKeyRange(null, CALENDAR_TREE)).toBeNull();
    });
});

describe('calendarPeriodForIsoWeek', () => {
    it('assigns the Thursday month to a week', () => {
        expect(calendarPeriodForIsoWeek(2026, 36)).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
        expect(calendarPeriodForIsoWeek(2025, 34)).toEqual({ kind: 'week', year: 2025, month: 8, week: 34 });
    });

    it('rejects weeks that never occur in the requested year', () => {
        expect(calendarPeriodForIsoWeek(2025, 53)).toBeNull();
        expect(calendarPeriodForIsoWeek(2026, 0)).toBeNull();
        expect(calendarPeriodForIsoWeek(2026, 54)).toBeNull();
        expect(calendarPeriodForIsoWeek(2026, 1.5)).toBeNull();
    });

    it('accepts real 53rd weeks at the end of December', () => {
        expect(calendarPeriodForIsoWeek(2020, 53)).toEqual({ kind: 'week', year: 2020, month: 12, week: 53 });
        expect(calendarPeriodForIsoWeek(2026, 53)).toEqual({ kind: 'week', year: 2026, month: 12, week: 53 });
    });
});

describe('parseCalendarJumpQuery', () => {
    const today = new Date(2026, 8, 2, 12);

    it('parses a bare year', () => {
        expect(parseCalendarJumpQuery('2025', today)).toEqual({ kind: 'year', year: 2025 });
        expect(parseCalendarJumpQuery(' 2025 ', today)).toEqual({ kind: 'year', year: 2025 });
        expect(parseCalendarJumpQuery('2025', undefined)).toEqual({ kind: 'year', year: 2025 });
    });

    it('parses a month with padded or plain numbers', () => {
        expect(parseCalendarJumpQuery('2025-03', today)).toEqual({ kind: 'month', year: 2025, month: 3 });
        expect(parseCalendarJumpQuery('2025-3', today)).toEqual({ kind: 'month', year: 2025, month: 3 });
    });

    it('parses a week in the current year or an explicit year', () => {
        expect(parseCalendarJumpQuery('ww36', today)).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
        expect(parseCalendarJumpQuery('2025-ww34', today)).toEqual({ kind: 'week', year: 2025, month: 8, week: 34 });
        expect(parseCalendarJumpQuery('WW36', today)).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
    });

    it('parses a full date or month-day into its containing week', () => {
        expect(parseCalendarJumpQuery('2025-03-15', today)).toEqual({ kind: 'week', year: 2025, month: 3, week: 11 });
        expect(parseCalendarJumpQuery('2025-03-01', today)).toEqual({ kind: 'week', year: 2025, month: 2, week: 9 });
        expect(parseCalendarJumpQuery('2025-3-1', today)).toEqual({ kind: 'week', year: 2025, month: 2, week: 9 });
        expect(parseCalendarJumpQuery('09-27', today)).toEqual({ kind: 'week', year: 2026, month: 9, week: 39 });
        const leapYear = new Date(2024, 5, 1);
        expect(parseCalendarJumpQuery('02-29', leapYear)).toEqual({ kind: 'week', year: 2024, month: 2, week: 9 });
    });

    it('rejects malformed or out-of-range queries', () => {
        for (const query of ['', 'note', '202', '2025-00', '2025-13', '2025-031', 'ww0', 'ww54', '2025-ww00', '2025-ww53', '2025q3', 'w36', '2025-02-30', '2025-13-01', '2025-00-01', '2025-4-40', '2025-03-15x', '2025-03-01-01', '02-30', '02-29']) {
            expect(parseCalendarJumpQuery(query, today)).toBeNull();
        }
    });
});

describe('calendarPeriodsForDate', () => {
    it('maps a date to its year/quarter/month/week periods', () => {
        const periods = calendarPeriodsForDate(new Date(2026, 8, 1, 12));
        expect(periods.year).toEqual({ kind: 'year', year: 2026 });
        expect(periods.quarter).toEqual({ kind: 'quarter', year: 2026, quarter: 3 });
        expect(periods.month).toEqual({ kind: 'month', year: 2026, month: 9 });
        expect(periods.week).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
    });
});

describe('virtualAncestorIds', () => {
    it('returns the ancestor chain without the node itself', () => {
        expect(virtualAncestorIds('cal:2026:q3:09:w36', CALENDAR_TREE)).toEqual(['cal:2026', 'cal:2026:q3', 'cal:2026:q3:09']);
        expect(virtualAncestorIds('cal:2026', CALENDAR_TREE)).toEqual([]);
        expect(virtualAncestorIds('cal', CALENDAR_TREE)).toEqual([]);
        expect(virtualAncestorIds('nope', CALENDAR_TREE)).toEqual([]);
        expect(virtualAncestorIds('todo:2026:q3:09:w36', TODO_TREE)).toEqual(['todo:2026', 'todo:2026:q3', 'todo:2026:q3:09']);
    });
});

describe('todo tag configuration', () => {
    it('keeps only notes carrying the default todo tag when no tag text is given', () => {
        const tagged = note({ id: 'a', tags: ['待办'] });
        const mixed = note({ id: 'b', tags: ['work', '待办'] });
        const plain = note({ id: 'c', tags: ['work'] });
        const none = note({ id: 'd' });
        expect(filterTodoNotes([tagged, mixed, plain, none]).map((n) => n.id)).toEqual(['a', 'b']);
        expect(DEFAULT_TODO_TAG).toBe('待办');
    });

    it('does not match a tag stored with a hash or different name', () => {
        const hashed = note({ id: 'a', tags: ['#待办'] });
        const renamed = note({ id: 'b', tags: ['todo-item'] });
        expect(filterTodoNotes([hashed, renamed])).toEqual([]);
    });

    it('filters by a custom tag text, with comma-separated multiple tags', () => {
        const todo = note({ id: 'a', tags: ['todo'] });
        const mixed = note({ id: 'b', tags: ['work', 'todo'] });
        const chinese = note({ id: 'c', tags: ['待办'] });
        const plain = note({ id: 'd', tags: ['work'] });
        expect(filterTodoNotes([todo, mixed, chinese, plain], 'todo').map((n) => n.id)).toEqual(['a', 'b']);
        expect(filterTodoNotes([todo, mixed, chinese, plain], ' todo , 待办 ').map((n) => n.id)).toEqual(['a', 'b', 'c']);
        expect(filterTodoNotes([todo, mixed, chinese, plain], '  ,  ')).toEqual([]);
    });

    it('splits comma-separated tag text, trimming and dropping empties', () => {
        expect(splitTodoTags('todo,待办 , work')).toEqual(['todo', '待办', 'work']);
        expect(splitTodoTags('')).toEqual([]);
        expect(splitTodoTags('  ,  ')).toEqual([]);
    });

    it('resolves a preference, defaulting by locale', () => {
        expect(resolveTodoTag(null, 'zh-CN')).toBe('待办');
        expect(resolveTodoTag(undefined, 'zh-CN')).toBe('待办');
        expect(resolveTodoTag(null, 'en-US')).toBe('todo');
        expect(resolveTodoTag('', 'en-US')).toBe('todo');
        expect(resolveTodoTag('urgent', 'zh-CN')).toBe('urgent');
        expect(resolveTodoTag('  urgent  ', 'en-US')).toBe('urgent');
    });
});

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