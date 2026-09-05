import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { installTestGlobals, renderElement } from '../lib/test-render';
import { TagPill } from './tag-pill';

installTestGlobals();

describe('tag-pill', () => {
  it('renders tag label with hash symbol and custom color', () => {
    const { container, unmount } = renderElement(
      createElement(TagPill, {
        tag: 'project/alpha',
        color: '#ff5500',
      })
    );

    expect(container.textContent).toContain('project/alpha');
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.color).toBe('rgb(255, 85, 0)');
    unmount();
  });

  it('triggers onClick and onRemove callbacks with close button', () => {
    const handleClick = vi.fn();
    const handleRemove = vi.fn();

    const { container, unmount } = renderElement(
      createElement(TagPill, {
        tag: 'todo',
        removable: true,
        onClick: handleClick,
        onRemove: handleRemove,
      })
    );

    const closeButton = container.querySelector('button');
    expect(closeButton).not.toBeNull();

    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledTimes(0);

    const root = container.firstElementChild as HTMLElement;
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handleClick).toHaveBeenCalledTimes(1);

    unmount();
  });
});
