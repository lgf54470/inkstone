import { beforeEach, describe, expect, it } from 'vitest'
import { buildDeckPages } from './deck-print'
import { readSlideHtml, rememberSlideHtml, slideCacheKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'

const METRICS: StageMetrics = { scale: 1, designWidth: 1280, designHeight: 720, contentWidth: 1168, contentHeight: 632 }
const FIRST = '<p>one</p><p>two</p><h2>three</h2><p>four</p>'
const SECOND = '<p>second slide</p>'
const PAGINATED: SlidePlan = {
  pages: [
    { from: 0, to: 2, top: 0 },
    { from: 2, to: 4, top: 300 },
  ],
  scales: [1, 1, 1, 0.5],
}

const deck = [FIRST, SECOND]
const cacheKeys = deck.map((_, index) => slideCacheKey({ fingerprint: 'fingerprint', dark: false, index, contentWidth: METRICS.contentWidth, contentHeight: METRICS.contentHeight }))

beforeEach(() => {
  rememberSlideHtml(cacheKeys[0], FIRST)
  rememberSlideHtml(cacheKeys[1], SECOND)
})

describe('buildDeckPages', () => {
  it('gives a measured slide one printed page per page the show walks', () => {
    const pages = buildDeckPages(deck, cacheKeys, { 0: PAGINATED }, METRICS, false)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toBe('<p>one</p><p>two</p>')
    expect(pages[1]).toContain('scale(0.5)')
    expect(pages[2]).toBe(SECOND)
  })

  it('prints an unmeasured slide as the single page it at least has', () => {
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    expect(pages).toEqual([FIRST, SECOND])
  })

  it('renders a slide the show never prepared from its markdown', () => {
    const unprepared = [FIRST]
    const pages = buildDeckPages(unprepared, ['missing:key'], {}, METRICS, false)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('three')
  })

  it('prints the prepared markup rather than the raw source when both exist', () => {
    rememberSlideHtml(cacheKeys[0], '<p>enhanced</p><p>diagram</p>')
    const pages = buildDeckPages([FIRST], [cacheKeys[0]], {}, METRICS, false)
    expect(pages[0]).toBe('<p>enhanced</p><p>diagram</p>')
  })

  it('keeps the deck page order, whether or not the plan belongs to the first slide', () => {
    // Slide 1 keeps its floor page, slide 2 contributes the two its plan measured.
    const pages = buildDeckPages(deck, cacheKeys, { 1: PAGINATED }, METRICS, false)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toBe(FIRST)
    expect(pages[1]).toBe(SECOND)
    // The plan's second page points past the end of this slide's markup, which slices to nothing
    // rather than repeating the first page.
    expect(pages[2]).toBe('')
    expect(readSlideHtml(cacheKeys[1])).toBe(SECOND)
  })
})
