// Block-level pagination for a slide that does not fit its canvas. Kept as a pure
// function because the packing rules (subsection-aligned breaks, oversized blocks
// shrinking instead of clipping, a column slide staying whole) are the part worth
// testing — the DOM hook only measures blocks and applies the plan.
import type { SlideLayout } from './slides'

export interface SlideBlock {
  top: number
  height: number
  heading: boolean
}

export interface SlidePage {
  from: number
  to: number
  top: number
}

export interface SlidePlan {
  pages: SlidePage[]
  /** Per-block shrink factor for a block that alone exceeds one page. */
  scales: number[]
  /**
   * The layout the slide was measured under, which is the layout every surface then draws it in.
   * This is the plan's answer rather than the author's switch because a switch can be refused: a
   * column slide whose balanced columns still exceed the page is measured as a flow slide, and a
   * thumbnail or a printed page that drew the columns anyway would slice pages out of a geometry
   * the projector never used.
   */
  layout?: SlideLayout
}

export function planSlidePages(blocks: SlideBlock[], contentHeight: number, layout?: SlideLayout): SlidePlan {
  const limit = Math.max(contentHeight, 1)
  const scales = blocks.map(() => 1)
  if (blocks.length === 0) return { pages: [{ from: 0, to: 0, top: 0 }], scales, layout }
  // Two columns fit a slide by balancing its blocks across both, so its blocks no longer form the
  // single vertical flow the walk below reads — each column starts at the top again, and a page
  // picked out of those tops would hide blocks that are beside each other. The whole slide stays on
  // one page, which is only sound for a slide the caller has already measured as fitting the page.
  if (layout === 'split') return { pages: [{ from: 0, to: blocks.length, top: 0 }], scales, layout }
  const pages: SlidePage[] = []
  let from = 0
  while (from < blocks.length) {
    const pageTop = from === 0 ? 0 : Math.max(blocks[from]!.top, 0)
    let to = from + 1
    while (to < blocks.length && blocks[to]!.top + blocks[to]!.height - pageTop <= limit) to++
    if (to < blocks.length) to = breakIndex(blocks, from, to)
    const first = blocks[from]!
    if (first.height > limit) scales[from] = limit / first.height
    pages.push({ from, to, top: pageTop })
    from = to
  }
  return { pages, scales, layout }
}

// Two columns are a way of fitting the page, not a way of overflowing it more slowly: a slide whose
// balanced columns still exceed the page keeps the flow layout, which is the geometry the page walk
// reads and the only one that reaches every block. `hostHeight` is the host's own box, which under
// a column layout is the height of the taller column.
export function slideLayoutForFit(layout: SlideLayout | undefined, hostHeight: number, contentHeight: number): SlideLayout | undefined {
  return layout === 'split' && hostHeight > Math.max(contentHeight, 1) ? undefined : layout
}

// Where the overflowing page has to end. A heading inside the page wins, so each
// page starts at a subsection rather than splitting one across pages; the largest
// such index keeps the page as full as possible. Falling back to the overflowing
// block itself is always safe because `to > from`.
function breakIndex(blocks: SlideBlock[], from: number, to: number): number {
  for (let index = to; index > from; index--) {
    if (blocks[index]!.heading) return index
  }
  return to
}

export function resolvePageIndex(plan: SlidePlan, subPage: number): number {
  return Math.min(Math.max(subPage, 0), Math.max(plan.pages.length - 1, 0))
}

// Plans are compared by value because a re-measure usually produces the same plan:
// keeping the previous object identity is what lets consumers memoize on it. The
// layout is part of the value — a slide that lost or gained its columns between two
// measures with otherwise identical pages has to be republished.
export function samePlan(a: SlidePlan | undefined, b: SlidePlan): boolean {
  if (!a || a.pages.length !== b.pages.length || a.scales.length !== b.scales.length) return false
  if (a.layout !== b.layout) return false
  const pages = a.pages.every((page, index) => {
    const other = b.pages[index]
    return Boolean(other) && page.from === other.from && page.to === other.to && page.top === other.top
  })
  return pages && a.scales.every((scale, index) => scale === b.scales[index])
}
