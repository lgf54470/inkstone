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

// Deterministic pseudo-random decks: a 32-bit LCG, so a failing case is
// reproducible from its seed without adding a property-testing dependency.
function lcg(seed: number): (max: number) => number {
  let state = seed
  return (max: number) => {
    state = (Math.imul(state, 1103515245) + 12345) | 0
    return ((state >>> 0) / 4294967296) * max
  }
}

// Tops accumulate from the final heights: a fixture whose offsets disagree with
// its heights measures a layout that cannot exist.
function stackHeights(heights: number[], headings: boolean[]): SlideBlock[] {
  let top = 0
  return heights.map((height, index) => {
    const block = { top, height, heading: headings[index] === true }
    top += height
    return block
  })
}

function generatedDeck(seed: number, count: number): SlideBlock[] {
  const next = lcg(seed)
  return stackHeights(
    Array.from({ length: count }, () => Math.round(20 + next(700))),
    Array.from({ length: count }, () => next(1) > 0.7),
  )
}

function headingDenseDeck(seed: number, count: number): SlideBlock[] {
  const next = lcg(seed)
  return stackHeights(
    Array.from({ length: count }, () => Math.round(20 + next(700))),
    Array.from({ length: count }, (_unused, index) => index % 2 === 0),
  )
}

// Every block fits a page on its own and no heading forces an early break, so
// white space on these decks is waste rather than layout intent.
function packableDeck(seed: number, count: number): SlideBlock[] {
  const next = lcg(seed)
  return stackHeights(
    Array.from({ length: count }, () => Math.round(40 + next(300))),
    Array.from({ length: count }, () => false),
  )
}

function spanOf(blocks: SlideBlock[]): number {
  if (blocks.length === 0) return 0
  const last = blocks[blocks.length - 1]!
  return last.top + last.height - blocks[0]!.top
}

// The regression this guards: a break rule that is too eager silently turns one
// slide into several half-empty pages. Counting pages against `ceil(span / page)`
// is not a valid ceiling — a subsection and an atomic oversized block each own a
// page on purpose — so the budget is expressed as the white space a page may
// leave, which is where the waste would actually show up.
describe('planSlidePages — no avoidable blank space', () => {
  const LIMIT = 640

  it('fills every page but the last to within one block of the canvas', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const blocks = packableDeck(seed, 9)
      const maxBlock = Math.max(...blocks.map((block) => block.height))
      expect(maxBlock).toBeLessThan(LIMIT)
      const plan = planSlidePages(blocks, LIMIT)
      plan.pages.slice(0, -1).forEach((page, index) => {
        const used = blocks[page.to - 1]!.top + blocks[page.to - 1]!.height - page.top
        expect(used, `seed ${seed} page ${index}`).toBeGreaterThan(LIMIT - maxBlock)
      })
      // Sound consequence of the same bound: each page but the last is more than
      // `LIMIT - maxBlock` tall, so the deck cannot need more pages than that allows.
      expect((plan.pages.length - 1) * (LIMIT - maxBlock), `seed ${seed}`).toBeLessThan(spanOf(blocks))
    }
  })

  it('starts every page after the first at a heading or a block that did not fit', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const blocks of [generatedDeck(seed, 9), headingDenseDeck(seed, 12)]) {
        const plan = planSlidePages(blocks, 480)
        plan.pages.forEach((page, index) => {
          if (index === 0) return
          const previous = plan.pages[index - 1]!
          const first = blocks[page.from]!
          const fitsOnPreviousPage = first.top + first.height - previous.top <= 480
          // A page may only start early to keep a subsection whole, never to leave white space.
          expect(Boolean(first.heading) || !fitsOnPreviousPage, `seed ${seed} page ${index}`).toBe(true)
        })
      }
    }
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
