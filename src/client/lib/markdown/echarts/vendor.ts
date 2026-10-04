/**
 * The only module that imports echarts. Everything else reaches the library through ./loader, which
 * is what keeps the library behind a lazy boundary (scripts/check-vendor-isolation.mjs guards that
 * this file stays the single door).
 */
import * as echarts from 'echarts'
import type { ECharts, EChartsCoreOption } from 'echarts'
import { echartsTheme } from './theme'

/** The handle one block holds. It is the library's own type: narrowing it here would only hide which
 * release the block was written against. */
export type EchartsChart = ECharts

/**
 * A chart drawn into `element` at the size the element has been laid out to.
 *
 * The theme is handed to `init` rather than merged into the option, so an option that names its own
 * colours still wins: echarts reads a theme as the default underneath it, which is the only order
 * that lets a note pin one series' colour without losing the app's palette for the rest.
 *
 * SVG, not canvas: a printed sheet, an exported document and a slide all carry their markup rather
 * than their pixels, and an inline `<svg>` survives that trip while a canvas comes out blank. It is
 * also what the reference renderer for this syntax draws with.
 */
export function createEchartsChart(element: HTMLElement, option: unknown, dark: boolean): EchartsChart {
  const width = element.clientWidth
  const height = element.clientHeight
  const chart = echarts.init(element, echartsTheme(dark), {
    renderer: 'svg',
    ...(width > 0 && height > 0 ? { width, height } : {}),
  })
  chart.setOption(option as EChartsCoreOption, true)
  return chart
}

/** The outline data a `map` series draws, registered under the name the option refers to. */
export function registerEchartsMap(name: string, geometry: unknown): void {
  echarts.registerMap(name, geometry as Parameters<typeof echarts.registerMap>[1])
}
