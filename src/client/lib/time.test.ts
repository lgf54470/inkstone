import { describe, expect, it } from 'vitest';
import { addDaysKey, dateKey, daysBetweenKeys, isWeekRangeKey, parseDateKey, rollingWindowKey, weekStartKeyOf } from './time';

describe('dateKey', () => {
    it('formats local dates as zero-padded YYYY-MM-DD keys', () => {
        expect(dateKey(new Date(2026, 8, 2))).toBe('2026-09-02');
        expect(dateKey(new Date(2026, 0, 9))).toBe('2026-01-09');
        expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    });

    it('round-trips through parseDateKey', () => {
        const parsed = parseDateKey('2026-02-14');
        expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual([2026, 1, 14]);
        expect(dateKey(parsed)).toBe('2026-02-14');
    });
});

describe('addDaysKey', () => {
    it('crosses month and year boundaries', () => {
        expect(addDaysKey('2026-09-30', 1)).toBe('2026-10-01');
        expect(addDaysKey('2026-01-01', -1)).toBe('2025-12-31');
        expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDaysKey('2024-03-01', -1)).toBe('2024-02-29');
    });
});

describe('rollingWindowKey', () => {
    it('builds an inclusive window ending at the anchor', () => {
        expect(rollingWindowKey(7, '2026-09-09')).toEqual({ start: '2026-09-03', end: '2026-09-09' });
        expect(rollingWindowKey(1, '2026-09-09')).toEqual({ start: '2026-09-09', end: '2026-09-09' });
        expect(rollingWindowKey(30, '2026-09-09')).toEqual({ start: '2026-08-11', end: '2026-09-09' });
    });
});

describe('daysBetweenKeys', () => {
    it('counts whole days across month boundaries using UTC math', () => {
        expect(daysBetweenKeys('2026-09-09', '2026-09-03')).toBe(-6);
        expect(daysBetweenKeys('2026-08-01', '2026-09-01')).toBe(31);
        expect(daysBetweenKeys('2025-12-31', '2026-01-01')).toBe(1);
        expect(daysBetweenKeys('2026-09-09', '2026-09-09')).toBe(0);
    });
});

describe('week keys', () => {
    it('aligns a key to its week start for both weekStart modes', () => {
        expect(weekStartKeyOf('2026-09-09', 1)).toBe('2026-09-07');
        expect(weekStartKeyOf('2026-09-09', 0)).toBe('2026-09-06');
        expect(weekStartKeyOf('2026-09-07', 1)).toBe('2026-09-07');
    });

    it('recognizes exactly-aligned week ranges', () => {
        expect(isWeekRangeKey('2026-09-07', '2026-09-13', 1)).toBe(true);
        expect(isWeekRangeKey('2026-09-06', '2026-09-12', 0)).toBe(true);
        expect(isWeekRangeKey('2026-09-08', '2026-09-13', 1)).toBe(false);
        expect(isWeekRangeKey('2026-09-07', '2026-09-12', 1)).toBe(false);
        expect(isWeekRangeKey('2026-09-07', '2026-09-13', 0)).toBe(false);
    });
});