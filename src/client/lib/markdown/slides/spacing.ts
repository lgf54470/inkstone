import { SNAP_THRESHOLD, type SnapBox, type SnapGuide, type SnapResult } from './snap'

type Axis = 'x' | 'y'

/** Where a box starts and ends along one axis. */
interface Span {
  from: number
  to: number
}

/**
 * The even spacing a drag is judged against, which is the other half of lining a box up: edges
 * answer "is this box in line with that one", and gaps answer "is this box as far from its
 * neighbour as those two are from each other".
 *
 * Two rules, in the order a reader means them:
 *
 * 1. **Split evenly** — the box is between two boxes in the same band, and the two gaps are
 *    already near enough equal that the reader is asking for them to be. The drag lands on the
 *    exact middle of the room it has, and both gaps are drawn with the width they now share.
 * 2. **Copy a gap** — one neighbour, and a gap between two other boxes in that band is within
 *    reach of the one being made. The drag lands on that width, and both gaps are drawn: the one
 *    that is being copied, and the one being made.
 *
 * A band is the boxes that overlap the moving one across the axis being judged — the row it is
 * being lined up in. Nothing here looks at the page: a gap is a relation between boxes, and the
 * page's own lines already have the page's own answer (snap.ts).
 */
export function spacingSnap(input: { moving: SnapBox; others: SnapBox[]; threshold?: number }): SnapResult {
  const { moving, others, threshold = SNAP_THRESHOLD } = input
  const hints = (['x', 'y'] as const).map((axis) => axisHint(moving, others, axis, threshold))
  return {
    dx: hints[0]?.delta ?? 0,
    dy: hints[1]?.delta ?? 0,
    guides: hints.flatMap((hint) => hint?.guides ?? []),
  }
}

interface AxisHint {
  delta: number
  guides: SnapGuide[]
}

function axisHint(moving: SnapBox, others: SnapBox[], axis: Axis, threshold: number): AxisHint | null {
  const band = others.filter((box) => overlaps(cross(box, axis), cross(moving, axis)))
  if (band.length === 0) return null
  const move = span(moving, axis)
  const before = nearestBefore(band, move.from, axis)
  const after = nearestAfter(band, move.to, axis)

  if (before && after) {
    const split = splitHint(moving, before, after, axis, threshold)
    if (split) return split
  }
  for (const mate of [before, after]) {
    if (!mate) continue
    const copied = copyHint(moving, band, mate, axis, threshold)
    if (copied) return copied
  }
  return null
}

/** The gaps on either side of a box that sits between two others, made exactly equal. */
function splitHint(
  moving: SnapBox,
  before: SnapBox,
  after: SnapBox,
  axis: Axis,
  threshold: number,
): AxisHint | null {
  const own = span(moving, axis)
  const left = own.from - span(before, axis).to
  const right = span(after, axis).from - own.to
  if (left <= 0 || right <= 0 || Math.abs(left - right) > threshold) return null

  // Half of the room the box has between its two neighbours: the one position where both gaps
  // are the same width, and so the one the reader is asking for.
  const gap = (span(after, axis).from - span(before, axis).to - size(moving, axis)) / 2
  const delta = span(before, axis).to + gap - own.from
  const from = own.from + delta
  return {
    delta,
    guides: [
      gapGuide(axis, crossAt(moving, axis), span(before, axis).to, from, gap),
      gapGuide(axis, crossAt(moving, axis), from + size(moving, axis), span(after, axis).from, gap),
    ],
  }
}

/** The gap next to one neighbour, made as wide as a gap two other boxes in the band already share. */
function copyHint(
  moving: SnapBox,
  band: SnapBox[],
  mate: SnapBox,
  axis: Axis,
  threshold: number,
): AxisHint | null {
  const own = span(moving, axis)
  const mateSpan = span(mate, axis)
  const isMateBefore = mateSpan.to <= own.from
  const gap = isMateBefore ? own.from - mateSpan.to : mateSpan.from - own.to
  if (gap <= 0) return null

  const source = nearestGap(band, axis, gap)
  if (!source || Math.abs(gap - source.size) > threshold) return null

  const delta = isMateBefore ? source.size - gap : gap - source.size
  const from = own.from + delta
  const start = isMateBefore ? mateSpan.to : from + size(moving, axis)
  const end = isMateBefore ? from : mateSpan.from
  return {
    delta,
    guides: [
      gapGuide(axis, crossAt(moving, axis), start, end, source.size),
      // The gap being copied, left where it is: it is what explains the number above.
      gapGuide(axis, source.at, source.from, source.to, source.size),
    ],
  }
}

/**
 * The gap between two boxes of the band that is nearest in width to the one being made. A gap the
 * moving box is sitting inside is left out of this by construction rather than by a check: that
 * gap is its own width plus the two gaps beside it, so it is always further from the candidate
 * than the candidate is from zero — which is the one thing a threshold can never bridge.
 */
function nearestGap(band: SnapBox[], axis: Axis, gap: number): (Span & { size: number; at: number }) | null {
  let best: (Span & { size: number; at: number }) | null = null
  for (const before of band) {
    for (const after of band) {
      const from = span(before, axis).to
      const to = span(after, axis).from
      if (to <= from) continue
      const size = to - from
      if (best && Math.abs(gap - best.size) <= Math.abs(gap - size)) continue
      best = { from, to, size, at: (crossAt(before, axis) + crossAt(after, axis)) / 2 }
    }
  }
  return best
}

function gapGuide(
  axis: Axis,
  at: number,
  from: number,
  to: number,
  size: number,
): SnapGuide {
  return { axis, at, source: 'spacing', span: { from, to }, size }
}

function span(box: SnapBox, axis: Axis): Span {
  return axis === 'x' ? { from: box.x, to: box.x + box.w } : { from: box.y, to: box.y + box.h }
}

function cross(box: SnapBox, axis: Axis): Span {
  return axis === 'x' ? { from: box.y, to: box.y + box.h } : { from: box.x, to: box.x + box.w }
}

function size(box: SnapBox, axis: Axis): number {
  return axis === 'x' ? box.w : box.h
}

function crossAt(box: SnapBox, axis: Axis): number {
  const across = cross(box, axis)
  return (across.from + across.to) / 2
}

/** Two boxes share a band when their spans across the axis being judged overlap at all. */
function overlaps(a: Span, b: Span): boolean {
  return a.from < b.to && b.from < a.to
}

/** The band's box that ends nearest to `edge` without crossing it. */
function nearestBefore(band: SnapBox[], edge: number, axis: Axis): SnapBox | null {
  let best: SnapBox | null = null
  let bestTo = -Infinity
  for (const box of band) {
    const at = span(box, axis).to
    if (at > edge || at <= bestTo) continue
    bestTo = at
    best = box
  }
  return best
}

/** The band's box that starts nearest to `edge` without crossing it. */
function nearestAfter(band: SnapBox[], edge: number, axis: Axis): SnapBox | null {
  let best: SnapBox | null = null
  let bestFrom = Infinity
  for (const box of band) {
    const at = span(box, axis).from
    if (at < edge || at >= bestFrom) continue
    bestFrom = at
    best = box
  }
  return best
}
