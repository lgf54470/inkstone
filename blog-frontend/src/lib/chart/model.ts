/**
 * The chart-table syntax, as the blog reads it.
 *
 * This whole `src/lib/chart/` directory is a second copy of the app's `src/client/lib/markdown/chart` plus
 * `echarts/table-option.ts`. The two trees are separate packages — blog-frontend has no path into the
 * app's source — so the converters are duplicated deliberately, and `tests/markdown-renderer-parity.test.ts`
 * in the root repo pins the one piece that must not drift: the keyword regex a table cell is matched
 * against. Everything below is a trimmed copy: the blog renders a table from tokens and reads its
 * values back out of the DOM, so it never parses table *text* and none of that lives here.
 */

/**
 * The keyword cell, identical to the app's and to the reference implementation's: `:kind:` with an
 * optional `{…}` configuration beside it. `\w+` is ASCII-only on purpose — a kind is an engine's own
 * name, not a label.
 */
export const CHART_KEYWORD_RE = /^:(\w+):(?:[ ]*{(.*?)}[ ]*)?$/

/** A cell written `{"title": "x"}` reaches JSON.parse as `"title": "x"`, so it goes back wrapped. */
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype']

export interface ChartKeyword {
  kind: string
  options: Record<string, unknown>
}

/** The table as read off the DOM: the keyword's own cell was consumed, so `header[0]` is `''`. */
export interface ChartTable {
  kind: string
  options: Record<string, unknown>
  header: string[]
  rows: string[][]
}

/**
 * A hand-written configuration is data, and `__proto__` is a way of reaching the object every other
 * object shares, so the keys are filtered on the way in.
 */
export function safeReviver(key: string, value: unknown): unknown {
  return UNSAFE_KEYS.includes(key) ? undefined : value
}

export function parseChartKeyword(cell: string): ChartKeyword | null {
  const match = CHART_KEYWORD_RE.exec(cell.trim())
  if (!match) return null
  const inner = match[2]?.trim()
  return { kind: match[1]!, options: inner ? parseKeywordOptions(inner) : {} }
}

/** A configuration that will not parse reads as no configuration: a dropped title beats losing the chart. */
function parseKeywordOptions(inner: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(`{${inner}}`, safeReviver)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/** The number a cell means: thousands separators allowed, anything unreadable is zero. */
export function cellNumber(cell: string | undefined): number {
  const value = Number.parseFloat(String(cell ?? '').replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}
