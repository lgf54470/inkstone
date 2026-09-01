import { describe, expect, it } from 'vitest';
import { buildStripWeeks } from './activity-calendar';

describe('buildStripWeeks', () => {
    it('builds a single aligned week when the range fits exactly', () => {
        const weeks = buildStripWeeks(new Map([
            ['2026-09-02', 3],
            ['2026-09-06', 1],
        ]), {
            range: { start: new Date(2026, 7, 31), end: new Date(2026, 8, 6) },
            weekStart: 1,
            todayKey: '2026-09-02',
        });
        expect(weeks).toHaveLength(1);
        expect(weeks[0]!.map((cell) => cell.key)).toEqual([
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
            '2026-09-04',
            '2026-09-05',
            '2026-09-06',
        ]);
        expect(weeks[0]![2]!.count).toBe(3);
        expect(weeks[0]![2]!.today).toBe(true);
        expect(weeks[0]![6]!.count).toBe(1);
    });

    it('aligns a mid-week range start backwards to the preceding week start', () => {
        const weeks = buildStripWeeks(new Map(), {
            range: { start: new Date(2026, 8, 3), end: new Date(2026, 8, 8) },
            weekStart: 1,
            todayKey: '2026-09-02',
        });
        expect(weeks).toHaveLength(2);
        expect(weeks[0]![0]!.key).toBe('2026-08-31');
        expect(weeks[1]![0]!.key).toBe('2026-09-07');
    });

    it('scales heat levels against the busiest day in range', () => {
        const weeks = buildStripWeeks(new Map([
            ['2026-09-02', 3],
            ['2026-09-03', 2],
            ['2026-09-04', 1],
        ]), {
            range: { start: new Date(2026, 7, 31), end: new Date(2026, 8, 6) },
            weekStart: 1,
            todayKey: '2026-09-02',
        });
        const [week] = weeks;
        expect(week![2]!.level).toBe(4);
        expect(week![3]!.level).toBe(3);
        expect(week![4]!.level).toBe(1);
        expect(week![0]!.level).toBe(0);
    });

    it('defaults to the most recent 16 weeks when no range is given', () => {
        const weeks = buildStripWeeks(new Map(), {
            now: new Date(2026, 8, 2),
            weekStart: 1,
            todayKey: '2026-09-02',
        });
        expect(weeks).toHaveLength(16);
        expect(weeks[15]![0]!.key).toBe('2026-08-31');
        expect(weeks[15]![2]!.key).toBe('2026-09-02');
    });

    it('resolves diary ids, per-day note lists, and the selected day', () => {
        const notes = new Map([
            ['2026-09-02', [
                { id: 'n1', title: 'Note 1' },
                { id: 'n2', title: 'Note 2' },
            ]],
        ]);
        const weeks = buildStripWeeks(new Map([['2026-09-02', 2]]), {
            range: { start: new Date(2026, 7, 31), end: new Date(2026, 8, 6) },
            weekStart: 1,
            todayKey: '2026-09-02',
            selectedKey: '2026-09-02',
            getDiaryId: (key) => (key === '2026-09-02' ? 'd9' : null),
            notesByDay: notes,
        });
        expect(weeks[0]![2]!.diaryId).toBe('d9');
        expect(weeks[0]![2]!.selected).toBe(true);
        expect(weeks[0]![3]!.selected).toBe(false);
        expect(weeks[0]![2]!.notes.map((item) => item.id)).toEqual(['n1', 'n2']);
    });
});