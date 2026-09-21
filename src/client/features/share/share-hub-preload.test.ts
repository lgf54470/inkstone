import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { useShareHubModal } from './use-share-hub-modal'

/**
 * The shell fetches what the open view declares it needs. Today every category's declaration agrees
 * with a hardcoded list of the two self-loading ones, so no rendering of the real registry can tell
 * the two implementations apart — a mutation that puts the category list back therefore survives
 * every behavioral test, and the guarantee would quietly become "the shell knows which categories
 * read their own data again".
 *
 * So this suite swaps one declaration for an answer that disagrees with the old list: opening the
 * dashboard must fetch the rows, because that is what the registry now says. A shell that reads its
 * own memory of category names fails here and nowhere else.
 */

const mocks = vi.hoisted(() => ({ stats: vi.fn(), list: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { share: { stats: mocks.stats, list: mocks.list } },
  ApiError: class ApiError extends Error {},
}))

vi.mock('./share-hub-views', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./share-hub-views')>()
  return {
    ...actual,
    SHARE_HUB_VIEWS: {
      ...actual.SHARE_HUB_VIEWS,
      dashboard: { preload: 'list' as const, Component: () => null },
    },
  }
})

const STATS = { totalShares: 0, activeShares: 0, totalViews: 0, totalVisitors: 0, folderCounts: {}, tagCounts: {} }

function Probe({ open }: { open: boolean }) {
  useShareHubModal(open)
  return null
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useShareStore.setState({ category: 'dashboard', shares: [], globalStats: null, selectedNoteIds: new Set<string>() })
  mocks.stats.mockResolvedValue({ globalStats: STATS })
  mocks.list.mockResolvedValue({ shares: [], total: 0, truncated: false, globalStats: STATS })
})

describe('where the opening fetch gets its answer', () => {
  it('follows the open view declaration even when it disagrees with the categories', async () => {
    const rendered = renderElement(createElement(Probe, { open: true }))
    await settle()

    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(mocks.stats).not.toHaveBeenCalled()
    rendered.unmount()
  })
})
