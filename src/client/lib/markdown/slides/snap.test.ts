import { describe, expect, it } from 'vitest'
import type { PageSize } from './page'
import { SNAP_MARGIN_RATIO, SNAP_THRESHOLD, snapMove, unionBox, type SnapBox } from './snap'

const PAGE: PageSize = { width: 1280, height: 720 }

/** The box every test in here lines up against, and 200 is a y its own lines are nowhere near. */
const NEIGHBOUR = box(300, 400, 200, 100)
const AWAY = 200

function box(x: number, y: number, w = 100, h = 50): SnapBox {
  return { x, y, w, h }
}

describe('the box a drag carries', () => {
  it('is the tightest rectangle around every box in the group', () => {
    expect(unionBox([box(100, 100), box(300, 200, 50, 50)])).toEqual({ x: 100, y: 100, w: 250, h: 150 })
    expect(unionBox([])).toBeNull()
  })
})

describe('lining a dragged box up with another box', () => {
  it('lands a left edge on the neighbour it was aimed at, and says which line did it', () => {
    const result = snapMove({ moving: box(297, AWAY), others: [NEIGHBOUR], page: PAGE })
    expect(result.dx).toBe(3)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([{ axis: 'x', at: 300, source: 'element' }])
  })

  it('lands a centre on a centre, and a right edge on a right edge', () => {
    const centred = snapMove({ moving: box(348, AWAY), others: [NEIGHBOUR], page: PAGE })
    // The moving centre is 398; the neighbour's centre is 400; its left edge is 300 — the
    // nearest pair inside the threshold is the centre, two pixels away.
    expect(centred.dx).toBe(2)
    expect(centred.guides).toEqual([{ axis: 'x', at: 400, source: 'element' }])

    const right = snapMove({ moving: box(497, AWAY), others: [NEIGHBOUR], page: PAGE })
    expect(right.dx).toBe(3)
    expect(right.guides).toEqual([{ axis: 'x', at: 500, source: 'element' }])
  })

  it('decides the two axes apart, so a box can take its left from a neighbour and its top from the page', () => {
    const result = snapMove({ moving: box(297, 3, 100, 60), others: [NEIGHBOUR], page: PAGE })
    expect([result.dx, result.dy]).toEqual([3, -3])
    expect(result.guides).toEqual([
      { axis: 'x', at: 300, source: 'element' },
      { axis: 'y', at: 0, source: 'page' },
    ])
  })

  it('takes the nearest line when two are both in reach', () => {
    // Left edges at 500 and 508, with the moving edge at 503: three pixels from the first and
    // five from the second, both inside the threshold.
    const result = snapMove({ moving: box(503, AWAY), others: [box(500, 400), box(508, 400)], page: PAGE })
    expect(result.dx).toBe(-3)
    expect(result.guides).toEqual([{ axis: 'x', at: 500, source: 'element' }])
  })

  it('lines a group up by the rectangle the whole group occupies', () => {
    // The two boxes span 302…440, and it is that union's left edge which meets the neighbour's
    // 300 — neither box's own edges are what the drag is lined up by.
    const group = unionBox([box(302, 120), box(340, 300)])
    expect(group).toEqual({ x: 302, y: 120, w: 138, h: 230 })
    const result = snapMove({ moving: group!, others: [NEIGHBOUR], page: PAGE })
    expect([result.dx, result.dy]).toEqual([-2, 0])
  })
})

describe('lining a dragged box up with the page', () => {
  it('leaves the move alone when every line is out of reach, and reports no line', () => {
    const result = snapMove({ moving: box(700, 250), others: [NEIGHBOUR], page: PAGE })
    expect([result.dx, result.dy]).toEqual([0, 0])
    expect(result.guides).toEqual([])
  })

  it('lines up with the page centre and its edges', () => {
    expect(snapMove({ moving: box(637, 250), others: [], page: PAGE })).toMatchObject({
      dx: 3,
      guides: [{ axis: 'x', at: 640, source: 'page' }],
    })
    expect(snapMove({ moving: box(3, 250), others: [], page: PAGE })).toMatchObject({ dx: -3 })
    expect(snapMove({ moving: box(1277, 250), others: [], page: PAGE })).toMatchObject({
      dx: 3,
      guides: [{ axis: 'x', at: 1280, source: 'page' }],
    })
  })

  it('offers the margin the built-in layouts author their content at', () => {
    const margin = Math.round(PAGE.width * SNAP_MARGIN_RATIO)
    expect(margin).toBe(96)

    const result = snapMove({ moving: box(margin + 4, 250), others: [], page: PAGE })
    expect(result.dx).toBe(-4)
    expect(result.guides).toEqual([{ axis: 'x', at: margin, source: 'margin' }])
  })

  it('obeys a threshold it was given rather than the default one', () => {
    const proposed = box(SNAP_THRESHOLD + 1, 700)
    expect(snapMove({ moving: proposed, others: [NEIGHBOUR], page: PAGE }).dx).toBe(0)
    expect(
      snapMove({ moving: box(297, 700), others: [NEIGHBOUR], page: PAGE, threshold: 1 }).dx,
    ).toBe(0)
  })
})
