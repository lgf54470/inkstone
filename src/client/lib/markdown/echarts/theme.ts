/**
 * The theme an echarts block draws with, read from the app's own tokens.
 *
 * echarts bakes its colours into the canvas at draw time, so this is called on every draw rather
 * than once at startup (ADR-0002 §5): a value cached across the module's life would freeze the
 * theme at the moment the library was first loaded. The series colours come from the account's
 * accent rather than a library default rainbow — see ../chart/palette for how the ramp is built.
 */
import { token } from '../style-token'
import { chartPalette, chartRamp } from '../chart'

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

/**
 * Fills the accent ramp into the continuous scales a table chart builds, leaving anything the note
 * already stated alone: `visualMap` is what colours a heatmap cell or a choropleth region, and
 * without an explicit range echarts draws its own default blue.
 */
export function applyChartPalette(option: unknown, dark: boolean): unknown {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return option
  const source = option as Record<string, unknown>
  const next: Record<string, unknown> = { ...source }
  const ramp = chartRamp(dark)
  if (source.visualMap && typeof source.visualMap === 'object' && !Array.isArray(source.visualMap)) {
    const map = source.visualMap as Record<string, unknown>
    if (map.inRange === undefined) next.visualMap = { ...map, inRange: { color: ramp } }
  }
  return next
}

export function echartsTheme(dark: boolean): EchartsTheme {
  const text = token('--text-secondary', '#475569')
  const faint = token('--text-tertiary', '#64748b')
  const grid = token('--border-subtle', 'rgba(100, 116, 139, 0.24)')
  const surface = token('--bg-overlay', 'rgba(255, 255, 255, 0.96)')
  const border = token('--border-default', 'rgba(100, 116, 139, 0.32)')
  const body = token('--text-primary', '#0f172a')
  const area = token('--bg-sunken', 'rgba(100, 116, 139, 0.06)')
  return {
    color: chartPalette(dark),
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
