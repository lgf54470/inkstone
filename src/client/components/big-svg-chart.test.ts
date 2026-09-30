import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../lib/test-render'
import { BigSvgChart, chartAxisTicks, chartSummary } from './big-svg-chart'
import type { ShareTimelinePoint } from '@shared/types'

function points(labels: string[], views: number[]): ShareTimelinePoint[] {
  return labels.map((label, i) => ({ label, timestamp: i, views: views[i], visitors: views[i] }))
}

// UI-12: the grid rounded quarter steps of the peak to integers, so a small peak wrote the same
// number down the whole axis (1/1/1/0 for a peak of 1) and the chart told the reader nothing.
describe('chart axis (UI-12)', () => {
  it('gives every grid line its own number even when the peak is tiny', () => {
    for (const peak of [0, 1, 2, 3, 4, 7, 12, 100]) {
      const ticks = chartAxisTicks(peak)
      expect(new Set(ticks).size, `peak ${peak} repeated a label: ${ticks.join('/')}`).toBe(ticks.length)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(peak)
    }
  })

  it('keeps the peak inside the ceiling and the ceiling a round number', () => {
    expect(chartAxisTicks(3)).toEqual([0, 1, 2, 3, 4, 5])
    expect(chartAxisTicks(7)).toEqual([0, 2, 4, 6, 8, 10])
    expect(chartAxisTicks(1)).toEqual([0, 1])
  })

  it('writes those labels on the drawing, none of them repeated', () => {
    const rendered = renderElement(createElement(BigSvgChart, {
      values: [1, 3, 2],
      timeline: points(['Jan 1', 'Jan 2', 'Jan 3'], [1, 3, 2]),
      emptyLabel: 'No data',
      ariaLabel: 'Traffic trend chart',
    }))
    const labels = [...rendered.container.querySelectorAll('text[text-anchor="end"]')].map((el) => el.textContent)
    expect(labels.length).toBeGreaterThan(1)
    expect(new Set(labels).size).toBe(labels.length)
    rendered.unmount()
  })

  it('draws circles round rather than stretched to the container', () => {
    const rendered = renderElement(createElement(BigSvgChart, {
      values: [1, 4, 2],
      timeline: points(['Jan 1', 'Jan 2', 'Jan 3'], [1, 4, 2]),
      emptyLabel: 'No data',
      ariaLabel: 'Traffic trend chart',
    }))
    // `none` scaled x and y by different factors, so every dot and glyph came out distorted.
    expect(rendered.container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    rendered.unmount()
  })
})

describe('big trend chart (SH-57)', () => {
  it('summarizes the zone with its total and where the peak happened', () => {
    expect(chartSummary([1, 5, 3], ['a', 'b', 'c'])).toEqual({ total: 9, peak: 5, peakLabel: 'b' })
    expect(chartSummary([], [])).toEqual({ total: 0, peak: 0, peakLabel: '' })
  })

  it('exposes the drawing as an image with the name its caller built', () => {
    const rendered = renderElement(createElement(BigSvgChart, {
      values: [1, 4, 2],
      timeline: points(['Jan 1', 'Jan 2', 'Jan 3'], [1, 4, 2]),
      emptyLabel: 'No data',
      ariaLabel: 'Traffic trend chart: 7 in this range, peaking at 4 around Jan 2',
    }))
    const chart = rendered.container.querySelector('svg[role="img"]')
    expect(chart?.getAttribute('aria-label')).toBe('Traffic trend chart: 7 in this range, peaking at 4 around Jan 2')
    rendered.unmount()
  })

  it('draws the empty state instead of a nameless chart when the zone holds nothing', () => {
    const rendered = renderElement(createElement(BigSvgChart, {
      values: [0, 0],
      timeline: points(['Jan 1', 'Jan 2'], [0, 0]),
      emptyLabel: 'No data',
      ariaLabel: 'Traffic trend chart',
    }))
    expect(rendered.container.querySelector('svg')).toBeNull()
    expect(rendered.container.textContent).toContain('No data')
    rendered.unmount()
  })
})
