import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShareInfo } from '@shared/types'
import { api } from '../../../lib/api'
import { useUi } from '../../../store/ui'
import { useShareStore } from './index'

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      summary: vi.fn(),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

function summaryPayload() {
  return { totalShares: 2, sharedNoteIds: ['n-a', 'n-b'] }
}

function shareRow(noteId: string): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 0,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    shareFolderId: null,
    tags: [],
  }
}

function okList() {
  return { shares: [shareRow('n-a')], globalStats: { totalShares: 2 } }
}

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((res) => { resolve = res })
  return { promise, resolve }
}

beforeEach(() => {
  useShareStore.setState({ shares: [], summary: null, globalStats: null, loading: false, error: false })
  useUi.setState({ toasts: [] })
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('share summary prefetch (SH-19)', () => {
  it('fills the summary with the count and an id set at startup', async () => {
    vi.mocked(api.share.summary).mockResolvedValue(summaryPayload() as never)

    await useShareStore.getState().loadSummary()

    const { summary } = useShareStore.getState()
    expect(summary?.totalShares).toBe(2)
    expect(summary?.sharedNoteIds.has('n-a')).toBe(true)
    expect(summary?.sharedNoteIds.has('n-z')).toBe(false)
  })

  it('coalesces parallel prefetches into one request', async () => {
    const { promise, resolve } = deferred()
    vi.mocked(api.share.summary).mockReturnValue(promise as never)

    const first = useShareStore.getState().loadSummary()
    const second = useShareStore.getState().loadSummary()
    resolve(summaryPayload())
    await Promise.all([first, second])

    expect(api.share.summary).toHaveBeenCalledTimes(1)
  })

  it('keeps the summary unset and surfaces a failure when the prefetch fails', async () => {
    vi.mocked(api.share.summary).mockRejectedValue(new Error('offline'))

    await useShareStore.getState().loadSummary()

    expect(useShareStore.getState().summary).toBeNull()
    expect(console.warn).toHaveBeenCalled()
    expect(useUi.getState().toasts).toHaveLength(1)
  })
})

describe('share summary handoff to the full list (SH-19)', () => {
  it('drops the summary once the full list loads', async () => {
    vi.mocked(api.share.summary).mockResolvedValue(summaryPayload() as never)
    vi.mocked(api.share.list).mockResolvedValue(okList() as never)

    await useShareStore.getState().loadSummary()
    await useShareStore.getState().loadShares()

    expect(useShareStore.getState().summary).toBeNull()
  })

  it('skips the prefetch once the full list carries the shared truth', async () => {
    useShareStore.setState({ shares: [shareRow('n-a')] })

    await useShareStore.getState().loadSummary()

    expect(api.share.summary).not.toHaveBeenCalled()
    expect(useShareStore.getState().summary).toBeNull()
  })
})
