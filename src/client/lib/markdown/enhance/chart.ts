import { escapeHtml } from '@shared/escape'
import { decodeDataValue } from '../data-attr'
import { errorMessage } from '../../errors'
import { t, type MessageKey } from '../../i18n'
import { ChartConfigError, readChartBody } from '../chart'
import { shortHash, withTimeout } from './util'

const CHARTJS_TEXT_COLORS = { dark: '#94a3b8', light: '#64748b' } as const
let chartJsPromise: Promise<typeof import('chart.js/auto')> | null = null
const CHART_LOAD_TIMEOUT_MS = 15000

/** A table that means a kind only the echarts fence draws is a pointer, not a parse failure. */
const CHART_CONFIG_MESSAGES: Record<ChartConfigError['reason'], MessageKey> = {
  'needs-echarts': 'markdown.chart_kind_needs_echarts',
  'unknown-kind': 'markdown.chart_kind_unknown',
  'empty-table': 'markdown.chart_table_empty',
  'too-narrow': 'markdown.chart_table_narrow',
  'bad-mapping': 'markdown.chart_mapping_column',
}

async function getChartJs(): Promise<typeof import('chart.js/auto')> {
  if (!chartJsPromise) {
    const loading = withTimeout(import('chart.js/auto'), CHART_LOAD_TIMEOUT_MS, t('markdown.diagram_rendering_timed_out_while_loading'))
    chartJsPromise = loading
    void loading.catch((err) => {
      if (chartJsPromise === loading)
        chartJsPromise = null
      console.warn(t('markdown.chart_rendering_failed'), err)
    })
  }
  return chartJsPromise
}

function destroyChartInstance(node: HTMLElement): void {
  const holder = node as unknown as { __chartInstance?: { destroy: () => void }; __chartObserver?: ResizeObserver }
  holder.__chartObserver?.disconnect()
  delete holder.__chartObserver
  const existing = holder.__chartInstance
  if (existing && typeof existing.destroy === 'function') {
    existing.destroy()
    delete holder.__chartInstance
  }
}

export function destroyChartInstances(root: HTMLElement | null): void {
  root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
    destroyChartInstance(node)
  })
}

function chartConfigMessage(err: unknown): string {
  if (err instanceof ChartConfigError) return t(CHART_CONFIG_MESSAGES[err.reason])
  return errorMessage(err)
}

