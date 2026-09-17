export interface ChartPoint {
  label: string
  value: number
}

export interface ChartBox {
  width: number
  height: number
}

export interface BarRect {
  x: number
  y: number
  width: number
  height: number
  label: string
}

export interface ChartDot {
  x: number
  y: number
  label: string
}

export interface PieSlice {
  d: string
  index: number
}

export interface LineChart {
  d: string
  dots: ChartDot[]
}

export interface BarChart {
  rects: BarRect[]
  baseline: number
}

/** Air a preset leaves on every side; the marks are drawn inside it, never against the edge. */
export const CHART_PADDING = 16

const BAR_FILL_RATIO = 0.68
const MIN_SPAN = 1

/** The tallest value, so every preset shares one vertical scale (and a flat series cannot divide by zero). */
export function chartPeak(data: ChartPoint[]): number {
  return Math.max(...data.map((point) => Math.max(point.value, 0)), MIN_SPAN)
}

function plotBox(box: ChartBox): ChartBox {
  return {
    width: Math.max(box.width - CHART_PADDING * 2, MIN_SPAN),
    height: Math.max(box.height - CHART_PADDING * 2, MIN_SPAN),
  }
}

/** Bars stand on the baseline, so their y and height are both the value against the peak. */
export function barChart(data: ChartPoint[], box: ChartBox): BarChart {
  const plot = plotBox(box)
  const peak = chartPeak(data)
  const slot = plot.width / Math.max(data.length, 1)
  const width = slot * BAR_FILL_RATIO
  const baseline = CHART_PADDING + plot.height

  return {
    baseline,
    rects: data.map((point, index) => {
      const height = (Math.max(point.value, 0) / peak) * plot.height
      return {
        x: CHART_PADDING + index * slot + (slot - width) / 2,
        y: baseline - height,
        width,
        height,
        label: point.label,
      }
    }),
  }
}

function dotAt(point: ChartPoint, index: number, data: ChartPoint[], box: ChartBox): ChartDot {
  const plot = plotBox(box)
  const span = Math.max(data.length - 1, 1)
  const peak = chartPeak(data)
  return {
    x: CHART_PADDING + (index / span) * plot.width,
    y: CHART_PADDING + (1 - Math.max(point.value, 0) / peak) * plot.height,
    label: point.label,
  }
}

/** One path through the dots: a line chart is the polyline, its dots are the same points. */
export function lineChart(data: ChartPoint[], box: ChartBox): LineChart {
  const dots = data.map((point, index) => dotAt(point, index, data, box))
  const d = dots
    .map((dot, index) => `${index === 0 ? 'M' : 'L'} ${round(dot.x)} ${round(dot.y)}`)
    .join(' ')
  return { d, dots }
}

export function scatterChart(data: ChartPoint[], box: ChartBox): ChartDot[] {
  return data.map((point, index) => dotAt(point, index, data, box))
}

/**
 * Slices start at twelve o'clock and run clockwise, so a deck's first value is always the
 * top-right wedge however many values follow it. Values are clamped at zero: a negative
 * count in a pie is not a smaller wedge, it is data the preset cannot show.
 */
export function pieChart(data: ChartPoint[], box: ChartBox): PieSlice[] {
  const cx = box.width / 2
  const cy = box.height / 2
  const radius = Math.max(Math.min(cx, cy) - CHART_PADDING / 2, MIN_SPAN)
  const values = data.map((point) => Math.max(point.value, 0))
  const total = values.reduce((sum, value) => sum + value, 0) || MIN_SPAN

  let angle = -Math.PI / 2
  return data.map((_point, index) => {
    const sweep = (values[index]! / total) * Math.PI * 2
    const start = angle
    const end = angle + sweep
    angle = end
    const large = sweep > Math.PI ? 1 : 0
    return {
      index,
      d: [
        `M ${round(cx)} ${round(cy)}`,
        `L ${round(cx + radius * Math.cos(start))} ${round(cy + radius * Math.sin(start))}`,
        `A ${round(radius)} ${round(radius)} 0 ${large} 1 ${round(cx + radius * Math.cos(end))} ${round(cy + radius * Math.sin(end))}`,
        'Z',
      ].join(' '),
    }
  })
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
