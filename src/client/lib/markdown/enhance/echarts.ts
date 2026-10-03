import { escapeHtml } from '@shared/escape'
import { errorMessage } from '../../errors'
import { t, type MessageKey } from '../../i18n'
import { fenceBody } from '../fence-bodies'
import { decodeDataValue } from '../data-attr'
import { chartTableFromElement, chartTableText } from '../chart'
import {
  EchartsOptionError,
  EchartsTableError,
  MAP_SERIES_NAME,
  loadEcharts,
  loadMapGeometry,
  readEchartsBody,
  tableToEchartsOption,
  type EchartsChart,
  type EchartsTableOption,
} from '../echarts'
import { shortHash, withTimeout } from './util'

/**
 * Mounting ```echarts blocks. The library itself is only reached through ../echarts/loader, so this
 * file is safe to import from the eager path; nothing here holds a colour, because the theme is read
 * from the tokens at draw time (see ../echarts/theme).
 */

const ECHARTS_SELECTOR = '[data-echarts], [data-table-chart]'
const FENCE_SELECTOR = '[data-echarts]'
const ECHARTS_RENDER_TIMEOUT_MS = 20000

interface EchartsNode extends HTMLElement {
  __echartsChart?: EchartsChart
  __echartsObserver?: ResizeObserver
}

/** Which failure the block shows, in the words that say what to do about it. */
const OPTION_MESSAGES: Record<EchartsOptionError['reason'], MessageKey> = {
  empty: 'markdown.echarts_option_empty',
  'not-object': 'markdown.echarts_option_not_object',
  json: 'markdown.echarts_option_invalid_json',
  script: 'markdown.echarts_script_failed',
}

const TABLE_MESSAGES: Record<EchartsTableError['reason'], MessageKey> = {
  'needs-chart': 'markdown.echarts_kind_needs_chart',
  'unknown-kind': 'markdown.chart_kind_unknown',
  'empty-table': 'markdown.chart_table_empty',
  'too-narrow': 'markdown.chart_table_narrow',
  'bad-mapping': 'markdown.chart_mapping_column',
  'map-refused': 'markdown.echarts_map_refused',
}

function blockMessage(err: unknown): string {
  if (err instanceof EchartsTableError) return t(TABLE_MESSAGES[err.reason])
  if (err instanceof EchartsOptionError) return t(OPTION_MESSAGES[err.reason])
  return errorMessage(err)
}

function destroyEchartsInstance(node: EchartsNode): void {
  node.__echartsObserver?.disconnect()
  delete node.__echartsObserver
  const chart = node.__echartsChart
  if (chart) {
    chart.dispose()
    delete node.__echartsChart
  }
}

/** Frees every chart under a root, for the surface that is about to throw its markup away. */
export function destroyEchartsInstances(root: HTMLElement | null): void {
  root?.querySelectorAll<EchartsNode>(ECHARTS_SELECTOR).forEach((node) => destroyEchartsInstance(node))
}

