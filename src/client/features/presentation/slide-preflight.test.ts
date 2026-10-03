import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { initI18n } from '../../lib/i18n'
import { clearSlideHtmlCache, clearSlidePlanCache, hashContent, readSlideHtml, rememberSlideHtml, renderSlideSource, slideCacheKey, slideMarkup } from './slide-html'
import { SLIDE_DESIGN_HEIGHT, SLIDE_DESIGN_WIDTH, SLIDE_PAD_X, SLIDE_PAD_Y, measureStage } from './slide-stage'
import { SlidePreflight } from './slide-preflight'
import type { SlidePlan } from './slide-pagination'

installTestGlobals()

// Drawing a page's diagrams is what the pass is waiting for, so the enhancement is made to hang here:
// a case that passed only because the stubbed chain happened to finish inside the wait window would
// prove nothing about what the pass refuses to measure.
vi.mock('../../lib/markdown/enhance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/markdown/enhance')>()
  return { ...actual, enhancePreview: () => new Promise<void>(() => { }) }
})

// The background pass draws a slide off-screen, measures its pages, and hands the measured markup to
// the slide list. What it must never do is publish a capture of markup that had not finished being
// drawn: the list then shows a page of placeholders forever, because a page marked prepared is left
// alone. That is L-1's four reds, and this file is the evidence that pins it.
const metrics = measureStage(SLIDE_DESIGN_WIDTH, SLIDE_DESIGN_HEIGHT)
const CONTENT_WIDTH = SLIDE_DESIGN_WIDTH - SLIDE_PAD_X * 2
const CONTENT_HEIGHT = SLIDE_DESIGN_HEIGHT - SLIDE_PAD_Y * 2
const SLIDE = '# Chart page\n\n```chart\n{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}\n```'
const DECK = [SLIDE]
const HASHES = DECK.map((slide) => hashContent(slide))

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  // Both caches outlive a component, and the pass reads a measured plan as "this slide is already
  // listed" — without clearing them the second case would start from the first one's leftovers.
  clearSlideHtmlCache()
  clearSlidePlanCache()
})

// A pass that is still mounted keeps walking the shared cache on its own timers, so every case has to
// put its instance down — including the ones whose assertion throws first.
let live: { unmount: () => void } | null = null

afterEach(() => {
  live?.unmount()
  live = null
  document.body.innerHTML = ''
})

function keyFor(index: number): string {
  const dark = (document.documentElement.dataset.theme ?? 'dark') === 'dark'
  return slideCacheKey({ fingerprint: HASHES[index], dark, index, contentWidth: CONTENT_WIDTH, contentHeight: CONTENT_HEIGHT })
}

function seed(markup: Parameters<typeof rememberSlideHtml>[1]) {
  rememberSlideHtml(keyFor(0), markup)
}

// The entry the preparer writes before the enhancement chain has run — a plain render, parked in the
// cache so a reader has the slide's text while its diagrams are still being drawn.
function plainEntry() {
  return slideMarkup(renderSlideSource(SLIDE, false))
}

async function runPass(onPlan: (slide: number, plan: SlidePlan) => void) {
  const view = renderElement(createElement(SlidePreflight, {
    deck: DECK,
    hashes: HASHES,
    cacheKeys: DECK.map((_, index) => keyFor(index)),
    fingerprint: 'pass-fingerprint',
    metrics,
    content: SLIDE,
    noteTitle: 'Chart page',
    onPlan,
    onProgress: vi.fn(),
  }))
  // The pass starts on an idle slice with a deliberate gap, so give it a few of those rather than
  // asserting on the frame right after mount.
  for (let beat = 0; beat < 12; beat++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    if (document.querySelector('[data-slide-preflight]')) break
  }
  live = view
  return view
}

describe('SlidePreflight — what a measurement is allowed to be taken from', () => {
  it('does not measure, or promote, a plain render that is still being drawn', async () => {
    seed(plainEntry())
    const onPlan = vi.fn()
    const view = await runPass(onPlan)
    expect(document.querySelector('[data-slide-preflight]'), 'an undrawn page is not a geometry to measure').toBeNull()
    expect(onPlan).not.toHaveBeenCalled()
    expect(readSlideHtml(keyFor(0))?.prepared, 'the pass must not stamp a capture it never had the right to take').toBeFalsy()
    view.unmount()
  })

  it('mounts once the page has been through the enhancement chain', async () => {
    seed({ ...plainEntry(), prepared: true })
    const onPlan = vi.fn()
    const view = await runPass(onPlan)
    expect(document.querySelector('[data-slide-preflight]'), 'a prepared page is exactly what the pass is waiting for').toBeTruthy()
    view.unmount()
  })

  it('mounts on a page whose enhancement failed, because that is what the projector shows too', async () => {
    seed({ ...plainEntry(), failed: true })
    const view = await runPass(vi.fn())
    expect(document.querySelector('[data-slide-preflight]')).toBeTruthy()
    view.unmount()
  })
})
