/**
 * The theme an echarts block draws with, read from the app's own tokens.
 *
 * echarts bakes its colours into the canvas at draw time, so this is called on every draw rather
 * than once at startup (ADR-0002 §5): a value cached across the module's life would freeze the
 * theme at the moment the library was first loaded. The palette is the graph tag ramp rather than a
 * chart-specific one — it is the only ten-step sequence the two themes both calibrate for contrast.
 */
import { token } from './token.ts'

/** `--graph-tag-1` … `--graph-tag-10`, the shared ten-step ramp. */
const SERIES_TOKEN_COUNT = 10

export interface EchartsTheme {
  color: string[]
  backgroundColor: string
  textStyle: { fontFamily: string; color: string }
  title: { textStyle: { color: string }; subtextStyle: { color: string } }
  legend: { textStyle: { color: string } }
  tooltip: {
    backgroundColor: string
    borderColor: string
    textStyle: { color: string }
    axisPointer: { crossStyle: { color: string }; lineStyle: { color: string } }
  }
  categoryAxis: Record<string, unknown>
  valueAxis: Record<string, unknown>
  logAxis: Record<string, unknown>
  timeAxis: Record<string, unknown>
  radar: Record<string, unknown>
}

/**
 * A chart's axes, in the shape echarts expects every axis kind to share. `splitLine` is what a grid
 * line is called on a value axis and what the spokes of a radar are called, so the same object
 * answers for both.
 */
function axisTheme(text: string, grid: string, area: string): Record<string, unknown> {
  return {
    axisLine: { lineStyle: { color: grid } },
    axisTick: { lineStyle: { color: grid } },
    axisLabel: { color: text },
    nameTextStyle: { color: text },
    splitLine: { lineStyle: { color: grid } },
    splitArea: { areaStyle: { color: [area, 'transparent'] } },
  }
}

export function echartsTheme(): EchartsTheme {
  const text = token('--text-secondary', '#475569')
  const faint = token('--text-tertiary', '#64748b')
  const grid = token('--border-subtle', 'rgba(100, 116, 139, 0.24)')
  const surface = token('--bg-overlay', 'rgba(255, 255, 255, 0.96)')
  const border = token('--border-default', 'rgba(100, 116, 139, 0.32)')
  const body = token('--text-primary', '#0f172a')
  const area = token('--bg-sunken', 'rgba(100, 116, 139, 0.06)')
  return {
    color: Array.from({ length: SERIES_TOKEN_COUNT }, (_, index) => token(`--graph-tag-${index + 1}`, body)),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: token('--font-ui', 'sans-serif'), color: text },
    title: { textStyle: { color: body }, subtextStyle: { color: faint } },
    legend: { textStyle: { color: text } },
    tooltip: {
      backgroundColor: surface,
      borderColor: border,
      textStyle: { color: body },
      axisPointer: { crossStyle: { color: faint }, lineStyle: { color: faint } },
    },
    categoryAxis: axisTheme(text, grid, area),
    valueAxis: axisTheme(text, grid, area),
    logAxis: axisTheme(text, grid, area),
    timeAxis: axisTheme(text, grid, area),
    radar: {
      axisName: { color: text },
      splitLine: { lineStyle: { color: grid } },
      axisLine: { lineStyle: { color: grid } },
      splitArea: { areaStyle: { color: [area, 'transparent'] } },
    },
  }
}
