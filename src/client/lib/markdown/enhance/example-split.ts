import { exampleSplitTracks, isVerticalExampleLayout, parseExampleRatio } from '../renderer'

/**
 * The split ratio is a runtime number and the prose whitelist strips inline styles, so the grid's
 * tracks are handed to CSS as a custom property instead: one variable for the axis the layout uses
 * and none for the other, so a block that switched between a row split and a column split cannot
 * keep reading the stale one. Runs in every surface — a share page or an export draws the split
 * the note asked for, not the stylesheet's fallback.
 */
export function applyExampleSplits(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.markdown-example-grid[data-example-layout]').forEach((grid) => {
    const ratio = parseExampleRatio(grid.dataset.exampleRatio ?? '')
    if (!ratio) return
    grid.style.removeProperty('--ex-cols')
    grid.style.removeProperty('--ex-rows')
    const axis = isVerticalExampleLayout(grid.dataset.exampleLayout ?? '') ? '--ex-rows' : '--ex-cols'
    grid.style.setProperty(axis, exampleSplitTracks(ratio))
  })
}
