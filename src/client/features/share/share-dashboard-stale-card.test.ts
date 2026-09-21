import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareGlobalAnalytics } from '@shared/types'

const H = vi.hoisted(() => ({
  globalAnalytics: vi.fn(),
  batch: vi.fn(),
  list: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      globalAnalytics: H.globalAnalytics,
      batch: H.batch,
      list: H.list,
      stats: vi.fn(async () => ({ totalShares: 0, activeShares: 0, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../components/overlay')>()
  return { ...module, confirm: H.confirm }
})

import { renderElement } from '../../lib/test-render'
import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { daysSinceVisit } from './share-stale-links-actions'
import { ShareDashboardView } from './share-dashboard-view'

/**
 * SH-70: the dashboard's hygiene report. Two things make it worth trusting: it states the threshold
 * it was measured against (so "quiet" is the owner's number, not a shipped one), and its one action
 * pauses exactly the links it listed — a page of the total — rather than standing in for the rest.
 */
function quietLink(noteId: string, lastViewedAt: number | null) {
  return { noteId, noteTitle: `Note ${noteId}`, slug: `slug-${noteId}`, lastViewedAt, views: lastViewedAt === null ? 0 : 5 }
}

function analytics(overrides: Partial<ShareGlobalAnalytics> = {}): ShareGlobalAnalytics {
  return {
    range: '7d',
    totalShares: 4,
    activeShares: 4,
    totalViews: 30,
    totalVisitors: 9,
    viewsPerDay: 4,
    sparklineViews: [],
    sparklineVisitors: [],
    timeline: [],
    topNotes: [],
    topCountries: [],
    topReferrers: [],
    devices: [],
    osList: [],
    browsers: [],
    channels: [],
    recentVisits: [],
    staleLinks: {
      // Deliberately not the shipped 90: a card that printed a constant would still pass with the
      // default, and the threshold is exactly the thing that must follow the account.
      thresholdDays: 30,
      total: 4,
      neverViewed: 2,
      items: [quietLink('a', null), quietLink('b', 120)],
    },
    ...overrides,
  }
}

async function mountView(fixture: ShareGlobalAnalytics = analytics()) {
  H.globalAnalytics.mockResolvedValue(fixture)
  const rendered = renderElement(createElement(ShareDashboardView, {}))
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
  })
  return rendered
}

function pauseButton(): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === t('share.stale_pause_action'),
  )
  expect(found, 'the pause action').toBeDefined()
  return found as HTMLButtonElement
}

beforeEach(async () => {
  vi.clearAllMocks()
  H.confirm.mockResolvedValue(true)
  H.list.mockResolvedValue({ shares: [], total: 0, truncated: false })
  H.batch.mockResolvedValue({ ok: true, count: 2 })
  await initI18n()
})

describe('dashboard quiet links card (SH-70)', () => {
  it('states the count against the account threshold it was measured with', async () => {
    const rendered = await mountView()

    expect(document.body.textContent).toContain(t('share.stale_links_badge', { days: 30 }))
    expect(document.body.textContent).toContain(t('share.stale_links_summary', { count: 4, never: 2 }))
    rendered.unmount()
  })

  it('says when each listed link was last read, and that one was never opened', async () => {
    const rendered = await mountView()

    expect(document.body.textContent).toContain('Note a')
    expect(document.body.textContent).toContain(t('share.stale_never_viewed'))
    // 120 days before now, read off the same helper the card uses rather than a typed-in number.
    const expected = t('share.stale_last_viewed', { days: daysSinceVisit(analytics().staleLinks.items[1].lastViewedAt) })
    expect(document.body.textContent).toContain(expected)
    rendered.unmount()
  })

})

describe('dashboard quiet links card states (SH-70)', () => {
  it('draws nothing at all when the owner turned the report off', async () => {
    const off = analytics({ staleLinks: { thresholdDays: 0, total: 9, neverViewed: 9, items: [] } })
    const rendered = await mountView(off)

    expect(document.body.textContent).not.toContain(t('share.stale_links_title'))
    rendered.unmount()
  })

  it('reports a clean bill of health rather than an empty card', async () => {
    const clean = analytics({ staleLinks: { thresholdDays: 30, total: 0, neverViewed: 0, items: [] } })
    const rendered = await mountView(clean)

    expect(document.body.textContent).toContain(t('share.stale_links_empty', { days: 30 }))
    // Nothing to pause, so the action is not offered at all.
    expect([...document.body.querySelectorAll('button')].some((b) => b.textContent?.trim() === t('share.stale_pause_action'))).toBe(false)
    rendered.unmount()
  })
})

describe('dashboard quiet links pause (SH-70)', () => {
  it('asks first, then pauses exactly the links it listed and reports it', async () => {
    // Spy before mounting: the hook takes the toast function once, when it renders, so a spy
    // installed afterwards would never be the function that is actually called.
    const toast = vi.spyOn(useUi.getState(), 'toast')
    const rendered = await mountView()

    await act(async () => {
      pauseButton().click()
    })

    expect(H.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: t('share.stale_pause_confirm_title', { count: 2 }) }),
    )
    // The page is what gets paused: link c and d are quiet too, but they are not on screen.
    expect(H.batch).toHaveBeenCalledWith('disable', ['a', 'b'], undefined, undefined)
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: t('share.stale_pause_success', { count: 2 }) }),
    )
    toast.mockRestore()
    rendered.unmount()
  })

  it('pauses nothing when the confirmation is declined', async () => {
    H.confirm.mockResolvedValue(false)
    const rendered = await mountView()

    await act(async () => {
      pauseButton().click()
    })

    expect(H.batch).not.toHaveBeenCalled()
    rendered.unmount()
  })

})

describe('dashboard quiet links pause outcomes (SH-70)', () => {
  it('does not report a pause the server refused', async () => {
    H.batch.mockRejectedValue(new Error('nope'))
    const toast = vi.spyOn(useUi.getState(), 'toast')
    const rendered = await mountView()

    await act(async () => {
      pauseButton().click()
    })

    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: t('share.stale_pause_success', { count: 2 }) }),
    )
    toast.mockRestore()
    rendered.unmount()
  })

  it('re-reads the report afterwards instead of assuming the links are gone', async () => {
    const rendered = await mountView()
    const callsBefore = H.globalAnalytics.mock.calls.length

    await act(async () => {
      pauseButton().click()
    })

    // The card's own rows were the paused links, so they have to be re-read from the server.
    expect(H.globalAnalytics.mock.calls.length).toBeGreaterThan(callsBefore)
    rendered.unmount()
  })
})

describe('days since a visit (SH-70)', () => {
  it('counts whole days, treats a never-read link as unknown, and never goes negative', () => {
    const day = 24 * 60 * 60 * 1000
    const now = 1_700_000_000_000

    expect(daysSinceVisit(null, now)).toBeNull()
    expect(daysSinceVisit(now - 200 * day, now)).toBe(200)
    expect(daysSinceVisit(now - 200 * day + 60_000, now)).toBe(199)
    // A clock that ran backwards must not print "last read -3 days ago".
    expect(daysSinceVisit(now + 5 * day, now)).toBe(0)
  })
})
