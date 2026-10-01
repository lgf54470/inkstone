import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFenceBodies, takeFenceIndex, type FenceBodies } from '../../lib/markdown/fence-bodies'
import { renderElement } from '../../lib/test-render'
import * as deckImage from './deck-image'
import { buildDeckPages, DeckImageSheet, saveDeckPages } from './deck-print'
import { readSlideHtml, rememberSlideHtml, slideCacheKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import type { StageMetrics } from './slide-stage'

vi.mock('./deck-image', () => ({
  deckImageGeometry: vi.fn(() => ({ width: 1280, height: 720, padX: 0, padY: 0 })),
  collectDeckCss: vi.fn(async () => ''),
  renderDeckPagePng: vi.fn(async () => new Blob(['fake-png'], { type: 'image/png' })),
  zipDeckImages: vi.fn(async () => new Blob(['fake-zip'], { type: 'application/zip' })),
  saveDeckImages: vi.fn(),
}))

// The sheet reports its own progress and toasts when it is done, so the store is stood up rather
// than imported: a test of the export's lifecycle should not depend on the toast queue's timers.
vi.mock('../../store/ui', () => ({ useUi: { getState: () => ({ toast: vi.fn() }) } }))


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

describe('buildDeckPages — the layout a printed page keeps', () => {
  it('prints a column slide in the columns the projector measured it in', () => {
    const columns: SlidePlan = { pages: [{ from: 0, to: 4, top: 0 }], scales: [1, 1, 1, 1], layout: 'split' }
    const pages = buildDeckPages(deck, cacheKeys, { 0: columns }, METRICS, false)
    expect(pages[0]!.layout).toBe('split')
    expect(pages[0]!.html).toBe(FIRST)
  })

  it('prints the flow layout the projector fell back to, not the switch the slide asked for', () => {
    // The prepared markup carries `split` because that is what the author wrote; the plan carries
    // nothing because that is what the projector measured. A page that printed the columns anyway
    // would slice its pages out of a geometry the show never used.
    rememberSlideHtml(cacheKeys[0], { html: FIRST, fences: FIRST_BODIES, layout: 'split' })
    const pages = buildDeckPages(deck, cacheKeys, { 0: PAGINATED }, METRICS, false)
    expect(pages[0]!.layout).toBeUndefined()
    expect(pages[1]!.layout).toBeUndefined()
  })

  it('keeps the switch for a slide the show never measured', () => {
    rememberSlideHtml(cacheKeys[1], { html: SECOND, fences: SECOND_BODIES, layout: 'cover' })
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    expect(pages[1]!.layout).toBe('cover')
  })
})

describe('saveDeckPages — streaming progress', () => {
  it('reports progress incrementally for each page', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="deck-print-page">1</div><div class="deck-print-page">2</div><div class="deck-print-page">3</div>'
    const progressCalls: [number, number][] = []
    const onProgress = (current: number, total: number) => {
      progressCalls.push([current, total])
    }
    const count = await saveDeckPages(root, METRICS, 'test-deck', onProgress)
    expect(count).toBe(3)
    expect(progressCalls).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })
})

// A pass of the export runs through awaits (prepare, one page per round, then the archive), so the
// test gives it room and then keeps watching: how much room a pass needs is not what is being
// asserted, and a second pass inside the same window is.
async function flush(ticks: number) {
  for (let index = 0; index < ticks; index++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
}

// jsdom has no FontFaceSet, and the sheet waits for its webfonts before it hands the pages over.
// Left unshimmed the wait throws inside the component's own best-effort catch, which swallows the
// step the test is driving rather than failing it — so the marker is what bounds the wait below.
// The shim is rewritten per test because one of them hands back a font pass that never lands.
function stubFonts(ready: Promise<unknown> = Promise.resolve()) {
  Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true })
}

// Bounded, then asserted: a loop that never settles must fail as "this never happened", because a
// test that hangs instead reports a timeout and says nothing about which promise the code broke.
async function until(probe: () => boolean, ticks = 120) {
  for (let index = 0; index < ticks && !probe(); index++) await flush(1)
  return probe()
}

