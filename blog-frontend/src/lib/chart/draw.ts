import { mapGeometryUrl } from '../map-geometry.ts'
import { applyChartPalette, echartsTheme } from './theme.ts'
import type { EchartsMapRequest } from './table-option.ts'

/**
 * The one place an option becomes a picture on the page.
 *
 * A chart drawn from a table and a chart drawn from a ` ```echarts ` body differ only in where their
 * option came from, and everything after that — the library, the outlines a map needs, the theme read
 * at draw time, the box the drawing goes in — is the same walk. Two copies of "fetch the outlines from
 * our own route and accept nothing that is not a FeatureCollection" is how a reader ends up asking a
 * third-party host for them from one kind of block and not the other.
 *
 * The instance is kept on the block because echarts will not free one on its own: a theme flip draws a
 * new picture in a new box, and without the dispose the previous chart stays registered against the box
 * that left the document, so every flip adds one more.
 */

interface EchartsInstance {
  dispose(): void
  resize(): void
}

interface DrawnBlock extends HTMLElement {
  __echarts?: EchartsInstance
  __echartsResize?: ResizeObserver
}

/** The outlines did not arrive: unreachable, refused, or not a FeatureCollection. */
export class MapOutlineError extends Error {
  constructor(readonly source: string) {
    super('map-outline')
  }
}

let echartsPromise: Promise<typeof import('echarts')> | null = null

function loadEcharts(): Promise<typeof import('echarts')> {
  echartsPromise ??= import('echarts').catch((err) => {
    // 加载失败（如网络瞬断）时清除缓存，允许下一次渲染重试
    echartsPromise = null
    throw err
  })
  return echartsPromise
}

/**
 * The outline data a map needs, asked for on this page's own origin (see `src/lib/map-geometry.ts`) and
 * shape-checked: a payload that is not a FeatureCollection is no chart rather than a crash, because the
 * route that serves it could have been answered by a cache the site does not control.
 */
async function loadMapGeometry(source: string): Promise<unknown> {
  const response = await fetch(mapGeometryUrl(source), { referrerPolicy: 'no-referrer' }).catch(() => null)
  if (!response?.ok) throw new MapOutlineError(source)
  const geometry: unknown = await response.json().catch(() => null)
  const isCollection = Boolean(geometry) && typeof geometry === 'object'
    && (geometry as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((geometry as { features?: unknown }).features)
  if (!isCollection) throw new MapOutlineError(source)
  return geometry
}

function watchSize(block: DrawnBlock, container: HTMLElement, chart: EchartsInstance): void {
  if (typeof ResizeObserver === 'undefined') return
  block.__echartsResize?.disconnect()
  const observer = new ResizeObserver(() => chart.resize())
  observer.observe(container)
  block.__echartsResize = observer
}

/**
 * Draws `option` into a fresh box inside `block`, after any outlines its map asks for are in hand.
 * Throws rather than half-drawing: the caller decides whether a reader sees a banner or nothing at all.
 */
export async function renderEcharts(block: DrawnBlock, option: unknown, map: EchartsMapRequest | null, dark: boolean): Promise<void> {
  const echarts = await loadEcharts()
  if (map) echarts.registerMap(map.name, await loadMapGeometry(map.source) as never)
  block.__echarts?.dispose()
  delete block.__echarts
  const container = document.createElement('div')
  container.className = 'echarts-container'
  block.replaceChildren(container)
  const chart = echarts.init(container, echartsTheme(dark), { renderer: 'svg' })
  chart.setOption(applyChartPalette(option, dark) as never, true)
  block.__echarts = chart
  watchSize(block, container, chart)
}
