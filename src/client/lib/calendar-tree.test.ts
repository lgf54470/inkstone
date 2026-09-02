import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@shared/types';
import {
    buildVirtualTree,
    buildVirtualTreeCached,
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
    buildActivityProjectionCached,
} from './calendar-tree';
import type { CalendarNode } from './calendar-tree';
import { dateKey } from './time';

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

describe('buildActivityProjectionCached', () => {
    const asRecord = (items: NoteSummary[]): Record<string, NoteSummary> =>
        Object.fromEntries(items.map((item) => [item.id, item]));

    const naive = (notes: Record<string, NoteSummary>) => {
        const counts = new Map<string, number>();
        const noteIdByTitle = new Map<string, string>();
        const notesByDay = new Map<string, { id: string; title: string; updatedAt: number }[]>();
        for (const item of Object.values(notes)) {
            if (item.deletedAt !== null)
                continue;
            const key = dateKey(new Date(item.updatedAt));
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (!noteIdByTitle.has(item.title))
                noteIdByTitle.set(item.title, item.id);
            const list = notesByDay.get(key);
            const entry = { id: item.id, title: item.title, updatedAt: item.updatedAt };
            if (list)
                list.push(entry);
            else
                notesByDay.set(key, [entry]);
        }
        for (const list of notesByDay.values())
            list.sort((a, b) => b.updatedAt - a.updatedAt);
        return { counts, noteIdByTitle, notesByDay };
    };

    const day = (year: number, month: number, dayOfMonth: number, hour = 12): number =>
        new Date(year, month - 1, dayOfMonth, hour).getTime();
    const id = (index: number) => `note-${String(index).padStart(5, '0')}`;

    // A mulberry32 PRNG so the differential run is deterministic across runs.
    const mulberry32 = (seed: number) => {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    it('matches a fresh rebuild over a 19.8k-vault cold build', () => {
        const notes: Record<string, NoteSummary> = {};
        for (let i = 0; i < 19_800; i++) {
            const ts = day(2024 + (i % 5), 1 + (i % 12), 1 + (i % 28), 1 + (i % 23));
            notes[id(i)] = note({ id: id(i), title: `Note ${i % 9}`, updatedAt: ts, createdAt: ts });
        }
        const projection = buildActivityProjectionCached(notes);
        const expected = naive(notes);
        expect(projection.counts).toEqual(expected.counts);
        expect(projection.noteIdByTitle).toEqual(expected.noteIdByTitle);
        expect(projection.notesByDay).toEqual(expected.notesByDay);
    });

    it('returns the exact same projection for the same map identity', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 8, 1) }),
            note({ id: 'b', updatedAt: day(2026, 8, 2) }),
        ]);
        const first = buildActivityProjectionCached(map);
        expect(buildActivityProjectionCached(map)).toBe(first);
    });

    it('keeps every output identity stable when a commit touches no projection field', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 1, 10) }),
            note({ id: 'b', updatedAt: day(2026, 1, 11) }),
            note({ id: 'c', updatedAt: day(2026, 1, 12) }),
        ]);
        const first = buildActivityProjectionCached(map);
        const pinned = { ...map.a!, isPinned: true, folderId: 'f1', excerpt: 'x' };
        const second = buildActivityProjectionCached({ ...map, a: pinned });
        expect(second.counts).toBe(first.counts);
        expect(second.noteIdByTitle).toBe(first.noteIdByTitle);
        expect(second.notesByDay).toBe(first.notesByDay);
    });

    it('re-derives only the edited note slices when a same-day edit changes updatedAt', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 7, 1) }),
            note({ id: 'b', title: 'Shared', updatedAt: day(2026, 7, 2) }),
            note({ id: 'c', title: 'Shared', updatedAt: day(2026, 7, 3) }),
        ]);
        const first = buildActivityProjectionCached(map);
        const edited = { ...map.b!, excerpt: 'new', wordCount: 5, charCount: 20, updatedAt: day(2026, 7, 2, 15) };
        const second = buildActivityProjectionCached({ ...map, b: edited });
        expect(second.counts).toBe(first.counts);
        expect(second.noteIdByTitle).toBe(first.noteIdByTitle);
        // The untouched day keeps its exact array identity.
        expect(second.notesByDay.get('2026-07-01')).toBe(first.notesByDay.get('2026-07-01'));
        expect(second.notesByDay.get('2026-07-03')).toBe(first.notesByDay.get('2026-07-03'));
        // The edited day is rebuilt with the new updatedAt ordering.
        expect(second.notesByDay.get('2026-07-02')).toEqual([{ id: 'b', title: 'Shared', updatedAt: day(2026, 7, 2, 15) }]);
    });

    it('moves a note across day buckets with counts corrected and untouched days stable', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 7, 1) }),
            note({ id: 'b', updatedAt: day(2026, 7, 2) }),
            note({ id: 'c', updatedAt: day(2026, 7, 3) }),
        ]);
        const first = buildActivityProjectionCached(map);
        const moved = { ...map.b!, updatedAt: day(2026, 8, 15) };
        const second = buildActivityProjectionCached({ ...map, b: moved });
        expect(second.counts.get('2026-07-02')).toBeUndefined();
        expect(second.counts.get('2026-08-15')).toBe(1);
        expect(second.counts.get('2026-07-01')).toBe(1);
        expect(second.notesByDay.get('2026-07-02')).toBeUndefined();
        expect(second.notesByDay.get('2026-08-15')).toEqual([{ id: 'b', title: 'Note', updatedAt: day(2026, 8, 15) }]);
        expect(second.notesByDay.get('2026-07-01')).toBe(first.notesByDay.get('2026-07-01'));
        expect(second.notesByDay.get('2026-07-03')).toBe(first.notesByDay.get('2026-07-03'));
    });

    it('sorts a day list by updatedAt descending after a same-day edit', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 7, 2, 9) }),
            note({ id: 'b', updatedAt: day(2026, 7, 2, 10) }),
            note({ id: 'c', updatedAt: day(2026, 7, 2, 11) }),
        ]);
        const first = buildActivityProjectionCached(map);
        expect(first.notesByDay.get('2026-07-02')!.map((item) => item.id)).toEqual(['c', 'b', 'a']);
        const edited = { ...map.a!, updatedAt: day(2026, 7, 2, 12) };
        const second = buildActivityProjectionCached({ ...map, a: edited });
        expect(second.notesByDay.get('2026-07-02')!.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    });

    it('re-claims a vacated title slot by the next note in map order', () => {
        const map = asRecord([
            note({ id: 'a', title: 'Alpha', updatedAt: day(2026, 7, 1) }),
            note({ id: 'b', title: 'Alpha', updatedAt: day(2026, 7, 2) }),
            note({ id: 'c', title: 'Other', updatedAt: day(2026, 7, 3) }),
        ]);
        const first = buildActivityProjectionCached(map);
        expect(first.noteIdByTitle.get('Alpha')).toBe('a');
        // The owner changes title; note b (later in map order) takes over.
        const renamed = { ...map.a!, title: 'Beta' };
        const second = buildActivityProjectionCached({ ...map, a: renamed });
        expect(second.noteIdByTitle.get('Alpha')).toBe('b');
        expect(second.noteIdByTitle.get('Beta')).toBe('a');
        // Renaming a non-owner leaves the slot untouched.
        const third = buildActivityProjectionCached({ ...map, b: { ...map.b!, title: 'Gamma' } });
        expect(third.noteIdByTitle.get('Alpha')).toBe('a');
        // A late map-order note sharing a title never steals the slot.
        const fourth = buildActivityProjectionCached({ ...map, c: { ...map.c!, title: 'Alpha' } });
        expect(fourth.noteIdByTitle.get('Alpha')).toBe('a');
    });

    it('drops and restores a tombstoned note across every slice', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 7, 1) }),
            note({ id: 'b', title: 'Unique', updatedAt: day(2026, 7, 2) }),
        ]);
        const first = buildActivityProjectionCached(map);
        const trashed = { ...map.b!, deletedAt: day(2026, 9, 1) };
        const second = buildActivityProjectionCached({ ...map, b: trashed });
        expect(second.counts.get('2026-07-02')).toBeUndefined();
        expect(second.notesByDay.get('2026-07-02')).toBeUndefined();
        expect(second.noteIdByTitle.get('Unique')).toBeUndefined();
        expect(second.notesByDay.get('2026-07-01')).toBe(first.notesByDay.get('2026-07-01'));
        // Reviving re-adds the note everywhere with its new timeline position.
        const revived = { ...map.b!, deletedAt: null, updatedAt: day(2026, 7, 2, 8) };
        const third = buildActivityProjectionCached({ ...map, b: revived });
        expect(third.counts.get('2026-07-02')).toBe(1);
        expect(third.noteIdByTitle.get('Unique')).toBe('b');
        expect(third.notesByDay.get('2026-07-02')).toEqual([{ id: 'b', title: 'Unique', updatedAt: day(2026, 7, 2, 8) }]);
    });

    it('sweeps an id that vanishes from the map without a tombstone', () => {
        const map = asRecord([
            note({ id: 'a', updatedAt: day(2026, 7, 1) }),
            note({ id: 'b', title: 'Gone', updatedAt: day(2026, 7, 2) }),
        ]);
        buildActivityProjectionCached(map);
        const { b: _removed, ...shrunk } = map;
        const second = buildActivityProjectionCached(shrunk);
        expect(second.counts.get('2026-07-02')).toBeUndefined();
        expect(second.noteIdByTitle.get('Gone')).toBeUndefined();
        expect(second.notesByDay.get('2026-07-02')).toBeUndefined();
        expect(second.notesByDay.get('2026-07-01')).toEqual([{ id: 'a', title: 'Note', updatedAt: day(2026, 7, 1) }]);
        void _removed;
    });

    it('stays equal to the naive rebuild through a seeded random op sequence', () => {
        const rand = mulberry32(20260902);
        const titles = ['Shared', 'Untitled', 'Diary', 'Project', 'Scratch'];
        const notes: Record<string, NoteSummary> = {};
        for (let i = 0; i < 5_000; i++) {
            const ts = day(2025 + (i % 3), 1 + (i % 12), 1 + (i % 28), 1 + (i % 23));
            notes[id(i)] = note({ id: id(i), title: titles[i % titles.length]!, updatedAt: ts, createdAt: ts });
        }
        let next = notes;
        for (let step = 0; step < 80; step++) {
            const op = rand();
            const target = id(Math.floor(rand() * 5_500));
            const current = next[target];
            let updated: NoteSummary | null = null;
            let added: NoteSummary | null = null;
            if (!current) {
                // A missing target acts as a brand-new note.
                const ts = day(2024 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
                added = note({ id: target, title: titles[Math.floor(rand() * titles.length)]!, updatedAt: ts, createdAt: ts });
            } else if (op < 0.35) {
                updated = { ...current, updatedAt: day(2024 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)) };
            } else if (op < 0.5) {
                updated = { ...current, title: titles[Math.floor(rand() * titles.length)]! };
            } else if (op < 0.65) {
                updated = { ...current, deletedAt: day(2026, 9, 1), updatedAt: day(2026, 9, 1) };
            } else if (op < 0.75) {
                updated = { ...current, deletedAt: null, updatedAt: day(2024 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)) };
            } else if (op < 0.85) {
                const ts = day(2024 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
                added = note({ id: id(5_500 + step), title: titles[Math.floor(rand() * titles.length)]!, updatedAt: ts, createdAt: ts });
            } else if (op < 0.95) {
                updated = { ...current, isPinned: true, excerpt: `excerpt ${step}` };
            } else {
                const { [target]: gone, ...rest } = next;
                next = rest;
                void gone;
            }
            if (updated)
                next = { ...next, [target]: updated };
            if (added)
                next = { ...next, [added.id]: added };
            const projection = buildActivityProjectionCached(next);
            const expected = naive(next);
            expect(projection.counts).toEqual(expected.counts);
            expect(projection.noteIdByTitle).toEqual(expected.noteIdByTitle);
            // Same-millisecond ties have no consumable order (the UI only
            // reads id/title), and only the order of equal timestamps can
            // diverge: the naive rebuild follows map insertion while the
            // incremental re-appends notes that left and re-entered a day.
            // Compare with a canonical (updatedAt, id) sort instead.
            const normalize = (byDay: Map<string, { id: string; title: string; updatedAt: number }[]>): Map<string, string[]> => {
                const out = new Map<string, string[]>();
                for (const [dayKey, list] of byDay) {
                    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
                    out.set(dayKey, sorted.map((item) => `${item.updatedAt}|${item.id}|${item.title}`));
                }
                return out;
            };
            expect(normalize(projection.notesByDay)).toEqual(normalize(expected.notesByDay));
        }
    });
});