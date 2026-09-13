import { describe, expect, it } from 'vitest'
import { planSlidePages, resolvePageIndex, type SlideBlock } from './slide-pagination'

function stack(entries: [number, boolean?][]): SlideBlock[] {
  let top = 0
  return entries.map(([height, heading]) => {
    const block = { top, height, heading: heading === true }
    top += height
    return block
  })
}

describe('planSlidePages — packing', () => {
  it('keeps a slide on one page while every block fits', () => {
    const plan = planSlidePages(stack([[100], [200], [300]]), 640)
    expect(plan.pages).toEqual([{ from: 0, to: 3, top: 0 }])
    expect(plan.scales).toEqual([1, 1, 1])
  })

  it('moves the overflowing block onto the next page', () => {
    const plan = planSlidePages(stack([[300], [300], [300]]), 640)
    expect(plan.pages).toEqual([
      { from: 0, to: 2, top: 0 },
      { from: 2, to: 3, top: 600 },
    ])
  })

  it('produces one page for an empty slide instead of zero pages', () => {
    expect(planSlidePages([], 640).pages).toEqual([{ from: 0, to: 0, top: 0 }])
  })
})

describe('planSlidePages — subsection alignment', () => {
  it('breaks before the following subsection heading so subsections stay whole', () => {
    // 12.3 + its chart, then 12.4 + its chart: the second chart cannot fit.
    const plan = planSlidePages(stack([[40, true], [400], [40, true], [400]]), 640)
    expect(plan.pages).toEqual([
      { from: 0, to: 2, top: 0 },
      { from: 2, to: 4, top: 440 },
    ])
  })

  it('never leaves a heading alone at the bottom of a page', () => {
    const plan = planSlidePages(stack([[40, true], [560], [40, true], [200]]), 640)
    expect(plan.pages).toEqual([
      { from: 0, to: 2, top: 0 },
      { from: 2, to: 4, top: 600 },
    ])
  })

  it('fills the page as far as it can when no heading follows on that page', () => {
    const plan = planSlidePages(stack([[40, true], [500], [500]]), 640)
    expect(plan.pages).toEqual([
      { from: 0, to: 2, top: 0 },
      { from: 2, to: 3, top: 540 },
    ])
  })
})

describe('planSlidePages — oversized blocks', () => {
  it('shrinks a block that alone exceeds the page instead of clipping or scrolling it', () => {
    const plan = planSlidePages(stack([[1280], [100]]), 640)
    expect(plan.scales[0]).toBeCloseTo(0.5)
    expect(plan.scales[1]).toBe(1)
    expect(plan.pages).toEqual([
      { from: 0, to: 1, top: 0 },
      { from: 1, to: 2, top: 1280 },
    ])
  })

  it('treats a non-positive page height as one pixel rather than dividing by zero', () => {
    const plan = planSlidePages(stack([[10]]), 0)
    expect(plan.scales[0]).toBe(0.1)
    expect(plan.pages).toEqual([{ from: 0, to: 1, top: 0 }])
  })
})

describe('planSlidePages — invariants', () => {
  it('covers every block exactly once across non-empty pages', () => {
    const blocks = stack([[40, true], [420], [300], [80, true], [700], [120], [260]])
    const plan = planSlidePages(blocks, 512)
    expect(plan.pages[0]!.from).toBe(0)
    expect(plan.pages.at(-1)!.to).toBe(blocks.length)
    plan.pages.forEach((page, index) => {
      expect(page.to).toBeGreaterThan(page.from)
      if (index > 0) expect(page.from).toBe(plan.pages[index - 1]!.to)
      expect(page.top).toBe(index === 0 ? 0 : blocks[page.from]!.top)
    })
  })

  it('keeps a page within the canvas unless its single block was shrunk', () => {
    const blocks = stack([[40, true], [300], [200], [40, true], [900], [150]])
    const plan = planSlidePages(blocks, 600)
    plan.pages.forEach((page) => {
      const bottom = page.from + 1 === page.to
        ? blocks[page.from]!.height * plan.scales[page.from]!
        : blocks[page.to - 1]!.top + blocks[page.to - 1]!.height - page.top
      expect(bottom).toBeLessThanOrEqual(600)
    })
  })
})

describe('resolvePageIndex', () => {
  it('clamps a sub-page into the current plan instead of rendering off-plan', () => {
    const plan = planSlidePages(stack([[300], [300], [300]]), 640)
    expect(resolvePageIndex(plan, 5)).toBe(1)
    expect(resolvePageIndex(plan, -3)).toBe(0)
    expect(resolvePageIndex(plan, 1)).toBe(1)
  })
})
