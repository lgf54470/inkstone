import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ stats: vi.fn(), list: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { share: { stats: H.stats, list: H.list } },
  ApiError: class ApiError extends Error {},
}))

import { renderElement } from '../../lib/test-render'
import { useShareHubModal } from './use-share-hub-modal'
import { useShareStore } from './share-store'

const EMPTY_STATS = {
  totalShares: 0,
  activeShares: 0,
  totalViews: 0,
  totalVisitors: 0,
  folderCounts: {},
  tagCounts: {},
}

function Probe({ open, initialNoteId }: { open: boolean; initialNoteId?: string }) {
  useShareHubModal(open, initialNoteId)
  return null
}

/** Drain the mocked request's microtasks inside act, so the store write is not a stray update. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
  })
}

/**
 * SH-72: the hub lands on the dashboard, which paints the sidebar counters but none
 * of the share rows — yet every open used to fetch the whole list, and with it the
 * per-note visit stats. The counters now have their own cheap answer, and the list is
 * asked for only when something on the screen will actually read it.
 */
describe('share hub initial load (SH-72)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useShareStore.setState({
      category: 'dashboard',
      folderId: null,
      tag: null,
      shares: [],
      globalStats: null,
      loading: false,
      error: false,
      selectedNoteIds: new Set<string>(),
    })
    H.stats.mockResolvedValue({ globalStats: EMPTY_STATS })
    H.list.mockResolvedValue({ shares: [], total: 0, truncated: false, globalStats: EMPTY_STATS })
  })

  it('asks for the counters alone when the hub lands on the dashboard', async () => {
    const rendered = renderElement(createElement(Probe, { open: true }))
    await settle()

    expect(H.stats).toHaveBeenCalledTimes(1)
    expect(H.list).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('asks for the list when a list category is the landing view', async () => {
    useShareStore.setState({ category: 'all' })
    const rendered = renderElement(createElement(Probe, { open: true }))
    await settle()

    expect(H.list).toHaveBeenCalledTimes(1)
    expect(H.stats).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('asks for the list when a note is handed in to edit', async () => {
    const rendered = renderElement(createElement(Probe, { open: true, initialNoteId: 'n-1' }))
    await settle()

    expect(H.list).toHaveBeenCalledTimes(1)
    expect(H.stats).not.toHaveBeenCalled()
    rendered.unmount()
  })
})
