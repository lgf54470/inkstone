import { parseChartKeyword } from '../chart/model.ts'
import { infoOption, infoTokens } from './info-string.ts'

/**
 * The chart fences on a read-only surface: ` ```chart ` and ` ```echarts `, in whichever of the two
 * body formats the note holds them.
 *
 * A body is either data or a Cherry table, and the note may say which with `style=` — the rule the app
 * uses to pick a reader (`src/client/lib/markdown/chart/style.ts`), applied here so a post shows the
 * picture the author was looking at rather than what a shape-sniffer guessed. Four answers follow:
 *
 * - **table** — the body is rendered as the table it is, with the same empty directive cell the bare
 *   `| :bar: |` form leaves behind, so the site's existing table-chart path draws it and the numbers
 *   stay readable as a table whatever draws them;
 * - **chart-js / echarts-option** — a data body, handed to the client as text: chart.js parses it as
 *   JSON, an echarts body as JSON5, because an option copied out of the echarts docs is not strict JSON;
 * - **source** — what a post shows for a body this surface cannot or must not draw. A fence carrying
 *   the `js` marker asks for its body to be *evaluated*, and a post has no author beside the reader to
 *   confirm that; the app keeps that same request to the owner's own preview, and the blog shows the
 *   source with the reason. A stated format the body does not deliver lands here too.
 */

export type ChartLanguage = 'chart' | 'echarts'
export type ChartFenceRoute = 'table' | 'chart-js' | 'echarts-option' | 'source'

const CHART_LANGUAGES = new Set(['chart', 'chartjs'])
const ECHARTS_LANGUAGES = new Set(['echarts'])

/** The bare flag on an echarts fence asking that its body be evaluated rather than read. */
const SCRIPT_RE = /(?:^|\s)["']?js["']?(?=\s|$)/i

const STYLE_KEY = 'style'
const STYLES: Record<string, 'json' | 'table'> = { json: 'json', table: 'table' }

/** Which chart family a fence language belongs to, if either. */
export function chartFenceLanguage(language: string): ChartLanguage | null {
  if (CHART_LANGUAGES.has(language)) return 'chart'
  if (ECHARTS_LANGUAGES.has(language)) return 'echarts'
  return null
}

/**
 * The format the info line states, or null when it states none or names one nobody draws. Unlike the
 * app's reader this never hands the value on to a block — it only picks a route here, and an unreadable
 * name is not carried into the document — so there is nothing to cap.
 */
export function readFenceStyle(info: string): 'json' | 'table' | null {
  for (const token of infoTokens(info)) {
    const option = infoOption(token)
    if (option?.key !== STYLE_KEY) continue
    return STYLES[option.value.trim().toLowerCase()] ?? null
  }
  return null
}

/** Whether a body is written as a chart table: the keyword cell in its first cell, as the table rule reads it. */
export function isChartTableBody(body: string): boolean {
  const line = body.split('\n').find((row) => row.trim().length > 0) ?? ''
  if (!line.includes('|')) return false
  return parseChartKeyword(firstCell(line)) !== null
}

function firstCell(line: string): string {
  const [, cell = ''] = line.split('|')
  return cell.trim()
}

/** The route a fence body takes. */
export function routeChartFence(language: ChartLanguage, body: string, info: string): ChartFenceRoute {
  if (language === 'echarts' && SCRIPT_RE.test(info)) return 'source'
  const table = isChartTableBody(body)
  const stated = readFenceStyle(info)
  // Both statements have to agree for anything to be drawn: the app answers the same disagreement with
  // its error state, and a reader has the source, which is the same content without a setting to fix.
  if (stated === 'table') return table ? 'table' : 'source'
  if (stated === 'json' && table) return 'source'
  if (stated === null && !table) return language === 'chart' ? 'chart-js' : 'echarts-option'
  if (table) return 'table'
  return language === 'chart' ? 'chart-js' : 'echarts-option'
}

/**
 * A fence body as the note wrote it. markdown-it keeps the line ending that closes the body, and a body
 * stored with Windows endings would otherwise reach the parsers below with it — the app strips the same
 * two things before reading one of these blocks (`echartsBody`).
 */
export function chartFenceBody(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n$/, '')
}

/** Whether the fence asked for its body to be evaluated, which is what the source hint is about. */
export function chartFenceAsksForScript(info: string): boolean {
  return SCRIPT_RE.test(info)
}

/**
 * The block the client mounts an echarts option into. The body travels as text in the attribute and is
 * read back with `decodeURIComponent` on the other side, which is also what keeps the quote that ends
 * the attribute from ever appearing in it: `encodeURIComponent` escapes it away.
 */
export function renderEchartsOptionFence(body: string): string {
  return `<div class="echarts-block loading" data-echarts-code="${encodeURIComponent(body)}" aria-busy="true">正在加载图表...</div>`
}

/** The block the client mounts a chart.js config into, unchanged from the shape the site already draws. */
export function renderChartJsFence(body: string): string {
  return `<div class="chartjs-block loading" data-chart="${encodeURIComponent(body)}" aria-busy="true">正在加载图表...</div>`
}
