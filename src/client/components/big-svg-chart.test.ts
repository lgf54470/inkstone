import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { BigSvgChart } from './big-svg-chart'
import { renderElement } from '../lib/test-render'

const timeline = ['a', 'b', 'c'].map((label, i) => ({ label, timestamp: i * 3600_000, views: 0, visitors: 0 }))

function renderChart(values: number[]) {
  return renderElement(createElement(BigSvgChart, { values, timeline, emptyLabel: 'NO_DATA' }))
}

describe('BigSvgChart empty states', () => {
  it('shows the empty label instead of a zero-value line', () => {
    const { container, unmount } = renderChart([0, 0, 0])
    expect(container.textContent).toContain('NO_DATA')
    expect(container.querySelector('path')).toBeNull()
    unmount()
  })

  it('still paints the series once any bucket carries traffic', () => {
    const { container, unmount } = renderChart([0, 5, 0])
    expect(container.querySelector('path')).not.toBeNull()
    expect(container.textContent).not.toContain('NO_DATA')
    unmount()
  })
})
