import { createElement } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { PresentationControls, SlideProgress } from './presentation-controls'

// The toggle is found by the message it shows, which only exists once the locale has loaded.
beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('PresentationControls', () => {
  const defaultProps = {
    slideIndex: 1,
    slideCount: 5,
    subPage: 0,
    pageCount: 1,
    isFullscreen: false,
    railOpen: false,
    overview: false,
    following: false,
    chromeHidden: false,
    occluded: false,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToggleRail: vi.fn(),
    onToggleOverview: vi.fn(),
    onToggleFollowing: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onExport: vi.fn(),
    onExportImages: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders control groups with isolating separators', () => {
    const { container } = renderElement(createElement(PresentationControls, defaultProps))
    const chrome = container.querySelector('[data-presentation-chrome]')
    expect(chrome).toBeTruthy()

    const dividers = chrome?.querySelectorAll('span[aria-hidden="true"]')
    expect(dividers?.length).toBe(3)
  })

  it('disables prev button at the start of deck', () => {
    const { container } = renderElement(createElement(PresentationControls, { ...defaultProps, slideIndex: 0, subPage: 0 }))
    const buttons = container.querySelectorAll('button')
    expect(buttons[0]?.disabled).toBe(true)
  })

  it('disables next button at the end of deck', () => {
    const { container } = renderElement(createElement(PresentationControls, { ...defaultProps, slideIndex: 4, slideCount: 5, subPage: 0, pageCount: 1 }))
    const buttons = container.querySelectorAll('button')
    expect(buttons[1]?.disabled).toBe(true)
  })

  // The grid is drawn over the pill rather than beside it, so the pill's own buttons are the
  // ones a Tab key would otherwise reach from behind an opaque layer.
  it('puts the pill out of reach while the overview grid is up', () => {
    const { container } = renderElement(createElement(PresentationControls, { ...defaultProps, occluded: true }))
    const chrome = container.querySelector('[data-presentation-chrome]')
    expect(chrome?.hasAttribute('inert')).toBe(true)
    expect(chrome?.className).not.toContain('opacity-0')
  })

  it('names the overview toggle by the state it moves the grid to, and drives that state', () => {
    const closed = renderElement(createElement(PresentationControls, defaultProps))
    expect(closed.container.querySelector(`[aria-label="${t('workspace.presentation_show_overview')}"]`)).toBeTruthy()
    expect(closed.container.querySelector(`[aria-label="${t('workspace.presentation_hide_overview')}"]`)).toBeNull()

    const onToggleOverview = vi.fn()
    const open = renderElement(createElement(PresentationControls, { ...defaultProps, overview: true, onToggleOverview }))
    const button = open.container.querySelector<HTMLButtonElement>(`[aria-label="${t('workspace.presentation_hide_overview')}"]`)
    expect(button).toBeTruthy()
    button?.click()
    expect(onToggleOverview).toHaveBeenCalledTimes(1)
  })

  it('sets inert and invisible when chromeHidden is true', () => {
    const { container } = renderElement(createElement(PresentationControls, { ...defaultProps, chromeHidden: true }))
    const chrome = container.querySelector('[data-presentation-chrome]')
    expect(chrome?.hasAttribute('inert')).toBe(true)
    expect(chrome?.className).toContain('invisible')
    expect(chrome?.className).toContain('opacity-0')
  })
})

describe('SlideProgress', () => {
  it('renders progress bar with correct width percentage', () => {
    const { container } = renderElement(createElement(SlideProgress, { index: 1, count: 4 }))
    const bar = container.querySelector('.bg-\\[var\\(--accent\\)\\]') as HTMLElement
    expect(bar?.style.width).toBe('50%')
  })
})
