import { describe, expect, it, vi } from 'vitest';
import { UNDO_FOCUS_STORAGE_KEY, setUndoToastFocus, useUndoToastFocus } from './undo-focus-pref';
import { act, createElement } from 'react';
import { renderElement } from './test-render';

describe('undo-toast focus preference', () => {
    it('defaults to enabled and persists an explicit off', () => {
        localStorage.clear();
        let value: boolean | null = null;
        function Probe() {
            value = useUndoToastFocus();
            return null;
        }
        const { unmount } = renderElement(createElement(Probe));
        expect(value).toBe(true);
        act(() => { setUndoToastFocus(false); });
        expect(value).toBe(false);
        expect(localStorage.getItem(UNDO_FOCUS_STORAGE_KEY)).toBe('off');
        unmount();
    });

    it('remembers an explicit on and recovers legacy stored values', async () => {
        const read = async (raw: string | null): Promise<boolean | null> => {
            if (raw === null)
                localStorage.removeItem(UNDO_FOCUS_STORAGE_KEY);
            else
                localStorage.setItem(UNDO_FOCUS_STORAGE_KEY, raw);
            vi.resetModules();
            const mod = await import('./undo-focus-pref');
            localStorage.removeItem(UNDO_FOCUS_STORAGE_KEY);
            let value: boolean | null = null;
            function Probe() {
                value = mod.useUndoToastFocus();
                return null;
            }
            const { unmount } = renderElement(createElement(Probe));
            unmount();
            return value;
        };
        expect(await read('on')).toBe(true);
        expect(await read('off')).toBe(false);
        expect(await read(null)).toBe(true);
    });
});