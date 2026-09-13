// Block-level pagination for a slide that does not fit its canvas. Kept as a pure
// function because the packing rules (subsection-aligned breaks, oversized blocks
// shrinking instead of clipping) are the part worth testing — the DOM hook only
// measures blocks and applies the plan.
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
}

export function planSlidePages(blocks: SlideBlock[], contentHeight: number): SlidePlan {
  const limit = Math.max(contentHeight, 1)
  const scales = blocks.map(() => 1)
  if (blocks.length === 0) return { pages: [{ from: 0, to: 0, top: 0 }], scales }
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
  return { pages, scales }
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
