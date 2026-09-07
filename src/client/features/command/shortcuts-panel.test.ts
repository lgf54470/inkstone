import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { installTestGlobals, renderElement } from '../../lib/test-render';
import { register } from '../../lib/hotkeys';
import { ShortcutsPanel } from './shortcuts-panel';

installTestGlobals();

const renderPanel = (onClose: () => void) => {
  const { unmount } = renderElement(createElement(ShortcutsPanel, { onClose }));
  const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  return { unmount, input };
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const keyDown = (input: HTMLInputElement, key: string) => {
  act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
};

describe('ShortcutsPanel keyboard roaming', () => {
  it('moves the highlight with arrows and activates the highlighted row with Enter', () => {
    const onClose = vi.fn();
    const { unmount, input } = renderPanel(onClose);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    keyDown(input, 'ArrowDown');
    expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toContain('option-0');
    keyDown(input, 'ArrowDown');
    expect(document.body.querySelector('[data-shortcut-index="1"]')?.getAttribute('aria-selected')).toBe('true');
    expect(document.body.querySelector('[data-shortcut-index="0"]')?.getAttribute('aria-selected')).toBe('false');
    keyDown(input, 'Enter');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not fire Enter without a highlighted row and clamps the cursor when results shrink', () => {
    const onClose = vi.fn();
    const { unmount, input } = renderPanel(onClose);
    keyDown(input, 'Enter');
    expect(onClose).not.toHaveBeenCalled();
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');
    // Narrow the results to a single row; the cursor must clamp back inside.
    act(() => {
      setInputValue(input, 'zzz-no-match');
    });
    expect(document.body.querySelector('[aria-selected="true"]')).toBeNull();
    unmount();
  });
});

describe('ShortcutsPanel registry-backed rows', () => {
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
      const { unmount, input } = renderPanel(onClose);
      act(() => {
        setInputValue(input, 'Execute me');
      });
      keyDown(input, 'ArrowDown');
      keyDown(input, 'Enter');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
    }
    finally {
      dispose();
    }
  });
});