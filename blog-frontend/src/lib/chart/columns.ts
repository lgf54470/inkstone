/**
 * Which columns of a scatter table mean x, y, size and series.
 *
 * Both chart backends read the same table syntax, so the resolution lives here rather than beside
 * either of them: a note that says `cherry:mapping` must mean the same picture in a `chart` fence and
 * in an `echarts` one, and the day those two drift is the day the format toggle starts losing data.
 */
import type { ChartTable } from './model.ts'

/**
 * The header words the reference syntax documents for a scatter's columns. These are matched against a
 * note's own cells and never rendered, so they are input vocabulary rather than UI copy — the i18n
 * gate lets this one constant carry them (see scripts/check-i18n.mjs).
 */
const SCATTER_HEADER_WORDS = {
  x: ['x', '横坐标'],
  y: ['y', '纵坐标'],
  size: ['size', '大小'],
  series: ['series', 'group', '系列', '分组'],
}

export interface ScatterColumns {
  x: number
  y: number
  /** -1 when no column carries a size, which is what keeps a picture a scatter and not a bubble. */
  size: number
  /** -1 when every point lands in one series. */
  series: number
}

function lowerHeader(table: ChartTable): string[] {
  return table.header.map((cell) => cell.trim().toLowerCase())
}

function mappedColumns(table: ChartTable, mapping: Record<string, unknown>): ScatterColumns | null {
  const header = lowerHeader(table)
  const at = (key: string) => header.indexOf(String(mapping[key] ?? '').trim().toLowerCase())
  const x = at('x')
  const y = at('y')
  // A mapping that names a column the header does not have is a mistake in the note, not a hint to
  // fall back: falling back would draw a chart over different columns than the author pointed at.
  if (x < 0 || y < 0) return null
  return { x, y, size: at('size'), series: Math.max(at('series'), at('group')) }
}

/**
 * The documented order — name, x, y, size, series — with the header words the syntax also accepts.
 * The search starts at the second cell because the first one is where the point's name lives.
 */
function positionalColumns(table: ChartTable): ScatterColumns {
  const header = lowerHeader(table)
  const byWord = (words: string[]) => header.findIndex((cell, index) => index > 0 && words.includes(cell))
  const series = byWord(SCATTER_HEADER_WORDS.series)
  return {
    x: byWord(SCATTER_HEADER_WORDS.x) || 1,
    y: byWord(SCATTER_HEADER_WORDS.y) || 2,
    size: byWord(SCATTER_HEADER_WORDS.size),
    series: series >= 0 || header.length < 5 ? series : header.length - 1,
  }
}

export function resolveScatterColumns(table: ChartTable): ScatterColumns | null {
  const mapping = table.options['cherry:mapping']
  if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
    return mappedColumns(table, mapping as Record<string, unknown>)
  }
  return positionalColumns(table)
}

/** The size a point is drawn at, scaled between the smallest and largest in the same table. */
export function symbolSize(size: number, min: number, max: number): number {
  if (max === min) return 12
  return Math.round(6 + ((size - min) / (max - min)) * (28 - 6))
}
