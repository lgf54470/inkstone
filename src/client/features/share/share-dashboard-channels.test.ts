import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ShareGlobalAnalytics } from '@shared/types'
import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED } from '@shared/share-channel'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { ReferrerBreakdownCard } from './share-dashboard-breakdown'

function analytics(channels: ShareGlobalAnalytics['channels']): ShareGlobalAnalytics {
  return {
    range: '7d',
    totalShares: 1,
    activeShares: 1,
    totalViews: 10,
    totalVisitors: 4,
    viewsPerDay: 1.4,
    sparklineViews: [],
    sparklineVisitors: [],
    timeline: [],
    topNotes: [],
    topCountries: [],
    topReferrers: [{ name: 'Direct', count: 10, percentage: 100 }],
    devices: [],
    osList: [],
    browsers: [],
    channels,
    recentVisits: [],
    staleLinks: { thresholdDays: 0, total: 0, neverViewed: 0, items: [] },
  }
}

describe('dashboard channel split (ADR-0004)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('names the two miss rows apart from each other and from a real marker', () => {
    const rendered = renderElement(createElement(ReferrerBreakdownCard, {
      analytics: analytics([
        { name: CHANNEL_UNMARKED, count: 6, percentage: 60 },
        { name: 'newsletter', count: 3, percentage: 30 },
        { name: CHANNEL_UNRECOGNIZED, count: 1, percentage: 10 },
      ]),
    }))
    const text = rendered.container.textContent ?? ''

    expect(text).toContain(t('share.channel_section_title'))
    expect(text).toContain(t('share.channel_none'))
    expect(text).toContain(t('share.channel_unrecognized'))
    // The copy must not collapse a refused marker into "no marker": they are different answers.
    expect(t('share.channel_none')).not.toBe(t('share.channel_unrecognized'))
    expect(text).toContain('newsletter')
    rendered.unmount()
  })
})

describe('dashboard channel copy (ADR-0004)', () => {
  it('explains how to make a marker only while no marker has come back', () => {
    const withoutMarker = renderElement(createElement(ReferrerBreakdownCard, {
      analytics: analytics([{ name: CHANNEL_UNMARKED, count: 6, percentage: 100 }]),
    }))
    expect(withoutMarker.container.textContent).toContain(t('share.channel_hint'))
    withoutMarker.unmount()

    const withMarker = renderElement(createElement(ReferrerBreakdownCard, {
      analytics: analytics([
        { name: 'newsletter', count: 9, percentage: 90 },
        { name: CHANNEL_UNMARKED, count: 1, percentage: 10 },
      ]),
    }))
    expect(withMarker.container.textContent).not.toContain(t('share.channel_hint'))
    withMarker.unmount()
  })

  it('renders a marker as text and never into an attribute or an element', () => {
    const rendered = renderElement(createElement(ReferrerBreakdownCard, {
      analytics: analytics([{ name: 'newsletter', count: 3, percentage: 100 }]),
    }))

    expect(rendered.container.textContent).toContain('newsletter')
    // The stored value is charset-bounded, but the display path does not rely on that alone.
    for (const element of rendered.container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain('newsletter')
      }
    }
    rendered.unmount()
  })

  it('shows no split at all when the range has no visits', () => {
    const rendered = renderElement(createElement(ReferrerBreakdownCard, { analytics: analytics([]) }))

    expect(rendered.container.textContent).not.toContain(t('share.channel_section_title'))
    rendered.unmount()
  })
})
