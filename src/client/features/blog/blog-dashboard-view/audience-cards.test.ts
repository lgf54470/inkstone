import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { BlogGlobalAnalytics } from '@shared/types'
import { renderElement } from '../../../lib/test-render'
import { AudienceCards } from './audience-cards'

describe('blog audience cards without traffic', () => {
  it('every card reports no visit data instead of rendering empty shells', () => {
    const { container, unmount } = renderElement(createElement(AudienceCards, { analytics: null, locale: 'en-US' }))
    const marks = (container.textContent?.match(/blog\.no_visit_data/g) ?? []).length
    expect(marks).toBeGreaterThanOrEqual(3)
    unmount()
  })
})

// UI-11: `'Direct'` is the worker's word for a visit that carried no referrer — a value, not a host.
// The share dashboard mapped it; this one drew it as if a site were called Direct.
describe('blog traffic sources', () => {
  it('words the no-referrer sentinel as the shared phrase rather than a host name', () => {
    const analytics = {
      topReferrers: [{ name: 'Direct', count: 4, percentage: 80 }, { name: 'news.ycombinator.com', count: 1 }],
      topCountries: [],
      devices: [],
      osList: [],
    } as unknown as BlogGlobalAnalytics

    const { container, unmount } = renderElement(createElement(AudienceCards, { analytics, locale: 'en-US' }))
    const text = container.textContent ?? ''
    expect(text).toContain('share.direct_access')
    expect(text).not.toContain('Direct')
    expect(text).toContain('news.ycombinator.com')
    unmount()
  })
})
