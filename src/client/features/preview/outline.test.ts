import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { installTestGlobals, renderElement } from '../../lib/test-render';
import { Outline, getHeadingTypography, getHeadingIcon } from './outline';
import type { Heading } from '../../lib/markdown/renderer';
import { Heading1, Heading2, Heading3, Heading4, Heading5, Heading6 } from 'lucide-react';

installTestGlobals();

describe('Outline heading typography and icon mapping', () => {
  it('maps levels to corresponding Lucide heading icons', () => {
    expect(getHeadingIcon(1)).toBe(Heading1);
    expect(getHeadingIcon(2)).toBe(Heading2);
    expect(getHeadingIcon(3)).toBe(Heading3);
    expect(getHeadingIcon(4)).toBe(Heading4);
    expect(getHeadingIcon(5)).toBe(Heading5);
    expect(getHeadingIcon(6)).toBe(Heading6);
    expect(getHeadingIcon(99)).toBe(Heading6);
  });

  it('maps level 1 to 13px, semibold weight, and iconSize 12.5', () => {
    const inactive = getHeadingTypography(1, false);
    expect(inactive.fontSize).toBe('text-[13px]');
    expect(inactive.fontWeight).toBe('font-semibold');
    expect(inactive.textColor).toContain('var(--text-secondary)');
    expect(inactive.iconSize).toBe(12.5);

    const active = getHeadingTypography(1, true);
    expect(active.fontSize).toBe('text-[13px]');
    expect(active.fontWeight).toBe('font-semibold');
    expect(active.textColor).toContain('var(--accent)');
    expect(active.iconColor).toContain('var(--accent)');
  });

  it('maps level 2 to 12px and medium (semibold when active)', () => {
    const inactive = getHeadingTypography(2, false);
    expect(inactive.fontSize).toBe('text-[12px]');
    expect(inactive.fontWeight).toBe('font-medium');
    expect(inactive.iconSize).toBe(11.5);

    const active = getHeadingTypography(2, true);
    expect(active.fontSize).toBe('text-[12px]');
    expect(active.fontWeight).toBe('font-semibold');
  });

  it('maps level 3 to 11.5px and normal (medium when active)', () => {
    const inactive = getHeadingTypography(3, false);
    expect(inactive.fontSize).toBe('text-[11.5px]');
    expect(inactive.fontWeight).toBe('font-normal');
    expect(inactive.iconSize).toBe(11);

    const active = getHeadingTypography(3, true);
    expect(active.fontSize).toBe('text-[11.5px]');
    expect(active.fontWeight).toBe('font-medium');
  });

  it('maps level 4 to 11px and normal (medium when active)', () => {
    const inactive = getHeadingTypography(4, false);
    expect(inactive.fontSize).toBe('text-[11px]');
    expect(inactive.fontWeight).toBe('font-normal');
    expect(inactive.iconSize).toBe(10.5);

    const active = getHeadingTypography(4, true);
    expect(active.fontSize).toBe('text-[11px]');
    expect(active.fontWeight).toBe('font-medium');
  });

  it('maps level 5 and 6 to 10.5px and normal (medium when active)', () => {
    const h5 = getHeadingTypography(5, false);
    expect(h5.fontSize).toBe('text-[10.5px]');
    expect(h5.fontWeight).toBe('font-normal');

    const h6 = getHeadingTypography(6, false);
    expect(h6.fontSize).toBe('text-[10.5px]');
    expect(h6.fontWeight).toBe('font-normal');
  });
});

describe('Outline component', () => {
  it('returns null when headings array is empty', () => {
    const { container, unmount } = renderElement(
      createElement(Outline, { headings: [], onSelect: vi.fn() })
    );
    expect(container.firstChild).toBeNull();
    unmount();
  });

  it('renders headings with corresponding level attributes, icons, sizes and weights', () => {
    const headings: Heading[] = [
      { level: 1, text: 'Chapter 1', slug: 'chapter-1', line: 1 },
      { level: 2, text: 'Section 1.1', slug: 'section-1-1', line: 5 },
      { level: 3, text: 'Detail 1.1.1', slug: 'detail-1-1-1', line: 10 },
      { level: 4, text: 'Note A', slug: 'note-a', line: 15 },
    ];
    const handleSelect = vi.fn();

    const { container, unmount } = renderElement(
      createElement(Outline, { headings, onSelect: handleSelect })
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-heading-level]');
    expect(buttons.length).toBe(4);

    // Each button should render an svg icon
    const svgs = container.querySelectorAll<SVGElement>('button[data-heading-level] svg');
    expect(svgs.length).toBe(4);

    // H1
    expect(buttons[0].getAttribute('data-heading-level')).toBe('1');
    expect(buttons[0].classList.contains('text-[13px]')).toBe(true);
    expect(buttons[0].classList.contains('font-semibold')).toBe(true);
    expect(buttons[0].style.paddingLeft).toBe('8px'); // minLevel 1, offset 0

    // H2
    expect(buttons[1].getAttribute('data-heading-level')).toBe('2');
    expect(buttons[1].classList.contains('text-[12px]')).toBe(true);
    expect(buttons[1].classList.contains('font-medium')).toBe(true);
    expect(buttons[1].style.paddingLeft).toBe('18px'); // 8 + 1 * 10

    // H3
    expect(buttons[2].getAttribute('data-heading-level')).toBe('3');
    expect(buttons[2].classList.contains('text-[11.5px]')).toBe(true);
    expect(buttons[2].classList.contains('font-normal')).toBe(true);
    expect(buttons[2].style.paddingLeft).toBe('28px'); // 8 + 2 * 10

    // H4
    expect(buttons[3].getAttribute('data-heading-level')).toBe('4');
    expect(buttons[3].classList.contains('text-[11px]')).toBe(true);
    expect(buttons[3].classList.contains('font-normal')).toBe(true);
    expect(buttons[3].style.paddingLeft).toBe('38px'); // 8 + 3 * 10

    // Click handler test
    buttons[1].click();
    expect(handleSelect).toHaveBeenCalledWith(headings[1]);

    unmount();
  });

  it('aligns indentation when minLevel > 1', () => {
    const headings: Heading[] = [
      { level: 2, text: 'Topic 1', slug: 'topic-1', line: 1 },
      { level: 3, text: 'Subtopic 1', slug: 'subtopic-1', line: 5 },
    ];

    const { container, unmount } = renderElement(
      createElement(Outline, { headings, onSelect: vi.fn() })
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-heading-level]');
    expect(buttons.length).toBe(2);

    // H2 with minLevel=2 starts at 8px
    expect(buttons[0].style.paddingLeft).toBe('8px');
    // H3 with minLevel=2 has 1 level indentation = 18px
    expect(buttons[1].style.paddingLeft).toBe('18px');

    unmount();
  });

  it('adds margin-top on subsequent H1 headings for section separation', () => {
    const headings: Heading[] = [
      { level: 1, text: 'First Chapter', slug: 'first-chapter', line: 1 },
      { level: 2, text: 'Section', slug: 'section', line: 5 },
      { level: 1, text: 'Second Chapter', slug: 'second-chapter', line: 10 },
    ];

    const { container, unmount } = renderElement(
      createElement(Outline, { headings, onSelect: vi.fn() })
    );

    const listItems = container.querySelectorAll('li');
    expect(listItems.length).toBe(3);
    // First H1 does not have mt-1.5
    expect(listItems[0].classList.contains('mt-1.5')).toBe(false);
    // Second H1 has mt-1.5
    expect(listItems[2].classList.contains('mt-1.5')).toBe(true);

    unmount();
  });
});
