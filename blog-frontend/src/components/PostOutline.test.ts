// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { Heading1, Heading2, Heading3, Heading4, Heading5, Heading6 } from 'lucide-react'
import PostOutline, {
  getHeadingIcon,
  getHeadingTypography,
  outlineMarginTop,
  type Heading,
} from './PostOutline'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE_HEADINGS: Heading[] = [
  { level: 1, text: '第一章', slug: 'chapter-1' },
  { level: 2, text: '第一节', slug: 'section-1' },
  { level: 3, text: '小节', slug: 'subsection-1' },
  { level: 4, text: '注释', slug: 'note-1' },
]

describe('PostOutline icon and typography mapping', () => {
  it('maps levels 1-6 to Lucide heading icons', () => {
    expect(getHeadingIcon(1)).toBe(Heading1)
    expect(getHeadingIcon(2)).toBe(Heading2)
    expect(getHeadingIcon(3)).toBe(Heading3)
    expect(getHeadingIcon(4)).toBe(Heading4)
    expect(getHeadingIcon(5)).toBe(Heading5)
    expect(getHeadingIcon(6)).toBe(Heading6)
    expect(getHeadingIcon(7)).toBe(Heading6)
  })

  it('maps level 1 and 2 typography for active and inactive states', () => {
    const h1Inactive = getHeadingTypography(1, false)
    expect(h1Inactive.fontSize).toBe('var(--text-13)')
    expect(h1Inactive.fontWeight).toBe('font-semibold')
    expect(h1Inactive.textColor).toBe('text-[var(--text-secondary)]')

    const h1Active = getHeadingTypography(1, true)
    expect(h1Active.textColor).toBe('text-[var(--accent)]')
    expect(h1Active.iconColor).toBe('text-[var(--accent)] opacity-100')

    const h2Inactive = getHeadingTypography(2, false)
    expect(h2Inactive.fontSize).toBe('var(--text-12)')
    expect(h2Inactive.fontWeight).toBe('font-medium')

    const h2Active = getHeadingTypography(2, true)
    expect(h2Active.fontWeight).toBe('font-semibold')
  })

  it('maps levels 3, 4, and 5 typography', () => {
    const h3 = getHeadingTypography(3, false)
    expect(h3.fontSize).toBe('var(--text-11\\.5)')
    expect(h3.iconSize).toBe(11)

    const h4 = getHeadingTypography(4, false)
    expect(h4.fontSize).toBe('var(--text-11)')

    const h5 = getHeadingTypography(5, false)
    expect(h5.fontSize).toBe('var(--text-10\\.5)')
  })
})

describe('outlineMarginTop spacing helper', () => {
  it('returns empty string for first item', () => {
    expect(outlineMarginTop({ level: 1, text: 'A', slug: 'a' }, 0, undefined)).toBe('')
  })

  it('adds mt-1.5 for subsequent level 1 headings', () => {
    const h1 = { level: 1, text: 'B', slug: 'b' }
    const prev = { level: 2, text: 'A', slug: 'a' }
    expect(outlineMarginTop(h1, 1, prev)).toBe('mt-1.5')
  })

  it('adds mt-0.5 for level 2 if previous was not level 1', () => {
    const h2 = { level: 2, text: 'B', slug: 'b' }
    const prevH2 = { level: 2, text: 'A', slug: 'a' }
    const prevH1 = { level: 1, text: 'Root', slug: 'root' }
    expect(outlineMarginTop(h2, 2, prevH2)).toBe('mt-0.5')
    expect(outlineMarginTop(h2, 1, prevH1)).toBe('')
  })
})

describe('PostOutline rendering', () => {
  it('returns null when headings array is empty', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(createElement(PostOutline, { headings: [] }))
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders all headings with level data attributes, icons and indent', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(PostOutline, { headings: SAMPLE_HEADINGS, locale: 'zh-CN' }))
    })

    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
    expect(nav?.textContent).toContain('大纲')

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-heading-level]')
    expect(buttons.length).toBe(4)

    expect(buttons[0]?.getAttribute('data-heading-level')).toBe('1')
    expect(buttons[0]?.getAttribute('data-heading-slug')).toBe('chapter-1')
    expect(buttons[0]?.style.paddingLeft).toBe('8px')
    expect(buttons[0]?.style.fontSize).toBe('var(--text-13)')

    expect(buttons[1]?.getAttribute('data-heading-level')).toBe('2')
    expect(buttons[1]?.style.paddingLeft).toBe('18px')
    expect(buttons[1]?.style.fontSize).toBe('var(--text-12)')

    expect(buttons[2]?.getAttribute('data-heading-level')).toBe('3')
    expect(buttons[2]?.style.paddingLeft).toBe('28px')
    expect(buttons[2]?.style.fontSize).toBe('var(--text-11\\.5)')

    expect(buttons[3]?.getAttribute('data-heading-level')).toBe('4')
    expect(buttons[3]?.style.paddingLeft).toBe('38px')
    expect(buttons[3]?.style.fontSize).toBe('var(--text-11)')
  })
})

describe('PostOutline interaction', () => {
  it('invokes onSelect when an item is clicked', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onSelect = vi.fn()

    await act(async () => {
      root.render(createElement(PostOutline, { headings: SAMPLE_HEADINGS, onSelect }))
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-heading-level]')
    await act(async () => {
      buttons[1]?.click()
    })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(SAMPLE_HEADINGS[1])
  })
})
