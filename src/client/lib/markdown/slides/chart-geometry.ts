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
  return { d: polyline(dots), dots }
}

function polyline(dots: ChartDot[]): string {
  return dots.map((dot, index) => `${index === 0 ? 'M' : 'L'} ${round(dot.x)} ${round(dot.y)}`).join(' ')
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

/**
 * A chart whose values arrive in series: several bars or lines side by side, each scaled by the
 * value axis it belongs to. A second axis is a second scale in the same box rather than a second
 * picture, which is how a chart can show two units — signups and a growth rate — at once.
 */
export interface ValueSeries {
  kind: 'bar' | 'line' | 'scatter'
  values: number[]
  /** Scatter only: its x is data, so the pairs travel with the series. */
  pairs: { x: number; y: number }[]
  axis: 0 | 1
}

/** A bar of one of several series; which series it belongs to decides its colour. */
export interface SeriesBar extends BarRect {
  seriesIndex: number
}

/** A dot of one of several series, for the same reason. */
export interface SeriesDot extends ChartDot {
  seriesIndex: number
}

export interface SeriesLine {
  seriesIndex: number
  d: string
  dots: ChartDot[]
}

/** Where the category marks stand: the floor of the plot, which every preset shares. */
export function baselineY(box: ChartBox): number {
  return CHART_PADDING + plotBox(box).height
}

/** Where the category slots sit, so the marks and their labels land on the same centres. */
export function categorySlots(box: ChartBox, count: number): { slot: number; baseline: number } {
  return { slot: plotBox(box).width / Math.max(count, 1), baseline: baselineY(box) }
}

/** The peak of each value axis, so each axis scales to its own tallest mark. */
export function axisPeaks(series: ValueSeries[]): [number, number] {
  const peaks: [number, number] = [MIN_SPAN, MIN_SPAN]
  for (const one of series) {
    const values = one.kind === 'scatter' ? one.pairs.map((pair) => pair.y) : one.values
    peaks[one.axis] = Math.max(peaks[one.axis], ...values.map((value) => Math.max(value, 0)))
  }
  return peaks
}

/** Bars grouped inside each category slot: one bar per series, each against its own axis. */
export function seriesBars({ values, seriesIndex, seriesCount, peak, labels, box }: {
  values: number[]
  seriesIndex: number
  seriesCount: number
  peak: number
  labels: string[]
  box: ChartBox
}): SeriesBar[] {
  const { slot, baseline } = categorySlots(box, values.length)
  const group = slot * BAR_FILL_RATIO
  const width = group / Math.max(seriesCount, 1)
  const height = plotBox(box).height
  return values.map((value, index) => ({
    seriesIndex,
    x: CHART_PADDING + index * slot + (slot - group) / 2 + seriesIndex * width,
    y: baseline - (Math.max(value, 0) / peak) * height,
    width,
    height: (Math.max(value, 0) / peak) * height,
    label: labels[index] ?? '',
  }))
}

/** A polyline through the centre of each category slot — the slots the bars stand in. */
export function seriesLine({ values, seriesIndex, peak, box }: {
  values: number[]
  seriesIndex: number
  peak: number
  box: ChartBox
}): SeriesLine {
  const { slot, baseline } = categorySlots(box, values.length)
  const height = plotBox(box).height
  const dots = values.map((value, index) => ({
    x: round(CHART_PADDING + (index + 0.5) * slot),
    y: round(baseline - (Math.max(value, 0) / peak) * height),
    label: '',
  }))
  return { seriesIndex, dots, d: polyline(dots) }
}

/**
 * Scatter in the data's own coordinates: each axis takes the spread it actually has. A series
 * whose values share one x is centred rather than pinned to an edge, because a single column
 * against the left edge would read as a value at the axis minimum.
 */
export function xyScatter({ pairs, seriesIndex, box }: {
  pairs: { x: number; y: number }[]
  seriesIndex: number
  box: ChartBox
}): SeriesDot[] {
  const plot = plotBox(box)
  const xs = pairs.map((pair) => pair.x)
  const ys = pairs.map((pair) => pair.y)
  return pairs.map((pair) => ({
    seriesIndex,
    x: round(spread(pair.x, xs, plot.width)),
    y: round(CHART_PADDING + plot.height - spread(pair.y, ys, plot.height)),
    label: '',
  }))
}

function spread(value: number, values: number[], size: number): number {
  const lowest = Math.min(...values)
  const span = Math.max(...values) - lowest
  if (span === 0) return CHART_PADDING + size / 2
  return CHART_PADDING + ((value - lowest) / span) * size
}
