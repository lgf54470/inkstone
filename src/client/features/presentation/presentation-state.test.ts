import { describe, expect, it, vi } from 'vitest'
import { entryIndexOf, escapeAction, formatMicroPage, interceptSlideLink, nextSliceGap, nextSlicePace, nextUnmeasuredSlide, overviewMove, presentedNoteContent, railEntries, railOpenFor, stageClickDirection, swipeDirection } from './presentation-state'
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

describe('escapeAction', () => {
  it('exits fullscreen when presentation is fullscreen to prevent accidental dismissal', () => {
    expect(escapeAction({ fullscreen: true, laser: false, overview: false })).toBe('exitFullscreen')
  })

  it('closes presentation overlay when presentation is in windowed mode', () => {
    expect(escapeAction({ fullscreen: false, laser: false, overview: false })).toBe('close')
  })

  it('puts the laser out before it costs the talk a screen or the show', () => {
    expect(escapeAction({ fullscreen: true, laser: true, overview: false })).toBe('clearLaser')
    expect(escapeAction({ fullscreen: false, laser: true, overview: false })).toBe('clearLaser')
  })

  // Three booleans read as nothing in a call, and the order of the ladder is the whole rule: the
  // names are what keep a future rung from being inserted under the wrong one.
  it('puts the overview away first, since it is the screen the presenter is looking at', () => {
    expect(escapeAction({ fullscreen: true, laser: true, overview: true })).toBe('closeOverview')
    expect(escapeAction({ fullscreen: false, laser: false, overview: true })).toBe('closeOverview')
  })
})

describe('overviewMove', () => {
  it('walks the row with the horizontal keys', () => {
    expect(overviewMove('ArrowRight', 4, 12, 4)).toBe(5)
    expect(overviewMove('ArrowLeft', 4, 12, 4)).toBe(3)
  })

  it('walks the column by the row length the grid was painted with', () => {
    expect(overviewMove('ArrowDown', 1, 12, 4)).toBe(5)
    expect(overviewMove('ArrowUp', 5, 12, 4)).toBe(1)
  })

  it('holds the edges instead of leaving the grid', () => {
    expect(overviewMove('ArrowLeft', 0, 12, 4)).toBe(0)
    expect(overviewMove('ArrowRight', 11, 12, 4)).toBe(11)
    expect(overviewMove('ArrowUp', 1, 12, 4)).toBe(0)
    expect(overviewMove('ArrowDown', 11, 12, 4)).toBe(11)
  })

  it('jumps to the deck ends with Home and End', () => {
    expect(overviewMove('Home', 7, 12, 4)).toBe(0)
    expect(overviewMove('End', 7, 12, 4)).toBe(11)
  })

  it('leaves a key the grid does not own to the show', () => {
    expect(overviewMove('PageDown', 7, 12, 4)).toBeNull()
    expect(overviewMove('Enter', 7, 12, 4)).toBeNull()
  })

  it('has nowhere to move in a grid with no cards', () => {
    expect(overviewMove('ArrowRight', 0, 0, 4)).toBeNull()
  })
})

describe('stageClickDirection', () => {
  it('goes previous on the left 35% of the stage', () => {
    expect(stageClickDirection(0, 1000)).toBe('prev')
    expect(stageClickDirection(349, 1000)).toBe('prev')
  })

  it('goes next on the right 65% of the stage', () => {
    expect(stageClickDirection(350, 1000)).toBe('next')
    expect(stageClickDirection(999, 1000)).toBe('next')
  })
})

describe('swipeDirection', () => {
  it('goes next when swiping left past threshold', () => {
    expect(swipeDirection(-60, 50)).toBe('next')
  })

  it('goes prev when swiping right past threshold', () => {
    expect(swipeDirection(60, 50)).toBe('prev')
  })

  it('ignores minor movement below threshold', () => {
    expect(swipeDirection(-20, 50)).toBeNull()
    expect(swipeDirection(20, 50)).toBeNull()
  })
})

describe('formatMicroPage', () => {
  it('formats normal slide numbers with leading zeros', () => {
    expect(formatMicroPage(3, 28)).toBe('04 / 28')
    expect(formatMicroPage(0, 5)).toBe('01 / 05')
  })

  it('includes sub-page indicator when slide has multiple pages', () => {
    expect(formatMicroPage(3, 28, 1, 3)).toBe('04 / 28 (2/3)')
  })

  it('handles empty count gracefully', () => {
    expect(formatMicroPage(0, 0)).toBe('')
  })
})

describe('interceptSlideLink', () => {
  it('opens safe external https and http links in new window', () => {
    const openMock = vi.fn()
    const result = interceptSlideLink('https://example.com/talk', openMock)
    expect(result).toBe(true)
    expect(openMock).toHaveBeenCalledWith('https://example.com/talk', '_blank', 'noopener,noreferrer')
  })

  it('opens mailto links in new window', () => {
    const openMock = vi.fn()
    const result = interceptSlideLink('mailto:speaker@example.com', openMock)
    expect(result).toBe(true)
    expect(openMock).toHaveBeenCalledWith('mailto:speaker@example.com', '_blank', 'noopener,noreferrer')
  })

  it('rejects hash jumps and does not open window', () => {
    const openMock = vi.fn()
    expect(interceptSlideLink('#slide-heading', openMock)).toBe(false)
    expect(interceptSlideLink('#', openMock)).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('rejects unsafe protocols like javascript:', () => {
    const openMock = vi.fn()
    expect(interceptSlideLink('javascript:alert(1)', openMock)).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })

  it('rejects empty and null links', () => {
    const openMock = vi.fn()
    expect(interceptSlideLink('', openMock)).toBe(false)
    expect(interceptSlideLink(null, openMock)).toBe(false)
    expect(interceptSlideLink(undefined, openMock)).toBe(false)
    expect(openMock).not.toHaveBeenCalled()
  })
})

