import { act, createElement, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { createFenceBodies, takeFenceIndex } from '../../lib/markdown/fence-bodies'
import { applySlidePage, prefersReducedMotion, useBentoSlidesFallback, useSlideLinkInterceptor } from './slide-canvas'
import type { SlidePlan } from './slide-pagination'

describe('prefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns true when media query prefers-reduced-motion matches', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when prefers-reduced-motion does not match', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('useBentoSlidesFallback', () => {
  it('degrades nested bento-slides block into static cards and removes loading class', () => {
    const onRendered = vi.fn()
    const fences = createFenceBodies()
    takeFenceIndex(fences, 'slides', '# Welcome\n\n- Point 1\n- Point 2\n---\n# Slide 2\n\nContent')

    function Harness() {
      const hostRef = useRef<HTMLDivElement>(null)
      const html =
        '<div class="bento-slides-block loading" data-bento-slides="" data-bento-slides-index="0" aria-busy="true"><div class="bento-slides-block-placeholder" data-bento-slides-placeholder>Loading slides...</div></div>'
      useBentoSlidesFallback(hostRef, html, fences, onRendered)
      return createElement('div', { ref: hostRef, dangerouslySetInnerHTML: { __html: html } })
    }

    const rendered = renderElement(createElement(Harness))
    const block = rendered.container.querySelector<HTMLElement>('[data-bento-slides]')
    expect(block).not.toBeNull()
    expect(block?.classList.contains('loading')).toBe(false)
    expect(block?.classList.contains('is-ready')).toBe(true)
    expect(block?.getAttribute('aria-busy')).toBe('false')

    const grid = block?.querySelector('.bento-slides-fallback-grid')
    expect(grid).not.toBeNull()
    const cards = block?.querySelectorAll('.bento-slides-fallback-card')
    expect(cards?.length).toBe(2)
    expect(cards?.[0]?.textContent).toContain('Welcome')
    expect(onRendered).toHaveBeenCalled()
    rendered.unmount()
  })
})

// The projector shows a continued block by translating the whole slide to the band's offset; the
// band itself has to be cut, or the rows belonging to the next page would be drawn on this one too.
describe('applySlidePage — a block that continues over pages', () => {
  const plan: SlidePlan = {
    pages: [
      { from: 0, to: 1, top: 0, clip: { top: 0, bottom: 1200 } },
      { from: 0, to: 1, top: 600, clip: { top: 600, bottom: 600 } },
      { from: 0, to: 1, top: 1200, clip: { top: 1200, bottom: 0 } },
    ],
    scales: [1],
  }
  const blocks = () => [document.createElement('table'), document.createElement('p')]

  it('cuts the block to the band its page owns and hides the block below it', () => {
    const [table, paragraph] = blocks()
    applySlidePage([table, paragraph], plan, 1, 1168, 632)
    expect(table.style.clipPath).toBe('inset(600px 0 600px 0)')
    expect(table.style.visibility).toBe('')
    expect(paragraph.style.visibility).toBe('hidden')
    expect(paragraph.style.clipPath).toBe('')
  })

  it('leaves a band that opens the block whole at the top and cuts only its tail', () => {
    const [table] = blocks()
    applySlidePage([table], plan, 0, 1168, 632)
    expect(table.style.clipPath).toBe('inset(0px 0 1200px 0)')
  })

  it('clears the band when the page shown no longer continues a block', () => {
    const [table] = blocks()
    applySlidePage([table], plan, 2, 1168, 632)
    applySlidePage([table], { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }, 0, 1168, 632)
    expect(table.style.clipPath).toBe('')
  })
})

// The projector swallows the click on every link in the slide, so a refused href used to leave the
// author with nothing at all: no navigation and no browser feedback, only a slide that ignores them.
describe('useSlideLinkInterceptor', () => {
  function LinkHarness({ href }: { href: string }) {
    const handleClick = useSlideLinkInterceptor()
    return createElement('div', { onClick: handleClick }, createElement('a', { href }, 'the link'))
  }

  let open: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    open.mockRestore()
    useUi.setState({ toasts: [] })
  })

  function clickAnchor(href: string) {
    open = vi.spyOn(window, 'open').mockImplementation(() => null)
    useUi.setState({ toasts: [] })
    const rendered = renderElement(createElement(LinkHarness, { href }))
    act(() => { rendered.container.querySelector('a')?.click(); })
    rendered.unmount()
    return open
  }

  it('tells the presenter a link was refused instead of ignoring the click', () => {
    clickAnchor('javascript:alert(1)')
    const toasts = useUi.getState().toasts
    expect(toasts.map((toast) => toast.title)).toContain(t('workspace.presentation_link_blocked'))
    expect(toasts.at(-1)?.tone).toBe('warning')
  })

  it('opens a link whose scheme is only written in capitals, and does not announce it', () => {
    const openMock = clickAnchor('HTTPS://Example.COM/Talk#Section')
    expect(openMock).toHaveBeenCalledWith('HTTPS://Example.COM/Talk#Section', '_blank', 'noopener,noreferrer')
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('stays quiet about a jump that belongs to the slide', () => {
    const openMock = clickAnchor('#slide-heading')
    expect(openMock).not.toHaveBeenCalled()
    expect(useUi.getState().toasts).toHaveLength(0)
  })
})

