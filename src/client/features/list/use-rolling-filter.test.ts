import { describe, expect, it } from 'vitest';
import { rollingWindowKey } from '../../lib/time';
import { computeLatestEditKey, gapPeekRange, latestEditOutsideWindow, relativeAnchorKey } from './use-rolling-filter';

describe('computeLatestEditKey', () => {
    const stamp = (iso: string) => new Date(iso).getTime();
    const note = (updatedAt: number, deletedAt: number | null = null) => ({ updatedAt, deletedAt });

    it('is null when there are no notes', () => {
        expect(computeLatestEditKey({})).toBeNull();
    });

    it('tracks the newest edit and skips deleted notes', () => {
        const notes = {
            a: note(stamp('2026-09-01T10:00:00.000Z')),
            b: note(stamp('2026-09-03T08:00:00.000Z')),
            c: note(stamp('2026-09-02T12:00:00.000Z'), stamp('2026-09-02T13:00:00.000Z')),
            d: note(stamp('2026-09-02T15:00:00.000Z')),
        };
        expect(computeLatestEditKey(notes)).toBe('2026-09-03');
    });

    it('ignores only-deleted collections', () => {
        expect(computeLatestEditKey({ a: note(stamp('2026-09-01T10:00:00.000Z'), stamp('2026-09-01T11:00:00.000Z')) })).toBeNull();
    });
});

describe('relativeAnchorKey', () => {
    it('is null when the filter is not rolling', () => {
        expect(relativeAnchorKey(null, '2026-09-02', '2026-09-05')).toBeNull();
    });

    it('follows the newest edit for the follow-edit direction (zero-latency anchor)', () => {
        expect(relativeAnchorKey({ days: 7, direction: 'edit' }, '2026-09-02', '2026-09-05')).toBe('2026-09-02');
    });

    it('falls back to the calendar today when no note exists yet', () => {
        expect(relativeAnchorKey({ days: 7, direction: 'edit' }, null, '2026-09-05')).toBe('2026-09-05');
    });

    it('anchors at the calendar today for the today direction when edits are not newer', () => {
        expect(relativeAnchorKey({ days: 7, direction: 'today' }, '2026-09-02', '2026-09-05')).toBe('2026-09-05');
    });

    it('lets the newest edit pull the today-direction anchor forward (window end = now, advances with the save stream)', () => {
        expect(relativeAnchorKey({ days: 7, direction: 'today' }, '2026-09-08', '2026-09-05')).toBe('2026-09-08');
        expect(relativeAnchorKey({ days: 7, direction: 'today' }, null, '2026-09-05')).toBe('2026-09-05');
    });

    it('materializes the whole window at the ahead edit: the end follows the save stream, not the natural day', () => {
        const anchor = relativeAnchorKey({ days: 10, direction: 'today' }, '2026-09-08', '2026-09-05');
        const window = rollingWindowKey(10, anchor!);
        expect(window).toEqual({ start: '2026-08-30', end: '2026-09-08' });
        expect(window.end).toBe('2026-09-08');
    });
});

describe('latestEditOutsideWindow', () => {
    const window = { start: '2026-08-24', end: '2026-09-02' };

    it('is null when the newest edit is inside the window or inputs are empty', () => {
        expect(latestEditOutsideWindow(window, '2026-08-30')).toBeNull();
        expect(latestEditOutsideWindow(window, '2026-08-24')).toBeNull();
        expect(latestEditOutsideWindow(window, '2026-09-02')).toBeNull();
        expect(latestEditOutsideWindow(window, null)).toBeNull();
        expect(latestEditOutsideWindow(null, '2026-08-01')).toBeNull();
    });

    it('flags an edit that lags before the window start with its day count', () => {
        expect(latestEditOutsideWindow(window, '2026-08-12')).toEqual({ key: '2026-08-12', days: 12, ahead: false });
    });

    it('flags an edit ahead of the window end (clock skew / restored sync) with its day count', () => {
        expect(latestEditOutsideWindow(window, '2026-09-08')).toEqual({ key: '2026-09-08', days: 6, ahead: true });
    });
});

describe('gapPeekRange', () => {
    const window = { start: '2026-08-24', end: '2026-09-02' };

    it('spans the current window plus the whole lagging gap', () => {
        expect(gapPeekRange(window, '2026-08-12')).toEqual({ start: '2026-08-12', end: '2026-09-02' });
    });

    it('keeps the start and pulls the end toward an ahead edit', () => {
        expect(gapPeekRange(window, '2026-09-08')).toEqual({ start: '2026-08-24', end: '2026-09-08' });
    });

    it('is null when the edit is inside or inputs are empty', () => {
        expect(gapPeekRange(window, '2026-08-30')).toBeNull();
        expect(gapPeekRange(null, '2026-08-12')).toBeNull();
        expect(gapPeekRange(window, null)).toBeNull();
    });
});