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

import { act, createElement } from 'react';
import { DateRangePopover } from './date-range-popover';
import { renderElement } from '../lib/test-render';

describe('DateRangePopover render contract', () => {
    it('opens the preset editor and keeps the reorder buttons disabled at the edges', () => {
        const anchor = { current: document.createElement('button') } as React.RefObject<HTMLButtonElement | null>;
        const { unmount } = renderElement(createElement(DateRangePopover, {
            anchor,
            open: true,
            onClose: () => {},
            range: null,
            onChange: () => {},
            relative: null,
            onApplyRelative: () => {},
        }));
        const dialog = document.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        const group = dialog!.querySelector('[aria-label="notes.range_preset_group"]');
        expect(group).not.toBeNull();
        // Three fixed pills + two default custom presets + the pencil button.
        expect(group!.querySelectorAll('button')).toHaveLength(6);
        act(() => { (group!.querySelector('[aria-label="notes.range_preset_edit"]') as HTMLButtonElement).click(); });
        const rows = [...dialog!.querySelectorAll('[draggable="true"]')];
        expect(rows).toHaveLength(2);
        const firstUp = rows[0]!.querySelector('[aria-label="notes.range_preset_move_up"]') as HTMLButtonElement;
        const firstDown = rows[0]!.querySelector('[aria-label="notes.range_preset_move_down"]') as HTMLButtonElement;
        const secondUp = rows[1]!.querySelector('[aria-label="notes.range_preset_move_up"]') as HTMLButtonElement;
        const secondDown = rows[1]!.querySelector('[aria-label="notes.range_preset_move_down"]') as HTMLButtonElement;
        expect(firstUp.disabled).toBe(true);
        expect(firstDown.disabled).toBe(false);
        expect(secondUp.disabled).toBe(false);
        expect(secondDown.disabled).toBe(true);
        act(() => { secondUp.click(); });
        const after = [...dialog!.querySelectorAll('[draggable="true"]')];
        expect(after[0]!.textContent).toBe(rows[1]!.textContent);
        expect(after[1]!.textContent).toBe(rows[0]!.textContent);
        unmount();
    });
});