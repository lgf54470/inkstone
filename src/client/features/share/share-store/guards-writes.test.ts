import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShareInfo } from '@shared/types'
import { api } from '../../../lib/api'
import { useUi } from '../../../store/ui'
import { useShareStore } from './index'

const patchNote = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      create: vi.fn(),
      batch: vi.fn(),
      batchToggleGroup: vi.fn(),
      folders: { list: vi.fn() },
      tags: { list: vi.fn() },
    },
  },
}))

vi.mock('../../../store/notes', () => ({
  useNotes: { getState: () => ({ patchNote }) },
}))

function shareRow(overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: 'abc123',
    noteId: 'note-1',
    url: 'https://example.test/s/abc123',
    hasPassword: false,
    expiresAt: null,
    views: 0,
    createdAt: 0,
    isEnabled: false,
    lastViewedAt: null,
    noteTitle: 'My note',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  useUi.setState({ toasts: [] })
  useShareStore.setState({ shares: [], loading: false, batchBusy: false, error: false, search: '', statusFilter: 'all' })
  vi.clearAllMocks()
  vi.mocked(api.share.list).mockResolvedValue({ shares: [], globalStats: null } as never)
  vi.mocked(api.share.folders.list).mockResolvedValue([] as never)
  vi.mocked(api.share.tags.list).mockResolvedValue([] as never)
  patchNote.mockClear()
})

describe('share collections guard (SH-21)', () => {
  it('deduplicates folder fetches and refetches only after the guard window', async () => {
    const { loadFolders } = useShareStore.getState()
    await Promise.all([loadFolders(), loadFolders()])
    expect(api.share.folders.list).toHaveBeenCalledTimes(1)

    await loadFolders()
    expect(api.share.folders.list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_001)
    await loadFolders()
    expect(api.share.folders.list).toHaveBeenCalledTimes(2)
  })

  it('a successful shares load no longer refetches folders and tags', async () => {
    await useShareStore.getState().loadShares()
    expect(api.share.folders.list).not.toHaveBeenCalled()
    expect(api.share.tags.list).not.toHaveBeenCalled()
  })
})

describe('share write result patching (SH-21)', () => {
  it('toggleShare applies the server row on success without reloading the list', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: false, views: 5 })] })
    vi.mocked(api.share.create).mockResolvedValue({
      share: shareRow({ slug: 'fresh-slug', isEnabled: true }),
    } as never)

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(ok).toBe(true)
    expect(api.share.list).not.toHaveBeenCalled()
    expect(useShareStore.getState().shares[0]).toMatchObject({ slug: 'fresh-slug', isEnabled: true })
  })

  it('toggleShare resyncs with one reload when the write fails', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: false, views: 5 })] })
    vi.mocked(api.share.create).mockRejectedValueOnce(new Error('boom'))

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(ok).toBe(false)
    expect(api.share.list).toHaveBeenCalledTimes(1)
  })

})

describe('share optimistic toggles (SH-21)', () => {
  it('togglePin keeps the optimistic row and skips the reload on success', async () => {
    useShareStore.setState({ shares: [shareRow()] })

    const ok = await useShareStore.getState().togglePin('note-1')

    expect(ok).toBe(true)
    expect(api.share.list).not.toHaveBeenCalled()
    expect(useShareStore.getState().shares[0]).toMatchObject({ isPinned: true })
  })

  it('togglePin resyncs with one reload when the notes write fails', async () => {
    useShareStore.setState({ shares: [shareRow()] })
    patchNote.mockRejectedValueOnce(new Error('boom'))

    const ok = await useShareStore.getState().togglePin('note-1')

    expect(ok).toBe(false)
    expect(api.share.list).toHaveBeenCalledTimes(1)
  })

  it('group and folder writes skip the success reload their optimistic patch already covers', async () => {
    useShareStore.setState({ shares: [shareRow({ noteId: 'note-1', folderId: 'f-1' })] })
    vi.mocked(api.share.batchToggleGroup).mockResolvedValue({ ok: true } as never)
    vi.mocked(api.share.batch).mockResolvedValue({ ok: true, count: 1 } as never)

    await useShareStore.getState().batchToggleGroup('folder', 'f-1', false)
    await useShareStore.getState().batchMoveToFolder(['note-1'], 'f-2')

    expect(api.share.list).not.toHaveBeenCalled()
    expect(useShareStore.getState().shares[0]).toMatchObject({ isEnabled: false, shareFolderId: 'f-2' })
  })
})

describe('share batch semantics and server patching (SH-21)', () => {
  it('bulk batch actions still reload once because their effect reaches unseen rows', async () => {
    vi.mocked(api.share.batch).mockResolvedValue({ ok: true, count: 2 } as never)

    await useShareStore.getState().batchToggle('enable', ['note-1', 'note-2'])

    expect(api.share.list).toHaveBeenCalledTimes(1)
  })

  it('applyServerShare falls back to one reload for a row outside the current list', async () => {
    useShareStore.getState().applyServerShare(shareRow({ noteId: 'ghost-note' }))

    expect(api.share.list).toHaveBeenCalledTimes(1)
  })
})
