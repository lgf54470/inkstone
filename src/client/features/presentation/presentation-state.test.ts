import { describe, expect, it } from 'vitest'
import { entryIndexOf, nextSliceGap, nextSlicePace, nextUnmeasuredSlide, presentedNoteContent, railEntries, railOpenFor } from './presentation-state'
import type { SlidePlan } from './slide-pagination'

const planOf = (pages: number): SlidePlan => ({
  pages: Array.from({ length: pages }, (_, index) => ({ from: index, to: index + 1, top: index * 100 })),
  scales: Array.from({ length: pages }, () => 1),
})

describe('presentedNoteContent — following', () => {
  it('presents the live note while following', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '# Opening\n\nRevised', noteExists: true })).toBe('# Opening\n\nRevised')
  })

  it('keeps the snapshot until the note body has loaded', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: undefined, noteExists: true })).toBe('# Opening')
  })

  it('falls back to the snapshot when the note is gone instead of blanking the projector', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '', noteExists: false })).toBe('# Opening')
  })

  it('still presents an empty note that exists, so clearing the script clears the slides', () => {
    expect(presentedNoteContent({ following: true, snapshot: '# Opening', live: '', noteExists: true })).toBe('')
  })

  it('ignores live edits once frozen', () => {
    expect(presentedNoteContent({ following: false, snapshot: '# Frozen', live: '# Revised', noteExists: true })).toBe('# Frozen')
  })
})

describe('railEntries', () => {
  it('lists one page per slide when every slide fits its canvas', () => {
    expect(railEntries(3, { 0: planOf(1), 1: planOf(1), 2: planOf(1) })).toEqual([
      { slide: 0, sub: 0, pageCount: 1 },
      { slide: 1, sub: 0, pageCount: 1 },
      { slide: 2, sub: 0, pageCount: 1 },
    ])
  })

  it('lists every page of a slide that paginates, so a one-slide note is not a one-entry list', () => {
    const entries = railEntries(1, { 0: planOf(14) })
    expect(entries).toHaveLength(14)
    expect(entries[0]).toEqual({ slide: 0, sub: 0, pageCount: 14 })
    expect(entries[13]).toEqual({ slide: 0, sub: 13, pageCount: 14 })
  })

  it('keeps an unmeasured slide as its own floor of one entry', () => {
    const entries = railEntries(2, { 0: planOf(3) })
    expect(entries).toEqual([
      { slide: 0, sub: 0, pageCount: 3 },
      { slide: 0, sub: 1, pageCount: 3 },
      { slide: 0, sub: 2, pageCount: 3 },
      { slide: 1, sub: 0, pageCount: 1 },
    ])
  })

  it('numbers pages in the order the arrow keys walk them', () => {
    const entries = railEntries(2, { 0: planOf(2), 1: planOf(2) })
    expect(entries.map((entry) => `${entry.slide}.${entry.sub}`)).toEqual(['0.0', '0.1', '1.0', '1.1'])
  })
})

describe('entryIndexOf', () => {
  it('finds the page the show is on', () => {
    const entries = railEntries(2, { 0: planOf(2), 1: planOf(3) })
    expect(entryIndexOf(entries, 1, 2)).toBe(4)
  })

  it('falls back to the slide when a re-measure removed that page', () => {
    const entries = railEntries(2, { 0: planOf(2), 1: planOf(1) })
    expect(entryIndexOf(entries, 1, 5)).toBe(2)
  })

  it('reports no match for a slide the list has not reached', () => {
    expect(entryIndexOf(railEntries(1, { 0: planOf(1) }), 3, 0)).toBe(-1)
  })
})

describe('nextUnmeasuredSlide', () => {
  it('walks the deck in order so the list fills top-down', () => {
    expect(nextUnmeasuredSlide(4, [0, 1], 0)).toBe(2)
    expect(nextUnmeasuredSlide(4, [], 0)).toBe(0)
  })

  it('skips the slides that already have a plan and the ones a stalled measure gave up on', () => {
    expect(nextUnmeasuredSlide(5, [0, 2, 3], 0)).toBe(1)
    expect(nextUnmeasuredSlide(3, [0, 1, 2], 0)).toBeNull()
  })

  it('reports the pass as finished once every slide is measured', () => {
    expect(nextUnmeasuredSlide(0, [], 0)).toBeNull()
    expect(nextUnmeasuredSlide(2, [0, 1], 1)).toBeNull()
  })
})

describe('nextSliceGap', () => {
  it('waits longer than the last slice cost, so the pass keeps a fixed share of the thread', () => {
    expect(nextSliceGap(80, 4, 120)).toBe(240)
    expect(nextSliceGap(300, 4, 120)).toBe(900)
  })

  it('keeps a floor so cheap slices cannot cluster into a busy stretch', () => {
    expect(nextSliceGap(5, 4, 120)).toBe(120)
    expect(nextSliceGap(0, 4, 120)).toBe(120)
  })

  it('treats a pass that gave up as the floor rather than an infinite wait', () => {
    expect(nextSliceGap(-1, 4, 120)).toBe(120)
  })
})

describe('nextSlicePace', () => {
  it('stretches the gap after one that dropped frames', () => {
    expect(nextSlicePace(1, 0, 4)).toBe(2)
    expect(nextSlicePace(2, 0, 4)).toBe(4)
  })

  it('holds the stretched pace until the display has been quiet for two gaps', () => {
    expect(nextSlicePace(2, 1, 4)).toBe(2)
    expect(nextSlicePace(2, 2, 4)).toBe(1)
  })

  it('never goes below the gap the slice cost implies', () => {
    expect(nextSlicePace(1, 2, 4)).toBe(1)
    expect(nextSlicePace(1, 5, 4)).toBe(1)
  })

  it('bounds how far a busy stretch can slow the list down', () => {
    expect(nextSlicePace(4, 0, 4)).toBe(4)
    expect(nextSlicePace(4, 3, 4)).toBe(2)
  })
})

describe('railOpenFor', () => {
  it('follows the viewport until the presenter chooses', () => {
    expect(railOpenFor(null, true)).toBe(true)
    expect(railOpenFor(null, false)).toBe(false)
  })

  it('lets an explicit choice outlive a viewport change', () => {
    expect(railOpenFor(true, false)).toBe(true)
    expect(railOpenFor(false, true)).toBe(false)
  })
})
