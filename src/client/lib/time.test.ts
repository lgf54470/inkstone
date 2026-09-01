import { describe, expect, it } from 'vitest';
import { dateKey, parseDateKey } from './time';

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