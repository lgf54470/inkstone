import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareCategory } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareHubModal } from './share-hub-modal'
import { SHARE_HUB_VIEWS } from './share-hub-views'

/**
 * The hub used to special-case two categories inside the list shell: the dashboard and the
 * collections panel painted themselves, and the opening fetch had to know which of the twelve
 * categories reads an endpoint the others do not. Each category is now a view that declares what it
 * needs, so the shell picks one and hands it callbacks — and these are the two things that can still
 * go wrong: the shell routing a category to the wrong view, and a view silently reading data
 * belonging to another.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  globalAnalytics: vi.fn(),
  collectionsList: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: mocks.list,
      stats: mocks.stats,
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
      summary: vi.fn(async () => ({ totalShares: 0, sharedNoteIds: [] })),
      globalAnalytics: mocks.globalAnalytics,
      collections: { list: mocks.collectionsList, publish: vi.fn(), patch: vi.fn(), revoke: vi.fn() },
    },
  },
}))

const CATEGORIES = Object.keys(SHARE_HUB_VIEWS) as ShareCategory[]

const STATS = { totalShares: 0, activeShares: 0, totalViews: 0, totalVisitors: 0, folderCounts: {}, tagCounts: {} }

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve()
  })
}

function openHub(category: ShareCategory): { unmount: () => void } {
  useShareStore.setState({ category, shares: [], globalStats: null, selectedNoteIds: new Set<string>() })
  return renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue({ shares: [], total: 0, truncated: false, globalStats: STATS })
  mocks.stats.mockResolvedValue({ globalStats: STATS })
  mocks.globalAnalytics.mockResolvedValue({ range: '7d' })
  mocks.collectionsList.mockResolvedValue({ collections: [] })
})

/** What opening one category actually asked the API for, then leaves the screen as it found it. */
async function callsWhenOpened(category: ShareCategory): Promise<{ rows: boolean; reading: boolean; collections: boolean; stats: boolean }> {
  const rendered = openHub(category)
  await flush()
  const calls = {
    rows: mocks.list.mock.calls.length > 0,
    reading: mocks.globalAnalytics.mock.calls.length > 0,
    collections: mocks.collectionsList.mock.calls.length > 0,
    stats: mocks.stats.mock.calls.length > 0,
  }
  rendered.unmount()
  vi.clearAllMocks()
  return calls
}

/** The three views are told apart by what only they fetch: rows, the global reading, or collections. */
function viewFamilyOf(category: ShareCategory): { rows: boolean; reading: boolean; collections: boolean } {
  if (category === 'dashboard') return { rows: false, reading: true, collections: false }
  if (category === 'collections') return { rows: false, reading: false, collections: true }
  return { rows: true, reading: false, collections: false }
}

describe('share hub category views', () => {
  it('routes every category to the view the registry names, and to no other', async () => {
    for (const category of CATEGORIES) {
      const { rows, reading, collections } = await callsWhenOpened(category)
      expect([category, { rows, reading, collections }]).toEqual([category, viewFamilyOf(category)])
    }
  })

  it('asks the opening fetch for what the open view declared it needs', async () => {
    for (const category of CATEGORIES) {
      // `stats` is the counters alone; `list` carries the rows. Asking for the wrong one is either a
      // panel with no numbers or a screen that paid for rows it never draws (SH-72).
      const { rows, stats } = await callsWhenOpened(category)
      const preload = SHARE_HUB_VIEWS[category].preload
      expect([category, preload, { stats, rows }]).toEqual([category, preload, { stats: preload === 'stats', rows: preload === 'list' }])
    }
  })

  it('paints the same list view for every status category', () => {
    // The ten status categories differ only in the filter the store holds; ten components would be ten
    // places for the toolbar to drift apart.
    const listViews = new Set(CATEGORIES.map((category) => SHARE_HUB_VIEWS[category].Component))
    expect(listViews.size).toBe(3)
    expect(SHARE_HUB_VIEWS.all.Component).toBe(SHARE_HUB_VIEWS.expired.Component)
    expect(SHARE_HUB_VIEWS.dashboard.Component).not.toBe(SHARE_HUB_VIEWS.collections.Component)
  })
})

