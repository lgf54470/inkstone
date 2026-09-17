import type { PageSize } from './page'

/** A rectangle in page pixels, which is the space every element is written in. */
export interface SnapBox {
  x: number
  y: number
  w: number
  h: number
}

/** What a line came from, which is also how it is drawn differently from the others. */
export type SnapSource = 'element' | 'page' | 'margin'

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Where the line sits on the page, in page pixels. */
  at: number
  source: SnapSource
}

export interface SnapResult {
  /** What to add to the proposed move for it to land on the line it was near. */
  dx: number
  dy: number
  /** The lines that produced that answer, so the surface can show why the box stopped there. */
  guides: SnapGuide[]
}

/** How near a proposed edge has to be, in page pixels, before it is taken as aimed at the line. */
export const SNAP_THRESHOLD = 6

/**
 * The page's own inset, as a share of the page rather than a pixel count: the built-in layouts
 * author their content at 120 of 1600 (layouts.ts), and a deck that chooses another page should
 * keep the same proportion rather than the same pixels.
 */
export const SNAP_MARGIN_RATIO = 120 / 1600

/** The tightest rectangle holding every box, or null when there is nothing to hold. */
export function unionBox(boxes: SnapBox[]): SnapBox | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w))
  const bottom = Math.max(...boxes.map((box) => box.y + box.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

interface Line {
  at: number
  source: SnapSource
}

/**
 * What a drag lines up with: the boxes already on the page (each one's two edges and its centre),
 * the page's own edges and centre, and its margin on both sides.
 *
 * The moving box offers its own left, centre and right (top, middle and bottom on the other
 * axis), and the nearest pair within the threshold wins. Each axis is decided on its own, so a
 * box can align its left edge with one box and its middle with another — which is how a reader
 * nudges something into a column without touching the other axis.
 *
 * A rotation is not folded in: the boxes are the axis-aligned frames the handles work in. Ties go
 * to whichever line was offered first, which is why the other elements are offered before the page
 * itself — landing on a neighbour is the more specific intent.
 */
export function snapMove(input: {
  moving: SnapBox
  others: SnapBox[]
  page: PageSize
  threshold?: number
}): SnapResult {
  const { moving, others, page, threshold = SNAP_THRESHOLD } = input
  const hitX = pickLine(
    [moving.x, moving.x + moving.w / 2, moving.x + moving.w],
    verticalLines(others, page),
    threshold,
  )
  const hitY = pickLine(
    [moving.y, moving.y + moving.h / 2, moving.y + moving.h],
    horizontalLines(others, page),
    threshold,
  )

  const guides: SnapGuide[] = []
  if (hitX) guides.push({ axis: 'x', at: hitX.line.at, source: hitX.line.source })
  if (hitY) guides.push({ axis: 'y', at: hitY.line.at, source: hitY.line.source })
  return { dx: hitX?.delta ?? 0, dy: hitY?.delta ?? 0, guides }
}

function verticalLines(others: SnapBox[], page: PageSize): Line[] {
  const margin = Math.round(page.width * SNAP_MARGIN_RATIO)
  return [
    ...others.flatMap((box) => [
      { at: box.x, source: 'element' as const },
      { at: box.x + box.w / 2, source: 'element' as const },
      { at: box.x + box.w, source: 'element' as const },
    ]),
    { at: 0, source: 'page' },
    { at: page.width / 2, source: 'page' },
    { at: page.width, source: 'page' },
    { at: margin, source: 'margin' },
    { at: page.width - margin, source: 'margin' },
  ]
}

function horizontalLines(others: SnapBox[], page: PageSize): Line[] {
  const margin = Math.round(page.height * SNAP_MARGIN_RATIO)
  return [
    ...others.flatMap((box) => [
      { at: box.y, source: 'element' as const },
      { at: box.y + box.h / 2, source: 'element' as const },
      { at: box.y + box.h, source: 'element' as const },
    ]),
    { at: 0, source: 'page' },
    { at: page.height / 2, source: 'page' },
    { at: page.height, source: 'page' },
    { at: margin, source: 'margin' },
    { at: page.height - margin, source: 'margin' },
  ]
}

/** The nearest line to any of the offered edges, or null when every line is out of reach. */
function pickLine(edges: number[], lines: Line[], threshold: number): { delta: number; line: Line } | null {
  let best: { delta: number; line: Line } | null = null
  for (const edge of edges) {
    for (const line of lines) {
      const delta = line.at - edge
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line }
    }
  }
  return best
}
