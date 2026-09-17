import { describe, expect, it } from 'vitest'
import { spacingSnap } from './spacing'
import { type SnapBox } from './snap'

function box(x: number, y: number, w = 100, h = 100): SnapBox {
  return { x, y, w, h }
}

/** Where a spacing guide wants to be drawn, which is how these rules are read. */
interface Seen {
  axis: string
  size: number
  at: number
  from: number
  to: number
}

function guides(result: ReturnType<typeof spacingSnap>): Seen[] {
  return result.guides.map((guide) => ({
    axis: guide.axis,
    size: guide.size ?? 0,
    at: guide.at,
    from: guide.span?.from ?? 0,
    to: guide.span?.to ?? 0,
  }))
}

/** A row along y = 0…100, which is what puts these boxes in one band. */
const ROW = 0

describe('a box between two others', () => {
  const left = box(100, ROW)
  const right = box(384, ROW)

  it('lands on the exact middle of the room it has, and reports both gaps at that width', () => {
    // 200…384 of room with a 100-wide box in it: gaps of 40 and 44, and 42 apiece once even.
    const result = spacingSnap({ moving: box(240, ROW), others: [left, right] })
    expect(result.dx).toBe(2)
    expect(guides(result)).toEqual([
      { axis: 'x', size: 42, at: 50, from: 200, to: 242 },
      { axis: 'x', size: 42, at: 50, from: 342, to: 384 },
    ])
  })

  it('leaves an already even box alone, and still says the gaps out loud', () => {
    const result = spacingSnap({ moving: box(250, ROW), others: [left, box(400, ROW)] })
    expect(result.dx).toBe(0)
    expect(guides(result).map((guide) => guide.size)).toEqual([50, 50])
  })

  it('says nothing when the two gaps are too far apart to be the same question', () => {
    const result = spacingSnap({ moving: box(220, ROW), others: [left, box(400, ROW)] })
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('judges the axis it was asked about, and leaves the other to its own rule', () => {
    const above = box(300, 100)
    const below = box(300, 384)
    const result = spacingSnap({ moving: box(300, 240), others: [above, below] })
    expect(result.dy).toBe(2)
    expect(result.dx).toBe(0)
    expect(guides(result)).toEqual([
      { axis: 'y', size: 42, at: 350, from: 200, to: 242 },
      { axis: 'y', size: 42, at: 350, from: 342, to: 384 },
    ])
  })
})

describe('copying a gap a row already shares', () => {
  const first = box(100, ROW)
  const second = box(260, ROW)

  it('lands the box 60 from its neighbour, the width the row already uses', () => {
    // The row's own gap is 60 (200…260); the moving box is 56 away, inside the threshold.
    const result = spacingSnap({ moving: box(416, ROW), others: [first, second] })
    expect(result.dx).toBe(4)
    expect(guides(result)).toEqual([
      { axis: 'x', size: 60, at: 50, from: 360, to: 420 },
      { axis: 'x', size: 60, at: 50, from: 200, to: 260 },
    ])
  })

  it('leaves a gap alone when it is nowhere near the width the row uses', () => {
    const result = spacingSnap({ moving: box(700, ROW), others: [first, second] })
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('says nothing when the only box in the band is on another row', () => {
    const result = spacingSnap({ moving: box(416, 400), others: [first, second] })
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('takes the nearer of two widths the row already uses', () => {
    // The row reads 200…260 and 360…520: 60 and 160. The box is 58 from the second pair member.
    const third = box(520, ROW)
    const result = spacingSnap({ moving: box(418, ROW), others: [first, second, third] })
    expect(result.dx).toBe(2)
    expect(result.guides.map((guide) => guide.size)).toEqual([60, 60])
  })
})
