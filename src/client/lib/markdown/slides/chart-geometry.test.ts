import { describe, expect, it } from 'vitest'
import {
  CHART_PADDING,
  axisPeaks,
  barChart,
  baselineY,
  chartPeak,
  lineChart,
  pieChart,
  scatterChart,
  seriesBars,
  seriesLine,
  xyScatter,
  type ValueSeries,
} from './chart-geometry'

const data = [
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 30 },
  { label: 'Mar', value: 20 },
]

const box = { width: 400, height: 300 }

describe('chartPeak', () => {
  it('is the tallest value', () => {
    expect(chartPeak(data)).toBe(30)
  })

  it('never divides by zero on an empty or flat series', () => {
    expect(chartPeak([])).toBe(1)
    expect(chartPeak([{ label: 'a', value: 0 }])).toBe(1)
  })
})

describe('barChart', () => {
  it('stands every bar on one baseline with its height set by the peak', () => {
    const { rects, baseline } = barChart(data, box)
    expect(rects).toHaveLength(3)
    expect(baseline).toBe(CHART_PADDING + box.height - CHART_PADDING * 2)
    for (const rect of rects) {
      expect(rect.y + rect.height).toBeCloseTo(baseline)
    }
    expect(rects[1]!.height).toBeGreaterThan(rects[0]!.height)
  })

  it('keeps the bars inside the plot and apart from each other', () => {
    const { rects } = barChart(data, box)
    expect(rects[0]!.x).toBeGreaterThanOrEqual(CHART_PADDING)
    const last = rects[2]!
    expect(last.x + last.width).toBeLessThanOrEqual(box.width - CHART_PADDING)
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x + rects[0]!.width)
  })
})

describe('lineChart', () => {
  it('walks the points left to right and rises with the value', () => {
    const { d, dots } = lineChart(data, box)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.match(/L /g)).toHaveLength(2)
    expect(dots[1]!.y).toBeLessThan(dots[0]!.y)
    expect(dots[1]!.x).toBeGreaterThan(dots[0]!.x)
  })
})

describe('scatterChart', () => {
  it('places one point per value', () => {
    const dots = scatterChart(data, box)
    expect(dots).toHaveLength(3)
    expect(dots[2]!.label).toBe('Mar')
  })
})

describe('a chart whose values come in series', () => {
  const views: ValueSeries = { kind: 'bar', values: [40, 20], pairs: [], axis: 0 }
  const growth: ValueSeries = { kind: 'line', values: [1, 3], pairs: [], axis: 1 }

  it('scales each value axis to its own tallest mark', () => {
    expect(axisPeaks([views, growth])).toEqual([40, 3])
    expect(axisPeaks([])).toEqual([1, 1])
  })

  it('groups the bars of one series inside each category slot', () => {
    const group = (values: number[], seriesIndex: number) =>
      seriesBars({ values, seriesIndex, seriesCount: 2, peak: 40, labels: ['a', 'b'], box })
    const [first, second] = [group([40, 20], 0), group([10, 30], 1)]
    expect(first).toHaveLength(2)
    expect(first[0]!.x + first[0]!.width).toBeCloseTo(second[0]!.x)
    for (const rect of [...first, ...second]) expect(rect.y + rect.height).toBeCloseTo(baselineY(box))
    const solo = seriesBars({ values: [40], seriesIndex: 0, seriesCount: 1, peak: 40, labels: [], box })[0]!
    expect(first[0]!.height).toBeCloseTo(solo.height)
    expect(second[1]!.height).toBeCloseTo(solo.height * 0.75)
  })

  it('draws a line through the centre of the slots the bars stand in', () => {
    const line = seriesLine({ values: [30, 20, 10], seriesIndex: 1, peak: 30, box })
    const rect = seriesBars({ values: [1, 2, 3], seriesIndex: 0, seriesCount: 1, peak: 30, labels: [], box })[0]!
    expect(line.seriesIndex).toBe(1)
    expect(line.d.match(/L /g)).toHaveLength(2)
    expect(line.dots[0]!.x).toBeCloseTo(rect.x + rect.width / 2)
    expect(line.dots[1]!.y).toBeGreaterThan(line.dots[0]!.y)
  })

  it('plots a scatter in the data own coordinates, centring a series that shares one x', () => {
    const dots = xyScatter({ pairs: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 20 }], seriesIndex: 2, box })
    expect(dots.map((dot) => dot.seriesIndex)).toEqual([2, 2, 2])
    expect(dots[1]!.x).toBeGreaterThan(dots[0]!.x)
    expect(dots[1]!.y).toBeLessThan(dots[0]!.y)
    expect(dots[2]!.x).toBeCloseTo(box.width / 2)

    const single = xyScatter({ pairs: [{ x: 7, y: 1 }, { x: 7, y: 9 }], seriesIndex: 0, box })
    expect(single[0]!.x).toBeCloseTo(box.width / 2)
    expect(single[1]!.x).toBeCloseTo(box.width / 2)
  })
})

describe('pieChart', () => {
  it('gives every value a wedge and covers the full circle', () => {
    const slices = pieChart(data, box)
    expect(slices).toHaveLength(3)
    for (const slice of slices) expect(slice.d).toContain(' A ')
  })

  it('starts the first wedge at the top of the circle', () => {
    const [first] = pieChart(data, box)
    // Centre plus radius at -90°, i.e. straight up from the middle.
    expect(first!.d).toContain(`L ${box.width / 2} ${box.height / 2 - Math.min(box.width, box.height) / 2 + CHART_PADDING / 2}`)
  })
})
