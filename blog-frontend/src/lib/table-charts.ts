import { chartTableFromElement } from './chart/from-dom.ts'
import { renderEcharts } from './chart/draw.ts'
import { chartPaletteKey } from './chart/accent.ts'
import { tableToEchartsOption } from './chart/table-option.ts'
import { isDarkMode } from './diagram-reveal.ts'

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

const drawn = new WeakMap<HTMLElement, string>()

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
 * What this block was drawn from. A post's text does not change under a reader, so the things that can
 * make a drawn picture stale are the reading theme and the accent the site was deployed with — both of
 * which the palette is computed from, so the key carries them together rather than the light mode
 * alone.
 */
function sourceKey(block: HTMLElement, dark: boolean): string {
  return `${chartPaletteKey(dark)}:${block.dataset.tableChart}`
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
    await renderEcharts(block, built.option, built.map, dark)
    drawn.set(block, key)
  }
  catch {
    drop(block)
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
