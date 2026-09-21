import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ShareGlobalAnalytics, SiteInfo } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { useSession } from '../../store/session'
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
    // Hygiene is off in this fixture: this file is about the KPI row.
    staleLinks: { thresholdDays: 0, total: 0, neverViewed: 0, items: [] },
    channels: [],
    ...overrides,
  }
}

/**
 * One card's own text, found by its label. The three cards carrying a delta share one hint string, so
 * "which card lost its comparison" cannot be asked of the row as a whole.
 */
function kpiCardText(container: HTMLElement, label: string): string {
  const heading = [...container.querySelectorAll('span')].find((element) => element.textContent === label)
  return heading?.parentElement?.parentElement?.textContent ?? ''
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
    // The percentage is plain text with its hint beside it as visually hidden text (SH-102: a
    // role-less span may not carry the `aria-label` this used to be).
    expect(kpiCardText(rendered.container, t('share.views_per_day')))
      .toContain(`+25% ${t('share.delta_vs_previous')}`)
    rendered.unmount()
  })

  it('says unique visitors are not collected when the instance keeps no fingerprint (SH-101)', () => {
    useSession.setState({ site: { visitorFingerprints: false } as SiteInfo })
    const rendered = renderElement(createElement(KpiGrid, { analytics: analyticsFixture() }))
    // The worker reports no unique visitors on such an instance, and a zero would answer a question
    // nobody asked — "nobody visited" — where the truth is "not counted here".
    expect(rendered.container.textContent).toContain(t('share.visitors_not_collected'))
    expect(rendered.container.textContent).not.toContain('40')
    rendered.unmount()
    useSession.setState({ site: null })
  })

  it('renders no delta for the rate when there is no previous window to compare with', () => {
    const rendered = renderElement(createElement(KpiGrid, { analytics: analyticsFixture({ viewsPerDayDelta: undefined }) }))
    expect(kpiCardText(rendered.container, t('share.views_per_day'))).not.toContain(t('share.delta_vs_previous'))
    // The totals keep theirs: only the rate lost the window it compares against.
    expect(kpiCardText(rendered.container, t('share.total_views_pv'))).toContain(t('share.delta_vs_previous'))
    rendered.unmount()
  })
})
