import { createElement, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { createFenceBodies, takeFenceIndex } from '../../lib/markdown/fence-bodies'
import { prefersReducedMotion, useBentoSlidesFallback } from './slide-canvas'

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

