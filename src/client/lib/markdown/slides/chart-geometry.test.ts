import { describe, expect, it } from 'vitest'
import { CHART_PADDING, barChart, chartPeak, lineChart, pieChart, scatterChart } from './chart-geometry'

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
