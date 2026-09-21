import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../lib/test-render'
import { BigSvgChart, chartSummary } from './big-svg-chart'
import type { ShareTimelinePoint } from '@shared/types'

function points(labels: string[], views: number[]): ShareTimelinePoint[] {
  return labels.map((label, i) => ({ label, timestamp: i, views: views[i], visitors: views[i] }))
}

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
