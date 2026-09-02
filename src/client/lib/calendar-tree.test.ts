import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '@shared/types';
import {
    buildCalendarTree,
    calendarAncestorIds,
    calendarId,
    calendarPathSegments,
    calendarNearestNeighbors,
    calendarPeriodForIsoWeek,
    calendarPeriodKeyRange,
    calendarPeriodLabel,
    calendarPeriodMatchesNote,
    calendarPeriodsForDate,
    isCalendarFolderId,
    parseCalendarId,
    parseCalendarJumpQuery,
} from './calendar-tree';

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

describe('isCalendarFolderId', () => {
    it('recognizes the root and prefixed ids only', () => {
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
});

describe('parseCalendarId', () => {
    it('round-trips generated ids', () => {
        const ids = [
            'cal',
            'cal:2026',
            'cal:2026:q2',
            'cal:2026:q2:06',
            'cal:2026:q2:06:w25',
        ];
        for (const id of ids) {
            expect(calendarId(parseCalendarId(id)!) ).toBe(id);
        }
    });

    it('rejects malformed ids', () => {
        for (const id of [null, undefined, '', 'calx', 'cal:abcd', 'cal:26', 'cal:2026:q5', 'cal:2026:q1:13', 'cal:2026:q1:00', 'cal:2026:q1:01:w00', 'cal:2026:q1:01:w54', 'cal:2026:q1:01:w36:extra']) {
            expect(parseCalendarId(id)).toBeNull();
        }
    });

    it('parses every level', () => {
        expect(parseCalendarId('cal')).toEqual({ kind: 'root' });
        expect(parseCalendarId('cal:2026')).toEqual({ kind: 'year', year: 2026 });
        expect(parseCalendarId('cal:2026:q3')).toEqual({ kind: 'quarter', year: 2026, quarter: 3 });
        expect(parseCalendarId('cal:2026:q3:09')).toEqual({ kind: 'month', year: 2026, month: 9 });
        expect(parseCalendarId('cal:2026:q3:09:w36')).toEqual({ kind: 'week', year: 2026, month: 9, week: 36 });
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

describe('calendarPathSegments', () => {
    it('returns the display path without the root', () => {
        expect(calendarPathSegments('cal')).toBeNull();
        expect(calendarPathSegments('cal:2026')).toEqual(['2026']);
        expect(calendarPathSegments('cal:2026:q3')).toEqual(['2026', 'Q3']);
        expect(calendarPathSegments('cal:2026:q3:09')).toEqual(['2026', 'Q3', '09']);
        expect(calendarPathSegments('cal:2026:q3:09:w36')).toEqual(['2026', 'Q3', '09', 'ww36']);
        expect(calendarPathSegments(null)).toBeNull();
    });
});

describe('calendarNearestNeighbors', () => {
    const notes = [
        note({ id: 'a', createdAt: new Date(2025, 1, 10, 10).getTime() }),
        note({ id: 'b', createdAt: new Date(2025, 4, 20, 10).getTime() }),
        note({ id: 'c', createdAt: new Date(2026, 7, 5, 10).getTime() }),
        note({ id: 'd', createdAt: new Date(2024, 0, 15, 10).getTime() }),
    ];

    it('finds the nearest months with notes on both sides', () => {
        const { prev, next } = calendarNearestNeighbors({ kind: 'month', year: 2025, month: 3 }, notes);
        expect(prev?.id).toBe('cal:2025:q1:02');
        expect(prev?.count).toBe(1);
        expect(next?.id).toBe('cal:2025:q2:05');
        expect(next?.count).toBe(1);
    });

    it('crosses year boundaries', () => {
        const { prev, next } = calendarNearestNeighbors({ kind: 'month', year: 2025, month: 4 }, notes);
        expect(prev?.id).toBe('cal:2025:q1:02');
        expect(next?.id).toBe('cal:2025:q2:05');
        const { prev: farPrev, next: farNext } = calendarNearestNeighbors({ kind: 'month', year: 2023, month: 6 }, notes);
        expect(farPrev).toBeNull();
        expect(farNext?.id).toBe('cal:2024:q1:01');
    });

    it('works at the year, quarter, and week levels', () => {
        const years = calendarNearestNeighbors({ kind: 'year', year: 2025 }, notes);
        expect(years.prev?.id).toBe('cal:2024');
        expect(years.next?.id).toBe('cal:2026');
        const quarters = calendarNearestNeighbors({ kind: 'quarter', year: 2025, quarter: 3 }, notes);
        expect(quarters.prev?.id).toBe('cal:2025:q2');
        expect(quarters.next?.id).toBe('cal:2026:q3');
        const weeks = calendarNearestNeighbors({ kind: 'week', year: 2026, month: 9, week: 36 }, notes);
        expect(weeks.prev?.id).toBe('cal:2026:q3:08:w32');
        expect(weeks.next).toBeNull();
    });

    it('returns nulls when no notes exist', () => {
        const { prev, next } = calendarNearestNeighbors({ kind: 'year', year: 2025 }, []);
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

describe('calendarPeriodKeyRange', () => {
    it('returns inclusive date-key ranges per node', () => {
        expect(calendarPeriodKeyRange('cal')).toBeNull();
        expect(calendarPeriodKeyRange('cal:2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
        expect(calendarPeriodKeyRange('cal:2026:q3')).toEqual({ start: '2026-07-01', end: '2026-09-30' });
        expect(calendarPeriodKeyRange('cal:2026:q4')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
        expect(calendarPeriodKeyRange('cal:2026:q1:02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
        expect(calendarPeriodKeyRange('cal:2024:q1:02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
        expect(calendarPeriodKeyRange('cal:2026:q3:09')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(calendarPeriodKeyRange('cal:2026:q3:09:w36')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
        expect(calendarPeriodKeyRange(null)).toBeNull();
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

describe('calendarAncestorIds', () => {
    it('returns the ancestor chain without the node itself', () => {
        expect(calendarAncestorIds('cal:2026:q3:09:w36')).toEqual(['cal:2026', 'cal:2026:q3', 'cal:2026:q3:09']);
        expect(calendarAncestorIds('cal:2026')).toEqual([]);
        expect(calendarAncestorIds('cal')).toEqual([]);
        expect(calendarAncestorIds('nope')).toEqual([]);
    });
});

describe('buildCalendarTree', () => {
    it('builds year → quarter → month → week only for periods with notes', () => {
        const sept1 = note({ id: 'a', createdAt: new Date(2026, 8, 1, 10).getTime() });
        const sept2 = note({ id: 'b', createdAt: new Date(2026, 8, 2, 10).getTime() });
        const july = note({ id: 'c', createdAt: new Date(2026, 6, 15, 10).getTime() });
        const jan2025 = note({ id: 'd', createdAt: new Date(2025, 0, 2, 10).getTime() });
        const deleted = note({ id: 'e', createdAt: new Date(2026, 8, 3, 10).getTime(), deletedAt: 1 });
        const tree = buildCalendarTree([sept1, sept2, july, jan2025, deleted]);
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
        expect(buildCalendarTree([])).toEqual([]);
        expect(buildCalendarTree([note({ deletedAt: 1 })])).toEqual([]);
    });

    it('fills the year/quarter/month skeleton with zero counts when includeEmpty', () => {
        const aug = note({ id: 'a', createdAt: new Date(2026, 7, 5, 10).getTime() });
        const tree = buildCalendarTree([aug], true);
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
        const full = buildCalendarTree([a, b], true);
        expect(full.map((y) => y.name)).toEqual(['2025', '2026', '2027']);
        expect(full[1]!.count).toBe(0);
        expect(full[1]!.children.length).toBe(4);
        const sparse = buildCalendarTree([a, b], false);
        expect(sparse.map((y) => y.name)).toEqual(['2025', '2027']);
        expect(buildCalendarTree([], true)).toEqual([]);
        expect(buildCalendarTree([note({ deletedAt: 1 })], true)).toEqual([]);
    });
});