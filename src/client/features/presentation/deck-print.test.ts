import { beforeEach, describe, expect, it } from 'vitest'
import { createFenceBodies, takeFenceIndex, type FenceBodies } from '../../lib/markdown/fence-bodies'
import { buildDeckPages } from './deck-print'
import { readSlideHtml, rememberSlideHtml, slideCacheKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'

const METRICS: StageMetrics = { scale: 1, designWidth: 1280, designHeight: 720, contentWidth: 1168, contentHeight: 632 }
const FIRST = '<p>one</p><p>two</p><h2>three</h2><p>four</p>'
const SECOND = '<p>second slide</p>'
const FIRST_BODIES = boardFences('board of the first slide')
const SECOND_BODIES = boardFences('board of the second slide')
const PAGINATED: SlidePlan = {
  pages: [
    { from: 0, to: 2, top: 0 },
    { from: 2, to: 4, top: 300 },
  ],
  scales: [1, 1, 1, 0.5],
}

function boardFences(body: string): FenceBodies {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'kanban', body)
  return fences
}

const deck = [FIRST, SECOND]
const cacheKeys = deck.map((_, index) => slideCacheKey({ fingerprint: 'fingerprint', dark: false, index, contentWidth: METRICS.contentWidth, contentHeight: METRICS.contentHeight }))

beforeEach(() => {
  rememberSlideHtml(cacheKeys[0], { html: FIRST, fences: FIRST_BODIES })
  rememberSlideHtml(cacheKeys[1], { html: SECOND, fences: SECOND_BODIES })
})

describe('buildDeckPages', () => {
  it('gives a measured slide one printed page per page the show walks', () => {
    const pages = buildDeckPages(deck, cacheKeys, { 0: PAGINATED }, METRICS, false)
    expect(pages).toHaveLength(3)
    expect(pages[0]!.html).toBe('<p>one</p><p>two</p>')
    expect(pages[1]!.html).toContain('scale(0.5)')
    expect(pages[2]!.html).toBe(SECOND)
  })

  it('prints an unmeasured slide as the single page it at least has', () => {
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    expect(pages.map((page) => page.html)).toEqual([FIRST, SECOND])
  })

  it('renders a slide the show never prepared from its markdown', () => {
    const unprepared = ['```kanban\n{"title":"never prepared"}\n```']
    const pages = buildDeckPages(unprepared, ['missing:key'], {}, METRICS, false)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.html).toContain('data-kanban')
    // The printed sheet draws a board out of the body, so a page built on the spot has to carry
    // the fence body its own render read — a sliced string alone would print an empty fence.
    expect(pages[0]!.fences.kanban).toHaveLength(1)
    expect(pages[0]!.fences.kanban[0]).toContain('"never prepared"')
  })

  it('prints the prepared markup rather than the raw source when both exist', () => {
    rememberSlideHtml(cacheKeys[0], { html: '<p>enhanced</p><p>diagram</p>', fences: FIRST_BODIES })
    const pages = buildDeckPages([FIRST], [cacheKeys[0]], {}, METRICS, false)
    expect(pages[0]!.html).toBe('<p>enhanced</p><p>diagram</p>')
  })

  it('keeps the deck page order, whether or not the plan belongs to the first slide', () => {
    // Slide 1 keeps its floor page, slide 2 contributes the two its plan measured.
    const pages = buildDeckPages(deck, cacheKeys, { 1: PAGINATED }, METRICS, false)
    expect(pages).toHaveLength(3)
    expect(pages[0]!.html).toBe(FIRST)
    expect(pages[1]!.html).toBe(SECOND)
    // The plan's second page points past the end of this slide's markup, which slices to nothing
    // rather than repeating the first page.
    expect(pages[2]!.html).toBe('')
    expect(readSlideHtml(cacheKeys[1])?.html).toBe(SECOND)
  })
})

describe('buildDeckPages — the fence bodies a page carries', () => {
  it('hands every page of a slide the bodies that slide was rendered from', () => {
    const pages = buildDeckPages(deck, cacheKeys, { 0: PAGINATED }, METRICS, false)
    // Slicing a page takes blocks out, never the numbering the remaining blocks point into.
    expect(pages[0]!.fences).toBe(FIRST_BODIES)
    expect(pages[1]!.fences).toBe(FIRST_BODIES)
    expect(pages[2]!.fences).toBe(SECOND_BODIES)
  })
})
