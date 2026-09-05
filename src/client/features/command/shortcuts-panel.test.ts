import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { installTestGlobals, renderElement } from '../../lib/test-render';
import { register } from '../../lib/hotkeys';
import { ShortcutsPanel } from './shortcuts-panel';

installTestGlobals();

describe('ShortcutsPanel keyboard roaming', () => {
    it('moves the highlight with arrows and activates the highlighted row with Enter', () => {
        const onClose = vi.fn();
        const { unmount } = renderElement(createElement(ShortcutsPanel, { onClose }));
        const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]');
        expect(input).not.toBeNull();
        expect(input?.getAttribute('aria-activedescendant')).toBeNull();
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('true');
        expect(input?.getAttribute('aria-activedescendant')).toContain('option-0');
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        expect(document.body.querySelector('[data-shortcut-index="1"]')?.getAttribute('aria-selected')).toBe('true');
        expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('false');
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('does not fire Enter without a highlighted row and clamps the cursor when results shrink', () => {
        const onClose = vi.fn();
        const { unmount } = renderElement(createElement(ShortcutsPanel, { onClose }));
        const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]');
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(onClose).not.toHaveBeenCalled();
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        // Narrow the results to a single row; the cursor must clamp back inside.
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input, 'zzz-no-match');
            input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(document.body.querySelector('[aria-selected="true"]')).toBeNull();
        unmount();
    });

    it('executes the underlying command of registry-backed rows on Enter and click', () => {
        const handler = vi.fn();
        const dispose = register({
            id: 'shortcut-panel-exec-test',
            combo: 'mod+9',
            description: 'Execute me',
            group: 'Test group',
            handler,
        });
        try {
            const onClose = vi.fn();
            const { unmount } = renderElement(createElement(ShortcutsPanel, { onClose }));
            const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            act(() => {
                setter?.call(input, 'Execute me');
                input!.dispatchEvent(new Event('input', { bubbles: true }));
            });
            act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
            act(() => { input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
            expect(handler).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
            unmount();
        }
        finally {
            dispose();
        }
    });
});