describe('DeckImageSheet — what the export leaves behind', () => {
  beforeEach(() => {
    stubFonts()
    vi.mocked(deckImage.saveDeckImages).mockClear()
    vi.mocked(deckImage.renderDeckPagePng).mockClear()
  })

  // The sheet is a portal on `document.body`, so each test takes its own back down in a `finally`:
  // a failed assertion that left one up would be read by the next test as its own.
  it('writes one archive for one press of the control', async () => {
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    const view = renderElement(createElement(DeckImageSheet, { pages, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone: vi.fn() }))
    try {
      const drawn = await until(() => document.querySelector<HTMLElement>('[data-deck-print]')?.dataset.deckImageReady === 'true')
      expect(drawn).toBe(true)
      await flush(10)
      expect(deckImage.saveDeckImages).toHaveBeenCalledTimes(1)
    } finally {
      view.unmount()
    }
  })

  it('hands the deck back to the show once the pictures are saved', async () => {
    // The order is the contract: a sheet that gives the deck back before the archive is written
    // takes the pages out from under the export that is still reading them.
    const steps: string[] = []
    vi.mocked(deckImage.saveDeckImages).mockImplementation(() => { steps.push('archive written') })
    const onDone = vi.fn(() => { steps.push('deck handed back') })
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    const view = renderElement(createElement(DeckImageSheet, { pages, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone }))
    try {
      const handed = await until(() => onDone.mock.calls.length > 0)
      expect(handed).toBe(true)
      await flush(10)
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(steps).toEqual(['archive written', 'deck handed back'])
    } finally {
      view.unmount()
    }
  })

  it('hands the deck back to the overlay that is showing, not the one that mounted', async () => {
    // The sheet is handed its callbacks inline, so the render that finishes the draw has to be the
    // render they are read from: a handover taken from the mount would tell an overlay that is gone
    // that it is done while the one on screen keeps announcing itself as busy.
    let release: () => void = () => {}
    stubFonts(new Promise<void>((resolve) => { release = resolve }))
    const mounted = vi.fn()
    const showing = vi.fn()
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    const sheet = (onDone: () => void) => createElement(DeckImageSheet, { pages, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone })
    const view = renderElement(sheet(mounted))
    await flush(2)
    view.rerender(sheet(showing))
    release()
    const handed = await until(() => showing.mock.calls.length > 0 || mounted.mock.calls.length > 0)
    try {
      expect(handed).toBe(true)
      await flush(10)
      expect(showing).toHaveBeenCalledTimes(1)
      expect(mounted).not.toHaveBeenCalled()
    } finally {
      view.unmount()
    }
  })

  it('gives up a draw the show is no longer waiting for', async () => {
    // Leaving the show tears the sheet down while its pages are still being drawn. The pass that
    // was already in flight has to notice, or it downloads a deck nobody asked for and hands back
    // a deck the overlay has gone — and the fonts the sheet waits on are the seam that keeps it
    // in flight until the test takes the sheet away.
    let release: () => void = () => {}
    stubFonts(new Promise<void>((resolve) => { release = resolve }))
    const onDone = vi.fn()
    const pages = buildDeckPages(deck, cacheKeys, {}, METRICS, false)
    const view = renderElement(createElement(DeckImageSheet, { pages, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone }))
    await flush(2)
    view.unmount()
    release()
    await flush(20)
    expect(deckImage.renderDeckPagePng).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})

// The sheet is a portal on `document.body`, so the reads below go to the document, and each test
// takes its own sheet back down: a sheet a failed assertion left up would be read by the next one.
describe('DeckSheet — the layout a printed page is drawn in', () => {
  it('draws the page in the layout the plan was measured with, not the switch the slide carries', async () => {
    stubFonts()
    rememberSlideHtml(cacheKeys[0], { html: FIRST, fences: FIRST_BODIES, layout: 'split' })
    const columns: SlidePlan = { pages: [{ from: 0, to: 4, top: 0 }], scales: [1, 1, 1, 1], layout: 'split' }
    const refused: SlidePlan = { pages: [{ from: 0, to: 4, top: 0 }], scales: [1, 1, 1, 1] }
    const pages = buildDeckPages(deck, cacheKeys, { 0: columns }, METRICS, false)
    const view = renderElement(createElement(DeckImageSheet, { pages, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone: vi.fn() }))
    const drawn = await until(() => document.querySelectorAll('.deck-print-page').length === pages.length)
    try {
      expect(drawn).toBe(true)
      expect(document.querySelector('.deck-print-page [data-slide-page]')?.className).toContain('ink-slide-split')
    }
    finally {
      view.unmount()
    }
    const fell = buildDeckPages(deck, cacheKeys, { 0: refused }, METRICS, false)
    const second = renderElement(createElement(DeckImageSheet, { pages: fell, metrics: METRICS, font: 'sans', dark: false, title: 'deck', onDone: vi.fn() }))
    const redrawn = await until(() => document.querySelectorAll('.deck-print-page').length === fell.length)
    try {
      expect(redrawn).toBe(true)
      expect(document.querySelector('.deck-print-page [data-slide-page]')?.className).not.toContain('ink-slide-split')
    }
    finally {
      second.unmount()
    }
  })
})
