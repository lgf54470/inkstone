import { describe, expect, it } from 'vitest';
import { movePresetInList, presetRange } from './date-range-popover';

describe('presetRange', () => {
    const wednesday = new Date(2026, 8, 9);

    it('today covers a single day', () => {
        expect(presetRange('today', wednesday, 1)).toEqual({ start: '2026-09-09', end: '2026-09-09' });
    });

    it('this-week aligns to the locale week start (Monday vs Sunday)', () => {
        expect(presetRange('this-week', wednesday, 1)).toEqual({ start: '2026-09-07', end: '2026-09-13' });
        expect(presetRange('this-week', wednesday, 0)).toEqual({ start: '2026-09-06', end: '2026-09-12' });
    });

    it('this-month spans the whole current month incl. month-start week days', () => {
        expect(presetRange('this-month', wednesday, 1)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(presetRange('this-month', new Date(2026, 0, 15), 1)).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    });
});

describe('movePresetInList', () => {
    const list = ['a', 'b', 'c'];

    it('swaps adjacent entries in both directions', () => {
        expect(movePresetInList(list, 0, 1)).toEqual(['b', 'a', 'c']);
        expect(movePresetInList(list, 2, -1)).toEqual(['a', 'c', 'b']);
    });

    it('is a no-op at the edges without mutating the input', () => {
        expect(movePresetInList(list, 0, -1)).toEqual(['a', 'b', 'c']);
        expect(movePresetInList(list, 2, 1)).toEqual(['a', 'b', 'c']);
        expect(list).toEqual(['a', 'b', 'c']);
    });
});