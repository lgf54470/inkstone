/**
 * The table body a ```chart fence can carry instead of a JSON config: a markdown table whose first
 * header cell names the chart and optionally configures it (`| :bar:{"title": "Tally"} | … |`),
 * which is the shape Cherry's table-chart syntax uses.
 *
 * Only the *text* ↔ *model* half lives here. What a model means for a drawing engine is decided by
 * that engine (./config for chart.js, and the echarts fence has its own), so the two backends can
 * read one syntax without either importing the other.
 */
import { isDelimiterRow, splitTableRow } from '../table-editor'

/**
 * The keyword cell, taken from Cherry verbatim: `:kind:` with an optional `{…}` configuration
 * beside it. `\w+` is ASCII-only on purpose — a kind is an engine's own name, not a label.
 */
export const CHART_KEYWORD_RE = /^:(\w+):(?:[ ]*{(.*?)}[ ]*)?$/

/** A cell written `{"title": "x"}` reaches JSON.parse as `"title": "x"`, so it goes back wrapped. */
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype']

/**
 * A hand-written configuration is data, and `__proto__` is a way of reaching the object every other
 * object shares. Both parsers that read one — JSON for a chart table, JSON5 for an echarts option —
 * run their keys through this.
 */
export function safeReviver(key: string, value: unknown): unknown {
  return UNSAFE_KEYS.includes(key) ? undefined : value
}

export interface ChartKeyword {
  kind: string
  options: Record<string, unknown>
}

/** The table as written: the keyword's own cell is consumed, so `header[0]` is `''`. */
export interface ChartTable {
  kind: string
  options: Record<string, unknown>
  header: string[]
  rows: string[][]
}

/** Why a body is not a usable chart table. Every caller turns this into the block's error state. */
export class ChartTableError extends Error {}

function unescapeCell(cell: string): string {
  return cell.replace(/\\([\\|])/g, '$1')
}

function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').trim()
}

function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    if (line.trim().length > 0) return line
  }
  return ''
}

/**
 * Whether a fence body is *meant* to be a chart table. Structural only, because the renderer asks on
 * every keystroke: an unparseable table still reads as a table, so its error surfaces where the
 * config is actually read.
 */
export function isChartTableBody(body: string): boolean {
  const line = firstLine(body)
  if (!line.includes('|')) return false
  return CHART_KEYWORD_RE.test(splitTableRow(line)[0] ?? '')
}

/**
 * Cherry re-wraps the cell's own braces and refuses a prototype key, because the configuration is
 * authored by hand and round-trips through a DOM attribute. Malformed JSON is an error here rather
 * than the silent `{}` Cherry answers with: a dropped title is a wrong picture, and the block can
 * say so.
 */
export function parseChartKeyword(cell: string): ChartKeyword | null {
  const match = CHART_KEYWORD_RE.exec(cell.trim())
  if (!match) return null
  const inner = match[2]?.trim()
  return { kind: match[1]!, options: inner ? parseKeywordOptions(inner) : {} }
}

function parseKeywordOptions(inner: string): Record<string, unknown> {
  const text = `{${inner}}`
  let parsed: unknown
  try {
    parsed = JSON.parse(text, safeReviver)
  }
  catch (err) {
    throw new ChartTableError(err instanceof Error ? err.message : String(err))
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ChartTableError('expected a JSON object')
  }
  return parsed as Record<string, unknown>
}

export function formatKeywordCell(keyword: ChartKeyword): string {
  const keys = Object.keys(keyword.options)
  return keys.length === 0 ? `:${keyword.kind}:` : `:${keyword.kind}:${JSON.stringify(keyword.options)}`
}

/** Reads a chart table out of fence text. Ragged rows are padded, the way a rendered table pads them. */
export function readChartTable(body: string): ChartTable {
  const lines = body.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) throw new ChartTableError('a chart table needs a header row')
  const keyword = parseChartKeyword(splitTableRow(lines[0]!)[0] ?? '')
  if (!keyword) throw new ChartTableError('the first cell must name a chart, like `:bar:`')
  if (!isDelimiterRow(lines[1]!)) throw new ChartTableError('a chart table needs a `| --- |` row')
  const header = splitTableRow(lines[0]!).map(unescapeCell)
  header[0] = ''
  const width = header.length
  const rows = lines.slice(2).map((line) => pad(splitTableRow(line).map(unescapeCell), width))
  return { kind: keyword.kind, options: keyword.options, header, rows }
}

function pad(cells: string[], width: number): string[] {
  const row = [...cells]
  while (row.length < width) row.push('')
  return row.slice(0, width)
}

/**
 * The table text for a model. Unpadded: a body a toggle wrote should read like one a person typed,
 * and trailing spaces inside every cell would show up in the note as whitespace the editor keeps.
 */
export function writeChartTable(table: ChartTable): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [
    line([formatKeywordCell(table), ...table.header.slice(1).map(escapeCell)]),
    line(table.header.map(() => '---')),
    ...table.rows.map((row) => line(row.map(escapeCell))),
  ].join('\n')
}

/** The number a cell means: thousands separators allowed, anything unreadable is zero. */
export function cellNumber(cell: string | undefined): number {
  const value = Number.parseFloat(String(cell ?? '').replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}
