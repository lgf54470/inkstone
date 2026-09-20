import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { ShareDashboardView } from './share-dashboard-view'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      globalAnalytics: vi.fn(),
    },
  },
}))

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function clickRefresh(root: ParentNode) {
  const refresh = root.querySelector('button[aria-label="common.refresh"]')
  expect(refresh).not.toBeNull()
  await act(async () => {
    ;(refresh as HTMLButtonElement).click()
  })
  await flush()
}

function analyticsFixture() {
  return {
    timeline: [],
    topNotes: [],
    topCountries: [],
    topReferrers: [],
    devices: [],
    osList: [],
    recentVisits: [],
    filterStats: { bots: 0, selfReferrals: 0, owner: 0 },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('share dashboard first load (SH-55)', () => {
  it('shows a loading state instead of zeroed cards before the first response', async () => {
    vi.mocked(api.share.globalAnalytics).mockReturnValueOnce(new Promise(() => {}))
    const rendered = renderElement(createElement(ShareDashboardView))
    await flush()

    expect(rendered.container.querySelector('[role="status"]')).not.toBeNull()
    expect(rendered.container.textContent).not.toContain('share.total_views_pv')
    expect(rendered.container.textContent).not.toContain('share.no_data_yet')
    rendered.unmount()
  })

  it('swaps the loading state for real cards once analytics arrive', async () => {
    vi.mocked(api.share.globalAnalytics).mockResolvedValueOnce(analyticsFixture())
    const rendered = renderElement(createElement(ShareDashboardView))
    await flush()

    expect(rendered.container.querySelector('[role="status"]')).toBeNull()
    expect(rendered.container.textContent).toContain('share.total_views_pv')
    rendered.unmount()
  })

  it('keeps the loaded cards on screen while a refresh is in flight', async () => {
    vi.mocked(api.share.globalAnalytics).mockResolvedValueOnce(analyticsFixture())
    const rendered = renderElement(createElement(ShareDashboardView))
    await flush()
    expect(rendered.container.textContent).toContain('share.total_views_pv')

    vi.mocked(api.share.globalAnalytics).mockReturnValueOnce(new Promise(() => {}))
    await clickRefresh(rendered.container)

    expect(rendered.container.querySelector('[role="status"]')).toBeNull()
    expect(rendered.container.textContent).toContain('share.total_views_pv')
    rendered.unmount()
  })
})
