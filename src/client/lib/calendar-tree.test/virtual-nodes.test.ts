import { describe, expect, it } from 'vitest';
import {
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
} from '../calendar-tree';
import { note } from './helpers';

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
