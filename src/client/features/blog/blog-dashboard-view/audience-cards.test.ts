import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
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