function markEchartsError(node: EchartsNode, message: string, raw: string, signature: string): void {
  node.classList.remove('loading')
  node.classList.add('has-error', 'echarts-error')
  node.removeAttribute('aria-busy')
  node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t('markdown.echarts_render_failed'))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`
  node.dataset.rendered = signature
}

/**
 * A layout change resizes the box, and the chart has to follow it: the library is handed an explicit
 * size when the box has been laid out, so nothing else would notice.
 */
function watchEchartsSize(node: EchartsNode, container: HTMLElement, chart: EchartsChart): void {
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(() => chart.resize())
  observer.observe(container)
  node.__echartsObserver = observer
}

interface EchartsDraw {
  /** Whether this surface honours a fence's request to run JavaScript. */
  allowScript: boolean
  /** The resolved theme, carried in the cache key only: the colours themselves come from the tokens. */
  themeKey: 'd' | 'l'
  /** Whether to draw without the entrance animation, for the surface that reads the pixels. */
  instant: boolean
}

function withDrawMode(option: unknown, instant: boolean): unknown {
  if (!instant || !option || typeof option !== 'object' || Array.isArray(option)) return option
  return { animation: false, ...(option as Record<string, unknown>) }
}

async function drawInto(root: HTMLElement, node: EchartsNode, option: unknown, signature: string): Promise<void> {
  const { createEchartsChart } = await withTimeout(loadEcharts(), ECHARTS_RENDER_TIMEOUT_MS, t('markdown.echarts_render_failed'))
  if (!root.contains(node)) return
  destroyEchartsInstance(node)
  node.classList.remove('loading', 'has-error', 'echarts-error')
  node.removeAttribute('aria-busy')
  const container = document.createElement('div')
  container.className = 'echarts-container'
  node.replaceChildren(container)
  node.__echartsChart = createEchartsChart(container, option)
  watchEchartsSize(node, container, node.__echartsChart)
  node.dataset.rendered = signature
}

/**
 * Where a block's option comes from, and the text a drawn chart is current against. A fence carries
 * its body in the document's fence-body set; a bare table-chart reads it back out of the table next to
 * it, so the two differ only here and share every path after this.
 */
interface EchartsSource {
  /** The text the draw signature is computed from: an edit to it must redraw, a re-render must not. */
  key: string
  /** The source's own request to run JavaScript, which a surface may still refuse. */
  asksForScript: boolean
  read: (allowScript: boolean) => EchartsTableOption
}

function fenceSource(node: Element): EchartsSource {
  const index = Number((node as HTMLElement).dataset.echartsIndex)
  const raw = fenceBody(node, 'echarts', Number.isInteger(index) && index >= 0 ? index : -1)
  const asksForScript = (node as HTMLElement).dataset.echartsScript === 'true'
  return { key: raw, asksForScript, read: (allowScript) => readEchartsBody(raw, { allowScript }) }
}

/**
 * A bare table-chart's own configuration travels on the marker, because the cell that held it is a
 * directive the renderer emptied. Everything else — the categories and the values — is the table.
 */
function tableChartSource(node: HTMLElement): EchartsSource | null {
  const table = node.parentElement?.querySelector('table')
  if (!table) return null
  const kind = node.dataset.tableChart ?? ''
  const options = decodeTableChartOptions(node)
  return {
    key: chartTableText(table),
    asksForScript: false,
    read: () => tableToEchartsOption(chartTableFromElement(table, kind, options)),
  }
}

function decodeTableChartOptions(node: HTMLElement): Record<string, unknown> {
  const raw = node.dataset.tableChartConfig
  if (raw === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(decodeDataValue(raw))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

function sourceOf(node: EchartsNode): EchartsSource | null {
  return node.matches(FENCE_SELECTOR) ? fenceSource(node) : tableChartSource(node)
}

/**
 * One block: read the option, then mount the chart. A body that cannot be read and a library that
 * cannot load both land on the same banner, with the source left underneath so the author can see
 * what the block was asked to draw.
 */
async function renderEchartsNode(root: HTMLElement, node: EchartsNode, draw: EchartsDraw): Promise<void> {
  const source = sourceOf(node)
  if (!source) return
  const allowScript = draw.allowScript && source.asksForScript
  const signature = `${draw.themeKey}:${source.key.length}:${shortHash(source.key)}:${allowScript ? 's' : 'j'}`
  if (node.dataset.rendered === signature && node.__echartsChart) return
  let option: unknown
  let mapSource: string | null = null
  try {
    const body = source.read(allowScript)
    option = body.option
    mapSource = body.mapSource
  }
  catch (err) {
    markEchartsError(node, blockMessage(err), source.key, signature)
    return
  }
  try {
    if (mapSource) {
      const { registerEchartsMap } = await loadEcharts()
      registerEchartsMap(MAP_SERIES_NAME, await loadMapGeometry(mapSource))
    }
    await drawInto(root, node, withDrawMode(option, draw.instant), signature)
  }
  catch (err) {
    if (!root.contains(node)) return
    markEchartsError(node, mapSource ? `${t('markdown.echarts_map_failed')}: ${errorMessage(err)}` : errorMessage(err), source.key, signature)
  }
}

/** Draws every echarts block under a root. `instant` is for the surfaces that read the pixels. */
export async function renderEcharts(root: HTMLElement, draw: EchartsDraw): Promise<void> {
  for (const node of [...root.querySelectorAll<EchartsNode>(ECHARTS_SELECTOR)]) {
    await renderEchartsNode(root, node, draw)
  }
}

/**
 * Draws every block once for a surface that serializes or prints its markup. The chart is SVG, so the
 * drawing is the markup and nothing has to be converted; what differs from the live path is that the
 * entrance animation is off — a sheet handed to the print pipeline as soon as its fonts land cannot
 * wait for a chart to finish animating, and an animation caught mid-flight is a half-drawn picture.
 *
 * A snapshot never runs a note's JavaScript: the surface that takes one has no author watching, and
 * the fence's `js` marker is a request from the person writing the note.
 */
export async function renderStaticEcharts(root: HTMLElement, dark: boolean): Promise<void> {
  await renderEcharts(root, { allowScript: false, themeKey: dark ? 'd' : 'l', instant: true })
}

/**
 * A surface that knows nothing about echarts leaves the block showing its source, which is what a
 * reader of a page that never mounts a chart should see: the option, not a box that stays empty. A
 * bare table-chart has no source of its own to show — the table beside it is the content — so its
 * empty marker simply goes away.
 */
export function showEchartsSource(root: HTMLElement): void {
  root.querySelectorAll<EchartsNode>(ECHARTS_SELECTOR).forEach((node) => {
    destroyEchartsInstance(node)
    node.classList.remove('loading')
    node.removeAttribute('aria-busy')
    if (!node.matches(FENCE_SELECTOR)) {
      node.remove()
      return
    }
    node.classList.add('has-error', 'echarts-source')
    node.innerHTML = `<pre><code>${escapeHtml(fenceSource(node).key)}</code></pre>`
  })
}
