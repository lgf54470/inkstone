import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { installTestGlobals, renderElement } from '../lib/test-render';
import { toastWithUndo, useUi } from '../store/ui';
import { setUndoToastFocus } from '../lib/undo-focus-pref';
import { Toaster } from './feedback';

installTestGlobals();

afterEach(() => {
    useUi.setState({ toasts: [] });
    setUndoToastFocus(true);
});

describe('undo toast presentation', () => {
    it('renders an accent undo icon, announces title plus action to assistive tech, and lands focus on the undo button', () => {
        const undo = () => {};
        const { unmount } = renderElement(createElement(Toaster));
        act(() => { toastWithUndo('notes.moved_to_trash', undo); });
        const button = document.body.querySelector<HTMLButtonElement>('[data-undo-focus]');
        expect(button).not.toBeNull();
        expect(button?.textContent).toBe('common.undo');
        expect(document.activeElement).toBe(button);
        const root = button?.closest('[role="status"]');
        expect(root?.getAttribute('aria-label')).toContain('notes.moved_to_trash');
        expect(root?.getAttribute('aria-label')).toContain('common.undo');
        unmount();
    });

    it('stays inert for toasts without an action so focus is never stolen', () => {
        const { unmount } = renderElement(createElement(Toaster));
        document.body.focus();
        act(() => { useUi.getState().toast({ title: 'notes.syncing' }); });
        expect(document.body.querySelector('[data-undo-focus]')).toBeNull();
        expect(document.activeElement).toBe(document.body);
        unmount();
    });

    it('does not steal focus from an editable target (typing keeps typing)', () => {
        const { container, unmount } = renderElement(createElement('div', null,
            createElement('input', { 'aria-label': 'editor' }),
            createElement(Toaster)));
        const input = container.querySelector<HTMLInputElement>('input');
        input!.focus();
        act(() => { toastWithUndo('notes.moved_to_trash', () => {}); });
        expect(document.activeElement).toBe(input);
        unmount();
    });

    it('does not steal focus out of an open dialog', () => {
        const { container, unmount } = renderElement(createElement('div', null,
            createElement('div', { role: 'dialog' }, createElement('button', null, 'dialog button')),
            createElement(Toaster)));
        const dialogButton = container.querySelector<HTMLButtonElement>('[role="dialog"] button');
        dialogButton!.focus();
        act(() => { toastWithUndo('notes.moved_to_trash', () => {}); });
        expect(document.activeElement).toBe(dialogButton);
        unmount();
    });

    it('only the first undo toast keeps focus when toasts stack', () => {
        const { unmount } = renderElement(createElement(Toaster));
        act(() => { toastWithUndo('notes.moved_to_trash', () => {}); });
        const first = document.activeElement;
        expect(first?.getAttribute('data-undo-focus')).not.toBeNull();
        act(() => { toastWithUndo('notes.archived', () => {}); });
        expect(document.activeElement).toBe(first);
        unmount();
    });

    it('honors the no-distraction preference (focus disabled)', () => {
        setUndoToastFocus(false);
        const { unmount } = renderElement(createElement(Toaster));
        document.body.focus();
        act(() => { toastWithUndo('notes.moved_to_trash', () => {}); });
        expect(document.body.querySelector('[data-undo-focus]')).not.toBeNull();
        expect(document.activeElement).toBe(document.body);
        unmount();
    });
});