import { describe, expect, it } from 'vitest';
import { buildStripWeeks, monthRangeToKeys } from './activity-calendar';

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
            selectedRange: { start: '2026-09-02', end: '2026-09-04' },
            getDiaryId: (key) => (key === '2026-09-02' ? 'd9' : null),
            notesByDay: notes,
        });
        expect(weeks[0]![2]!.diaryId).toBe('d9');
        expect(weeks[0]![2]!.selected).toBe(true);
        expect(weeks[0]![3]!.selected).toBe(true);
        expect(weeks[0]![4]!.selected).toBe(true);
        expect(weeks[0]![5]!.selected).toBe(false);
        expect(weeks[0]![2]!.notes.map((item) => item.id)).toEqual(['n1', 'n2']);
    });

    it('turns an inclusive month range into day keys covering whole months', () => {
        expect(monthRangeToKeys(2026, 8, 8)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(monthRangeToKeys(2026, 7, 8)).toEqual({ start: '2026-08-01', end: '2026-09-30' });
        expect(monthRangeToKeys(2026, 0, 11)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
        expect(monthRangeToKeys(2026, 11, 11)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    });

    it('normalizes reversed month ranges and leap-year February', () => {
        expect(monthRangeToKeys(2024, 11, 0)).toEqual({ start: '2024-01-01', end: '2024-12-31' });
        expect(monthRangeToKeys(2024, 1, 1)).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    });
});

import { act, createElement, useState } from 'react';
import { ActivityCalendar } from './activity-calendar';
import { renderElement } from '../lib/test-render';

// jsdom has no layout engine, so these guards assert the anti-wrap CSS contract
// (whitespace-nowrap + truncate) instead of pixel measurement.
function renderCalendar(): { container: HTMLElement; unmount: () => void } {
    function Harness() {
        const [view, setView] = useState<'month' | 'weeks' | 'year'>('month');
        return createElement('div', { style: { width: 196 } }, createElement(ActivityCalendar, {
            counts: new Map(),
            locale: 'en-US',
            weekStart: 1,
            today: new Date(2026, 8, 2),
            view,
            onViewChange: setView,
            cursor: { year: 2026, month: 8 },
            onCursorChange: () => {},
            onDayClick: () => {},
            onDaySelect: () => {},
            onRangeSelect: () => {},
            onGapDayClick: () => {},
            onNoteClick: () => {},
            getDiaryId: () => null,
        }));
    }
    return renderElement(createElement(Harness));
}

describe('view toggle wrapping contract', () => {
    it('keeps the toggle buttons single-line inside the 196px sidebar budget', () => {
        const { container } = renderCalendar();
        const group = container.querySelector('[aria-label="sidebar.calendar_view"]');
        expect(group).not.toBeNull();
        expect(group!.classList.contains('overflow-hidden')).toBe(true);
        const buttons = [...group!.querySelectorAll('button')];
        expect(buttons).toHaveLength(3);
        for (const button of buttons) {
            expect(button.classList.contains('whitespace-nowrap')).toBe(true);
            expect(button.classList.contains('min-w-0')).toBe(true);
            expect(button.textContent).not.toContain('\n');
            expect(button.querySelector('span.truncate')).not.toBeNull();
        }
        container.remove();
    });

    it('renders the year grid with a weekday strip, clickable columns, and the measured column count', () => {
        const { container, unmount } = renderCalendar();
        const toggle = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="sidebar.calendar_view"] button')];
        act(() => { toggle[2]!.click(); });
        const grid = container.querySelector('[aria-label="sidebar.calendar_year_grid_aria"]');
        expect(grid).not.toBeNull();
        expect(grid!.classList.contains('grid-cols-3')).toBe(true);
        const cards = [...grid!.querySelectorAll('[data-month-card]')];
        expect(cards).toHaveLength(12);
        for (const card of cards) {
            const weekdayColumns = [...card.querySelectorAll('button[aria-label^="sidebar.calendar_year_weekday"]')];
            // One seven-column row of clickable weekday labels above the heat cells.
            expect(weekdayColumns).toHaveLength(7);
            expect(card.querySelector('[data-month]')!.classList.contains('grid-cols-7')).toBe(true);
        }
        unmount();
    });

    it('moves the year focus by the measured column count (ArrowUp/Down)', () => {
        const { container, unmount } = renderCalendar();
        const toggle = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="sidebar.calendar_view"] button')];
        act(() => { toggle[2]!.click(); });
        const september = container.querySelector('[data-month="8"]');
        expect(september).not.toBeNull();
        (september as HTMLElement).focus();
        act(() => {
            september!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        });
        expect(document.activeElement?.getAttribute('data-month')).toBe('11');
        act(() => {
            document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        });
        expect(document.activeElement?.getAttribute('data-month')).toBe('8');
        unmount();
    });

    it('walks the focused card\'s weekday columns with arrows and returns to the card', () => {
        const { container, unmount } = renderCalendar();
        const toggle = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="sidebar.calendar_view"] button')];
        act(() => { toggle[2]!.click(); });
        const september = container.querySelector('[data-month="8"]') as HTMLElement;
        september.focus();
        act(() => { september.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
        expect(document.activeElement?.getAttribute('data-weekday')).toBe('0');
        act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
        act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
        expect(document.activeElement?.getAttribute('data-weekday')).toBe('2');
        expect(document.activeElement?.closest('[data-month-card]')?.getAttribute('data-month-card')).toBe('8');
        act(() => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
        expect(document.activeElement?.getAttribute('data-month')).toBe('8');
        unmount();
    });

    it('respects a fixed columns preference over the measured width', () => {
        const { container, unmount } = renderElement(createElement('div', { style: { width: 196 } }, createElement(ActivityCalendar, {
            counts: new Map(),
            locale: 'en-US',
            weekStart: 1,
            today: new Date(2026, 8, 2),
            view: 'year',
            onViewChange: () => {},
            cursor: { year: 2026, month: 8 },
            onCursorChange: () => {},
            onDayClick: () => {},
            onDaySelect: () => {},
            onRangeSelect: () => {},
            onGapDayClick: () => {},
            onNoteClick: () => {},
            getDiaryId: () => null,
            columnsPreference: '4',
        })));
        const grid = container.querySelector('[aria-label="sidebar.calendar_year_grid_aria"]');
        expect(grid!.classList.contains('grid-cols-4')).toBe(true);
        unmount();
    });

    it('filters the week of the first tapped weekday and jumps to that month', () => {
        const ranges: string[][] = [];
        const cursors: { year: number; month: number }[] = [];
        const views: string[] = [];
        function Harness() {
            const [view, setView] = useState<'month' | 'weeks' | 'year'>('year');
            return createElement('div', null, createElement(ActivityCalendar, {
                counts: new Map(),
                locale: 'en-US',
                weekStart: 1,
                today: new Date(2026, 8, 2),
                view,
                onViewChange: (next) => { views.push(next); setView(next); },
                cursor: { year: 2026, month: 8 },
                onCursorChange: (next) => { cursors.push(next); },
                onDayClick: () => {},
                onDaySelect: () => {},
                onRangeSelect: (start, end) => { ranges.push([start, end]); },
                onGapDayClick: () => {},
                onNoteClick: () => {},
                getDiaryId: () => null,
            }));
        }
        const { container, unmount } = renderElement(createElement(Harness));
        // 2026-09 has the first Monday on the 7th: column 0 (Mon) filters 09-07..09-13.
        const monday = container.querySelector('[data-month-card="8"] button[aria-label^="sidebar.calendar_year_weekday"]');
        expect(monday).not.toBeNull();
        act(() => { (monday as HTMLButtonElement).click(); });
        expect(ranges).toEqual([['2026-09-07', '2026-09-13']]);
        expect(cursors).toEqual([{ year: 2026, month: 8 }]);
        expect(views).toEqual(['month']);
        unmount();
    });
});

describe('jump flash transition', () => {
    it('fades the month grid in with an accent ring when an external jump arrives', () => {
        interface Captured {
            keyframes: Keyframe[];
            duration?: number;
        }
        const captured: Captured[] = [];
        const original = Element.prototype.animate;
        Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options?: KeyframeAnimationOptions) {
            captured.push({ keyframes: [...keyframes], duration: typeof options?.duration === 'number' ? options.duration : undefined });
            return { cancel: () => {}, finished: Promise.resolve(), play: () => {}, pause: () => {} } as unknown as Animation;
        };
        try {
            let bumpFlash = () => {};
            function Harness() {
                const [flash, setFlash] = useState(0);
                bumpFlash = () => setFlash((value) => value + 1);
                return createElement('div', null, createElement(ActivityCalendar, {
                    counts: new Map(),
                    locale: 'en-US',
                    weekStart: 1,
                    today: new Date(2026, 8, 2),
                    view: 'month',
                    onViewChange: () => {},
                    cursor: { year: 2026, month: 8 },
                    onCursorChange: () => {},
                    onDayClick: () => {},
                    onDaySelect: () => {},
                    onRangeSelect: () => {},
                    onGapDayClick: () => {},
                    onNoteClick: () => {},
                    getDiaryId: () => null,
                    jumpFlash: flash,
                }));
            }
            const { unmount } = renderElement(createElement(Harness));
            expect(captured).toHaveLength(0);
            act(() => { bumpFlash(); });
            expect(captured).toHaveLength(1);
            expect(captured[0]!.duration).toBe(1100);
            expect(captured[0]!.keyframes[0]!.boxShadow).toContain('var(--accent)');
            expect(captured[0]!.keyframes[1]!.boxShadow).toContain('rgba(0, 0, 0, 0)');
            unmount();
        }
        finally {
            Element.prototype.animate = original;
        }
    });
});
