import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noteSummary } from '../../store/notes-test-utils'
import { useNotes } from '../../store/notes'
import { usePresentation } from '../../store/presentation'
import { renderElement } from '../../lib/test-render'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { clearSlideHtmlCache, clearSlidePlanCache, hashContent, readSlideHtml, readSlidePlan, rememberSlideHtml, rememberSlidePlan, reserveSlideCache, subscribeSlideHtmlKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { useSlidePlans } from './use-presentation-session'
import { PresentationOverlay } from './presentation-overlay'

describe('slidePlanCache', () => {
  beforeEach(() => {
    clearSlidePlanCache()
  })

  it('stores and retrieves plans by slide hash', () => {
    const dummyPlan: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }
    expect(readSlidePlan('hash-1')).toBeUndefined()
    rememberSlidePlan('hash-1', dummyPlan)
    expect(readSlidePlan('hash-1')).toBe(dummyPlan)
  })
})

describe('useSlidePlans incremental caching', () => {
  beforeEach(() => {
    clearSlidePlanCache()
  })

  it('preserves cached plan reference when other slides change', () => {
    let latestPlans: Record<number, SlidePlan> = {}
    let reportPlanFn: (slide: number, plan: SlidePlan) => void = () => {}

    function TestHarness({ hashes }: { hashes: string[] }) {
      const { plans, reportPlan } = useSlidePlans(hashes)
      latestPlans = plans
      reportPlanFn = reportPlan
      return null
    }

    const planA: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }
    const planB: SlidePlan = { pages: [{ from: 0, to: 2, top: 0 }], scales: [1, 1] }

    const deck = ['Slide A', 'Slide B']
    const rendered = renderElement(createElement(TestHarness, { hashes: deck.map((slide) => hashContent(slide)) }))
    act(() => {
      reportPlanFn(0, planA)
      reportPlanFn(1, planB)
    })

    expect(latestPlans[0]).toBe(planA)
    expect(latestPlans[1]).toBe(planB)

    const modified = ['Slide A modified', 'Slide B']
    rendered.rerender(createElement(TestHarness, { hashes: modified.map((slide) => hashContent(slide)) }))

    expect(latestPlans[0]).toBeUndefined()
    expect(latestPlans[1]).toBe(planB)
    rendered.unmount()
  })
})

describe('subscribeSlideHtmlKey fine-grained subscription', () => {
  it('triggers only listeners matching the updated cacheKey', () => {
    const fnKey1 = vi.fn()
    const fnKey2 = vi.fn()

    const unsub1 = subscribeSlideHtmlKey('key-1', fnKey1)
    const unsub2 = subscribeSlideHtmlKey('key-2', fnKey2)

    rememberSlideHtml('key-1', { html: '<p>slide 1</p>', fences: createFenceBodies() })

    expect(fnKey1).toHaveBeenCalledTimes(1)
    expect(fnKey2).not.toHaveBeenCalled()

    rememberSlideHtml('key-2', { html: '<p>slide 2</p>', fences: createFenceBodies() })

    expect(fnKey1).toHaveBeenCalledTimes(1)
    expect(fnKey2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()

    rememberSlideHtml('key-1', { html: '<p>slide 1 updated</p>', fences: createFenceBodies() })
    expect(fnKey1).toHaveBeenCalledTimes(1)
  })
})

// N-23: the pass prepares one page per slide of the deck, and the cap that holds them used to be a
// fixed 60 — so a 70-page deck evicted its own beginning while it measured its end, and the rail
// re-rendered what had just been thrown away. The reservation is what lets the deck answer for its
// own size without pretending no ceiling exists.
describe('slideHtmlCache — how much of the deck it holds', () => {
  const page = (index: number) => ({ html: `<p>page ${index}</p>`, fences: createFenceBodies() })

  beforeEach(() => {
    clearSlideHtmlCache()
  })

  it('keeps every page once the deck has been declared', () => {
    reserveSlideCache(70)
    for (let index = 0; index < 70; index++) rememberSlideHtml(`deck:${index}`, page(index))
    expect(readSlideHtml('deck:0')).toBeTruthy()
    expect(readSlideHtml('deck:69')).toBeTruthy()
  })

  it('still evicts at the floor for a deck it was never told about', () => {
    reserveSlideCache(1)
    for (let index = 0; index < 70; index++) rememberSlideHtml(`floor:${index}`, page(index))
    expect(readSlideHtml('floor:0')).toBeUndefined()
    expect(readSlideHtml('floor:69')).toBeTruthy()
  })

  // The plan cache is the other half: a plan is a small array rather than a page of markup, so its
  // floor is higher, but a deck longer than that floor still needs the same reservation.
  it('keeps every plan of a deck longer than that floor', () => {
    reserveSlideCache(130)
    for (let index = 0; index < 130; index++) rememberSlidePlan(`plan:${index}`, { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] })
    expect(readSlidePlan('plan:0')).toBeTruthy()
    expect(readSlidePlan('plan:129')).toBeTruthy()
  })

  it('shrinks back down for the next show instead of holding the widest deck all day', () => {
    reserveSlideCache(70)
    for (let index = 0; index < 70; index++) rememberSlideHtml(`again:${index}`, page(index))
    reserveSlideCache(1)
    rememberSlideHtml('again:70', page(70))
    expect(readSlideHtml('again:0')).toBeUndefined()
  })
})

// The reservation is only worth what the show makes it worth: the deck has to be the one that asks.
describe('a running show reserves cache room for its own deck', () => {
  it('keeps its first page prepared while the last one is being measured', () => {
    const deck = Array.from({ length: 70 }, (_, index) => `# Slide ${index + 1}`).join('\n\n---\n\n')
    useNotes.setState({ notes: { 'note-reserved': noteSummary('note-reserved', { title: 'Long deck' }) }, contents: { 'note-reserved': deck } })
    usePresentation.setState({ open: true, noteId: 'note-reserved', title: 'Long deck', snapshot: deck, following: false, initialSlideIndex: 0 })
    const view = renderElement(createElement(PresentationOverlay))

    for (let index = 0; index < 70; index++) rememberSlideHtml(`reserved:${index}`, { html: `<p>${index}</p>`, fences: createFenceBodies() })

    expect(readSlideHtml('reserved:0')).toBeTruthy()
    view.unmount()
  })
})
