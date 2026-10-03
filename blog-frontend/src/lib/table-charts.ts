import { chartTableFromElement } from './chart/from-dom.ts'
import { echartsTheme } from './chart/theme.ts'
import { tableToEchartsOption } from './chart/table-option.ts'
import { isDarkMode } from './diagram-reveal'

/**
 * Drawing the charts a bare table asks for: the renderer leaves an empty `.table-chart` above a table
 * whose first header cell was `:kind:{…}`, and this turns it into a picture.
 *
 * The data is read back out of the table rather than carried on the marker, so there is one copy of
 * every number and it is the one a reader can also see. When a chart cannot be drawn this block simply
 * goes away instead of showing an error: a post's reader has the full table either way, and a banner
 * about a setting they cannot change is worse than the picture not being there.
 */

const SELECTOR = '.table-chart[data-table-chart]'

let echartsPromise: Promise<typeof import('echarts')> | null = null
const drawn = new WeakMap<HTMLElement, string>()

function loadEcharts(): Promise<typeof import('echarts')> {
  echartsPromise ??= import('echarts').catch((err) => {
    echartsPromise = null
    throw err
  })
  return echartsPromise
}

function markerConfig(block: HTMLElement): Record<string, unknown> {
  const raw = block.dataset.tableChartConfig
  if (raw === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

function drop(block: HTMLElement): void {
  block.remove()
}

/**
 * What this block was drawn from. A post's text does not change under a reader, so the only thing
 * that can make a drawn picture stale is the theme it was painted for.
 */
function sourceKey(block: HTMLElement, dark: boolean): string {
  return `${dark ? 'd' : 'l'}:${block.dataset.tableChart}`
}

async function renderTableChart(block: HTMLElement): Promise<void> {
  const table = block.parentElement?.querySelector('table')
  if (!table) return drop(block)
  const kind = block.dataset.tableChart ?? ''
  const dark = isDarkMode()
  const key = sourceKey(block, dark)
  if (drawn.get(block) === key) return
  let built: ReturnType<typeof tableToEchartsOption>
  try {
    built = tableToEchartsOption(chartTableFromElement(table, kind, markerConfig(block)))
  }
  catch {
    return drop(block)
  }
  try {
    const echarts = await loadEcharts()
    if (built.mapSource) {
      const geometry = await fetchMapGeometry(built.mapSource)
      if (!geometry) return drop(block)
      echarts.registerMap('inkstone-map', geometry as never)
    }
    const container = document.createElement('div')
    container.className = 'echarts-container'
    block.replaceChildren(container)
    const chart = echarts.init(container, echartsTheme(), { renderer: 'svg' })
    chart.setOption(built.option as never, true)
    drawn.set(block, key)
  }
  catch {
    drop(block)
  }
}

/** The outline data a map needs. Same shape check as the app: a bad payload is no chart, not a crash. */
async function fetchMapGeometry(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { referrerPolicy: 'no-referrer' })
    if (!response.ok) return null
    const geometry: unknown = await response.json()
    const isCollection = Boolean(geometry) && typeof geometry === 'object'
      && (geometry as { type?: unknown }).type === 'FeatureCollection'
      && Array.isArray((geometry as { features?: unknown }).features)
    return isCollection ? geometry : null
  }
  catch {
    return null
  }
}

export function initTableCharts(): void {
  const blocks = [...document.querySelectorAll<HTMLElement>(SELECTOR)]
  for (const block of blocks) void renderTableChart(block)
}

/** Called when the theme flips: the chart is pixels-and-text, so its colours must be re-read. */
export function rerenderTableChartsForTheme(): void {
  for (const block of document.querySelectorAll<HTMLElement>(SELECTOR)) void renderTableChart(block)
}
