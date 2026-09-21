import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ShareGlobalAnalytics } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { KpiGrid } from './share-dashboard-kpis'

/**
 * SH-56: the per-day rate used to draw the same sparkline as the total-views card (the same line
 * twice on one row, so it carried no information) and had no comparison of its own. What it has to
 * keep: exactly two sparklines across the four cards, and a delta on the per-day card that says
 * what it is measured against.
 */
function analyticsFixture(overrides: Partial<ShareGlobalAnalytics> = {}): ShareGlobalAnalytics {
  return {
    range: '7d',
    totalShares: 5,
    activeShares: 3,
    totalViews: 300,
    totalVisitors: 40,
    viewsDelta: 12,
    visitorsDelta: -4,
    viewsPerDay: 42.9,
    viewsPerDayDelta: 25,
    sparklineViews: [1, 4, 2],
    sparklineVisitors: [1, 2, 1],
    timeline: [],
    topNotes: [],
    topCountries: [],
    topReferrers: [],
    devices: [],
    osList: [],
    browsers: [],
    recentVisits: [],
    ...overrides,
  }
}

describe('share dashboard KPI row (SH-56)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('draws the sparkline for the totals only', () => {
    const rendered = renderElement(createElement(KpiGrid, { analytics: analyticsFixture() }))
    // The two totals keep their lines; the per-day rate does not repeat the views line.
    expect(rendered.container.querySelectorAll('[aria-hidden="true"] svg').length).toBe(2)
    rendered.unmount()
  })

  it('compares the per-day rate with the previous window and shows the decimal', () => {
    const rendered = renderElement(createElement(KpiGrid, { analytics: analyticsFixture() }))
    expect(rendered.container.textContent).toContain('42.9')
    const labels = [...rendered.container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))
    expect(labels).toContain(`+25% ${t('share.delta_vs_previous')}`)
    rendered.unmount()
  })

  it('renders no delta for the rate when there is no previous window to compare with', () => {
    const rendered = renderElement(createElement(KpiGrid, { analytics: analyticsFixture({ viewsPerDayDelta: undefined }) }))
    const labels = [...rendered.container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))
    expect(labels).not.toContain(`+25% ${t('share.delta_vs_previous')}`)
    rendered.unmount()
  })
})
