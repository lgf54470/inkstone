import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { DevicesBreakdownCard } from './share-dashboard-view'

describe('share devices card', () => {
  it('shows the empty row instead of bare subheadings when no device data exists', () => {
    const { container, unmount } = renderElement(createElement(DevicesBreakdownCard, { analytics: null }))
    expect(container.textContent).toContain('share.no_data_yet')
    unmount()
  })
})