function markChartError(node: HTMLElement, err: unknown, raw: string, signature: string): void {
  node.classList.remove('loading')
  node.classList.add('has-error', 'chart-error')
  node.removeAttribute('aria-busy')
  const message = chartConfigMessage(err)
  node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t('markdown.chart_rendering_failed'))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`
  node.dataset.rendered = signature
}

function chartThemeColors(dark: boolean): { text: string; grid: string } {
  return {
    text: CHARTJS_TEXT_COLORS[dark ? 'dark' : 'light'],
    grid: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  }
}

// Re-applies the app's axis colors under the user's own ticks/grid objects.
function themedScales(userScales: Record<string, unknown>, textColor: string, gridColor: string): Record<string, unknown> {
  const scales: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(userScales)) {
    if (val && typeof val === 'object') {
      const scaleObj = val as Record<string, unknown>
      scales[key] = {
        ...scaleObj,
        ticks: { color: textColor, ...(scaleObj.ticks as object || {}) },
        grid: { color: gridColor, ...(scaleObj.grid as object || {}) },
      }
    }
  }
  return scales
}

function buildChartConfig(config: Record<string, unknown>, dark: boolean, sized: boolean, instant: boolean): Record<string, unknown> {
  const { text, grid } = chartThemeColors(dark)
  const userOptions = (config.options && typeof config.options === 'object' ? config.options : {}) as Record<string, unknown>
  const userScales = (userOptions.scales && typeof userOptions.scales === 'object' ? userOptions.scales : {}) as Record<string, unknown>
  const userPlugins = (userOptions.plugins && typeof userOptions.plugins === 'object' ? userOptions.plugins : {}) as Record<string, unknown>
  const scales = themedScales(userScales, text, grid)
  const options: Record<string, unknown> = {
    responsive: true,
    maintainAspectRatio: false,
    color: text,
    ...userOptions,
    scales: Object.keys(scales).length > 0 ? scales : undefined,
    plugins: {
      legend: {
        labels: {
          color: text,
        },
      },
      ...userPlugins,
    },
  }
  // The chart was handed its size (see chartSize): measuring would read the same inflated rect
  // again. Without `responsive` the library keeps the canvas's own size, and the device pixel
  // ratio has to be passed because that is the only other thing the responsive path set up.
  if (sized) {
    options.responsive = false
    options.devicePixelRatio = window.devicePixelRatio
  }
  // A surface that reads the canvas instead of a pair of eyes — the printed deck, the exported note —
  // draws with no entrance animation: chart.js animates towards its data, so a canvas sampled while an
  // animation runs is blank or partial, and *every* resize clears the canvas and starts one again. The
  // deck's sheet is resized exactly as it is handed to the print pipeline (the webfonts land and the
  // pages reflow), so a print could catch an empty chart box on a page that looked finished.
  if (instant) options.animation = false
  return { ...config, options }
}

// The size the chart really has: the container's layout box. Chart.js measures a responsive chart
// from its container's *bounding rect*, and the slide canvas is scaled with a CSS transform — so the
// canvas came out stage-scale times too wide and tall (the chart block grew a scrollbar in both
// directions), and every geometry change multiplied it again. A container that has not been laid out
// (an off-document render) returns null and keeps the library's own measurement.
function chartSize(container: HTMLElement): { width: number; height: number } | null {
  const width = Math.round(container.clientWidth)
  const height = Math.round(container.clientHeight)
  return width > 0 && height > 0 ? { width, height } : null
}

// A layout change (a narrower stage, the slide list opening, a re-measure) resizes the container, and
// the chart has to follow it: with `responsive` off nothing else would notice, and the canvas would
// keep a size its box no longer has.
function watchChartSize(node: HTMLElement, container: HTMLElement, instance: { resize: (width: number, height: number) => void }): void {
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(() => {
    const size = chartSize(container)
    if (size) instance.resize(size.width, size.height)
  })
  observer.observe(container)
  const holder = node as unknown as { __chartObserver?: ResizeObserver }
  holder.__chartObserver = observer
}

// One block: parse the config, then instantiate the chart; both failures land
// on the same error banner. The root-containment check aborts the whole batch
// once the node was detached mid-render (the original behavior).
async function renderChartNode(root: HTMLElement, node: HTMLElement, raw: string, signature: string, dark: boolean, instant: boolean): Promise<void> {
  let config: Record<string, unknown>
  try {
    config = readChartBody(raw)
  }
  catch (err: unknown) {
    markChartError(node, err, raw, signature)
    return
  }
  try {
    const chartModule = await getChartJs()
    const Chart = chartModule.Chart ?? (chartModule as unknown as { default: typeof chartModule.Chart }).default
    if (!root.contains(node))
      return
    destroyChartInstance(node)
    node.classList.remove('loading', 'has-error', 'chart-error')
    node.removeAttribute('aria-busy')
    node.replaceChildren()
    const container = document.createElement('div')
    container.className = 'chartjs-container'
    const canvas = document.createElement('canvas')
    canvas.className = 'chartjs-canvas'
    container.appendChild(canvas)
    node.appendChild(container)
    // The canvas carries the size before the chart reads it, and that is what the chart draws at.
    const size = chartSize(container)
    if (size) {
      canvas.width = size.width
      canvas.height = size.height
    }
    const instance = new Chart(canvas, buildChartConfig(config, dark, size !== null, instant) as never);
    (node as unknown as { __chartInstance?: unknown }).__chartInstance = instance
    watchChartSize(node, container, instance)
    node.dataset.rendered = signature
  }
  catch (err: unknown) {
    if (!root.contains(node))
      return
    markChartError(node, err, raw, signature)
  }
}

// A chart is "already rendered" only when the live instance is still there. The marker alone is
// not enough: it is an attribute, so it survives being serialized into cached slide markup, while
// the canvas pixels and the instance do not — trusting the marker showed an empty chart box
// wherever the markup was mounted from the cache. A destroyed instance clears the property and
// leaves the marker, which lands on the same path, so both draw again.
function hasLiveChart(node: HTMLElement): boolean {
  return Boolean((node as unknown as { __chartInstance?: unknown }).__chartInstance)
}

/**
 * Draws every chart block under a root. `instant` is for the surfaces whose canvas is read rather than
 * looked at — a printed sheet, an exported document — where an entrance animation is a picture of
 * nothing at all (see `buildChartConfig`).
 */
export async function renderChartJs(root: HTMLElement, dark: boolean, { instant = false } = {}): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-chart]')]
  for (const node of nodes) {
    const raw = decodeDataValue(node.dataset.chart)
    const signature = `${dark ? 'd' : 'l'}:${raw.length}:${shortHash(raw)}`
    if (node.dataset.rendered === signature && hasLiveChart(node))
      continue
    await renderChartNode(root, node, raw, signature, dark, instant)
  }
}
