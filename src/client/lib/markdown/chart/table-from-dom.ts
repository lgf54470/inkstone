/**
 * Reading a chart table back out of the rendered DOM.
 *
 * A bare table-chart lives in the note as an ordinary table, so the cells a chart needs are already
 * on screen. Re-reading them from there beats carrying a second copy of the data through an attribute:
 * the two could only disagree, and the table is what the author edits.
 */
import type { ChartTable } from './table'

function cellText(cell: Element): string {
  return (cell.textContent ?? '').trim()
}

function rowsOf(table: HTMLTableElement): string[][] {
  const body = table.tBodies.length > 0 ? table.tBodies : [table]
  return [...body].flatMap((section) => [...section.rows].map((row) => [...row.cells].map(cellText)))
}

/** The header as written, with the directive cell left blank by the renderer standing in for `header[0]`. */
export function chartTableFromElement(table: HTMLTableElement, kind: string, options: Record<string, unknown>): ChartTable {
  const headerCells = [...(table.tHead?.rows[0]?.cells ?? [])].map(cellText)
  const width = Math.max(headerCells.length, ...rowsOf(table).map((row) => row.length), 1)
  const header = headerCells.length > 0 ? headerCells : ['', '']
  return { kind, options, header, rows: rowsOf(table).map((row) => pad(row, width)) }
}

function pad(cells: string[], width: number): string[] {
  const row = [...cells]
  while (row.length < width) row.push('')
  return row
}

/**
 * A stable text of the table, for the signature that decides whether a drawn chart is still current.
 * It is the *cells*, not the markup: a re-render that moves an attribute must not redraw a chart that
 * did not change, and an edit to a value must.
 */
export function chartTableText(table: HTMLTableElement): string {
  const header = [...(table.tHead?.rows[0]?.cells ?? [])].map(cellText).join('\t')
  const rows = rowsOf(table).map((row) => row.join('\t')).join('\n')
  return `${header}\n${rows}`
}
