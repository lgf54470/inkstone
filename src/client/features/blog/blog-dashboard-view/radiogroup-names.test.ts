import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../lib/test-render'
import { DashboardControls } from './dashboard-controls'
import { TrendChartCard } from './trend-chart-card'

/**
 * SH-46 brought the blog dashboard's two `Segmented` controls under the same rules
 * the share dashboard already follows: the toolbar range picker carries its own
 * `label`, and the metric picker is named by the card heading it sits beside. The
 * locale is not loaded in this harness, so `t()` echoes the key and the assertions
 * compare against keys.
 */
const mounts: Array<() => void> = []

function render(node: ReactElement): void {
  mounts.push(renderElement(node).unmount)
}

afterEach(() => {
  // A failed assertion must not leave its tree behind: the next case reads the
  // first radiogroup in the document, so stale DOM would be attributed to it.
  while (mounts.length) mounts.pop()!()
})

function radiogroup(): HTMLElement {
  const group = document.querySelector('[role="radiogroup"]')
  if (!group) throw new Error('the radiogroup did not render')
  return group as HTMLElement
}

function labelledBy(group: HTMLElement): string | null {
  const id = group.getAttribute('aria-labelledby')
  return id === null ? null : (document.getElementById(id)?.textContent ?? null)
}

describe('blog dashboard range picker is named', () => {
  it('announces itself as the analytics time range', () => {
    render(createElement(DashboardControls, {
      range: '7d',
      onRangeChange: vi.fn(),
      excludeBots: true,
      onToggleBots: vi.fn(),
      loading: false,
      onRefresh: vi.fn(),
    }))

    const group = radiogroup()
    expect(group.getAttribute('aria-label')).toBe('blog.range_label')
    expect(labelledBy(group)).toBeNull()
  })
})

describe('blog trend chart metric picker is named by its heading', () => {
  it('points at the card title, not at the description under it', () => {
    render(createElement(TrendChartCard, {
      metricMode: 'views',
      onMetricModeChange: vi.fn(),
      chartValues: [1, 2, 3],
      timeline: [],
    }))

    const group = radiogroup()
    expect(group.getAttribute('aria-label')).toBeNull()
    expect(labelledBy(group)).toBe('blog.timeline_trend_title')
  })
})
