/**
 * Applies the split ratio of md-example / javascript-example blocks at runtime.
 *
 * Self-contained on purpose: the full parser (./markdown/split.ts) is part of the
 * SSR markdown barrel, which also pulls KaTeX, sanitize-html and Prism — none of
 * which belongs in the post page's client chunk. Keep this in sync with
 * src/lib/markdown/split.ts (same accepted values and axis rule).
 */

const RATIO_RE = /^(\d{1,3})\s*:\s*(\d{1,3})$/

function parseRatio(value: string): [number, number] | null {
  const match = RATIO_RE.exec(value.trim())
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2])
  if (first < 1 || first > 99 || second < 1 || second > 99) return null
  return [first, second]
}

function isVerticalLayout(layout: string): boolean {
  return layout === 'tb' || layout === 'bt'
}

export function applyExampleSplits(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.markdown-example-grid[data-example-layout]').forEach((grid) => {
    const ratio = parseRatio(grid.dataset.exampleRatio ?? '')
    if (!ratio) return
    grid.style.removeProperty('--ex-cols')
    grid.style.removeProperty('--ex-rows')
    const axis = isVerticalLayout(grid.dataset.exampleLayout ?? '') ? '--ex-rows' : '--ex-cols'
    grid.style.setProperty(axis, `${ratio[0]}fr ${ratio[1]}fr`)
  })
}
