import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { DashboardHeader } from './share-dashboard-header'

/**
 * SH-54: the numbers on this dashboard read every share, while the sidebar right beside it can have a
 * folder or a tag selected — so the page has to say which of the two it is showing. The assertion is
 * on the words, not on the markup: a scope that only exists in a design file is the bug.
 */
function bundleStub() {
  return {
    range: '7d' as const,
    setRange: () => {},
    isLoading: false,
    loadData: async () => {},
  }
}

describe('share dashboard scope (SH-54)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('names the scope of its numbers next to the title', () => {
    const rendered = renderElement(createElement(DashboardHeader, { bundle: bundleStub() as never }))
    expect(rendered.container.textContent).toContain(t('share.analytics_dashboard_title'))
    expect(rendered.container.textContent).toContain(t('share.analytics_dashboard_scope'))
    rendered.unmount()
  })
})
