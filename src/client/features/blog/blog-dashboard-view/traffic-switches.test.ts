import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../lib/test-render'
import { api } from '../../../lib/api'
import { useBlogStore } from '../blog-store'
import { useBlogDashboardView } from './use-blog-dashboard-view'

vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      analytics: vi.fn(async () => ({ analytics: { range: '7d', totalViews: 0, totalVisitors: 0, storedViews: 0 } })),
    },
  },
}))

/**
 * The dashboard is mounted for its side effect only: which question it asks the analytics endpoint.
 * The switches used to be split in two — the dashboard kept its own `excludeBots` and sent that one
 * alone while the store held three that nothing sent — so flipping "exclude self-referrals" in the
 * toolbar changed the label and nothing else.
 */
function Probe() {
  useBlogDashboardView()
  return null
}

const analytics = api.blog.analytics as unknown as ReturnType<typeof vi.fn>
let unmount: (() => void) | null = null

describe('blog dashboard traffic switches', () => {
  beforeEach(() => {
    analytics.mockClear()
    useBlogStore.setState({ excludeBots: true, excludeSelfReferrers: false, excludeOwner: false })
  })

  afterEach(() => {
    // A probe left mounted keeps answering the store, and its request would land in the next case.
    unmount?.()
    unmount = null
    document.body.innerHTML = ''
  })

  function mountProbe(): void {
    unmount = renderElement(createElement(Probe)).unmount
  }

  it('asks for the range with all three switches the store holds', async () => {
    useBlogStore.setState({ excludeBots: true, excludeSelfReferrers: true, excludeOwner: true })
    mountProbe()

    await vi.waitFor(() => expect(analytics).toHaveBeenCalled())
    expect(analytics).toHaveBeenCalledWith('7d', {
      excludeBots: true,
      excludeSelf: true,
      excludeOwner: true,
    })
  })

  it('re-asks when a switch is flipped somewhere else in the hub', async () => {
    mountProbe()
    await vi.waitFor(() => expect(analytics).toHaveBeenCalledTimes(1))

    useBlogStore.getState().setFilters({ excludeSelfReferrers: true })

    await vi.waitFor(() => expect(analytics).toHaveBeenCalledTimes(2))
    expect(analytics.mock.calls[1][1]).toMatchObject({ excludeSelf: true })
  })
})
