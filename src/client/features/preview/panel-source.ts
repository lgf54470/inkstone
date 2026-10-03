import { MAX_PANEL_COLUMNS, formatColsHeader, matchPanelHeader } from '../../lib/markdown/renderer'
import type { AlignValue, ColsOptions } from '../../lib/markdown/renderer'
import { bareColonMarks, deindent, findColonClose, lineIndent } from './colon-lines'

/**
 * The source edits behind a panel block's settings toolbar.
 *
 * A panel keeps its whole configuration on one header line, so most edits are a rewrite of that line
 * with the content below left byte-identical. Changing the column count is the one edit that also has
 * to touch the body: the number of columns a note says it has is the number of `::` separators it
 * carries, and a header that disagrees with its own body is a block the reader cannot fix by looking
 * at it.
 */

interface LocatedCols {
  lines: string[]
  indent: string
  markerLength: number
  options: ColsOptions
  closeLine: number
  separators: number[]
}

function locateCols(source: string, sourceLine: number): LocatedCols | null {
  const lines = source.split('\n')
  const raw = lines[sourceLine]
  if (raw === undefined) return null
  const panel = matchPanelHeader(deindent(raw))
  if (!panel || panel.header.kind !== 'cols') return null
  const closeLine = findColonClose(lines, sourceLine + 1, lines.length, panel.markerLength)
  if (closeLine < 0) return null
  return {
    lines,
    indent: lineIndent(raw),
    markerLength: panel.markerLength,
    options: panel.header.cols,
    closeLine,
    separators: bareColonMarks(lines, sourceLine + 1, closeLine),
  }
}

/** Rewrites an alignment block to the given alignment. */
export function updateAlignHeader(source: string, sourceLine: number, align: AlignValue): string | null {
  const lines = source.split('\n')
  const raw = lines[sourceLine]
  if (raw === undefined) return null
  const panel = matchPanelHeader(deindent(raw))
  if (!panel || panel.header.kind !== 'align') return null
  lines[sourceLine] = `${lineIndent(raw)}${':'.repeat(panel.markerLength)} ${align}`
  return lines.join('\n')
}

export function updateColsHeader(
  source: string,
  sourceLine: number,
  update: (current: ColsOptions) => ColsOptions,
): string | null {
  const located = locateCols(source, sourceLine)
  if (!located) return null
  const { lines, indent, markerLength } = located
  lines[sourceLine] = `${indent}${formatColsHeader(update(located.options), markerLength)}`
  return lines.join('\n')
}

/** How many columns the body currently says it holds, which is one per separator plus the first. */
export function countColumns(source: string, sourceLine: number): number | null {
  const located = locateCols(source, sourceLine)
  return located ? located.separators.length + 1 : null
}

/**
 * Sets the count in both places that state it. Dropping the explicit tracks is deliberate: choosing a
 * count means equal columns, and carrying `1fr 2fr` along would leave the header describing a grid the
 * body no longer has.
 */
export function setColumnCount(source: string, sourceLine: number, count: number): string | null {
  const located = locateCols(source, sourceLine)
  if (!located) return null
  const { lines, indent, markerLength, closeLine } = located
  const wanted = Math.min(Math.max(Math.trunc(count), 1), MAX_PANEL_COLUMNS) - 1
  let held = located.separators.length
  while (held > wanted) {
    const mark = located.separators[held - 1]!
    lines.splice(mark, lines[mark + 1]?.trim() ? 1 : 2)
    held--
  }
  while (held < wanted) {
    lines.splice(closeLine, 0, indent, `${indent}::`, indent)
    held++
  }
  const options: ColsOptions = { ...located.options, fixedCount: wanted + 1, tracks: null }
  lines[sourceLine] = `${indent}${formatColsHeader(options, markerLength)}`
  return lines.join('\n')
}
