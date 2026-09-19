import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShareInfo } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { useUi } from '../../../store/ui'
import { useShareStore } from './index'
import { api } from '../../../lib/api'

vi.mock('../../../components/overlay', async (importOriginal) => ({
  ...await importOriginal(),
  confirm: vi.fn(async () => true),
}))

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      create: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
      batch: vi.fn(),
      batchFolder: vi.fn(),
      batchTag: vi.fn(),
      batchToggleGroup: vi.fn(),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
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
  useUi.setState({ toasts: [] })
  useShareStore.setState({ shares: [], loading: false, batchBusy: false, error: false })
  vi.clearAllMocks()
})

describe('share store error surfacing', () => {
  it('shows a danger toast when a share toggle fails instead of failing silently', async () => {
    vi.mocked(api.share.create).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(ok).toBe(false)
    const tones = useUi.getState().toasts.map((toast) => toast.tone)
    expect(tones).toContain('danger')
  })

  it('shows a danger toast when loading shares fails instead of showing an empty list', async () => {
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))

    await useShareStore.getState().loadShares()

    expect(useShareStore.getState().loading).toBe(false)
    const titles = useUi.getState().toasts.map((toast) => toast.title)
    expect(titles).toContain('share.could_not_load_sharing_status')
  })

  it('surfaces a publish hint and no error toast when the toggle succeeds', async () => {
    vi.mocked(api.share.create).mockResolvedValueOnce({
      share: { noteId: 'note-1', isEnabled: true } as never,
      status: 201,
    } as never)
    vi.mocked(api.share.list).mockResolvedValueOnce({
      shares: [],
      globalStats: null,
    } as never)

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(ok).toBe(true)
    const toasts = useUi.getState().toasts
    expect(toasts.map((toast) => toast.title)).toContain('share.publish_success')
    expect(toasts.map((toast) => toast.tone)).not.toContain('danger')
  })
})

describe('share list error state', () => {
  it('loadShares records an error state when the first screen fails', async () => {
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))

    await useShareStore.getState().loadShares()

    expect(useShareStore.getState().error).toBe(true)
    expect(useShareStore.getState().loading).toBe(false)
    expect(useShareStore.getState().shares).toEqual([])
  })

  it('loadShares clears the error state once a retry succeeds', async () => {
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))
    await useShareStore.getState().loadShares()
    expect(useShareStore.getState().error).toBe(true)

    vi.mocked(api.share.list).mockResolvedValueOnce({ shares: [], globalStats: null } as never)
    await useShareStore.getState().loadShares()

    expect(useShareStore.getState().error).toBe(false)
    expect(useShareStore.getState().loading).toBe(false)
  })
})

describe('inline switch first publish (SH-15)', () => {
  it('asks before enabling a share that has never been public', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: false, views: 0 })] })
    vi.mocked(confirm).mockResolvedValueOnce(true)
    vi.mocked(api.share.create).mockResolvedValueOnce({ share: shareRow({ isEnabled: true, views: 0 }) } as never)

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(vi.mocked(confirm)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(confirm).mock.calls[0][0]).toMatchObject({ title: 'share.confirm_publish_title' })
    expect(api.share.create).toHaveBeenCalledWith('note-1', { isEnabled: true })
    expect(ok).toBe(true)
  })

  it('does not publish when the confirmation is dismissed', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: false, views: 0 })] })
    vi.mocked(confirm).mockResolvedValueOnce(false)

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(ok).toBe(false)
    expect(api.share.create).not.toHaveBeenCalled()
    expect(useShareStore.getState().shares[0].isEnabled).toBe(false)
  })
})

describe('inline switch immediate paths (SH-15)', () => {
  it('re-enables a previously viewed share without confirmation', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: false, views: 5 })] })
    vi.mocked(api.share.create).mockResolvedValueOnce({ share: shareRow({ isEnabled: true, views: 5 }) } as never)

    const ok = await useShareStore.getState().toggleShare('note-1', true)

    expect(vi.mocked(confirm)).not.toHaveBeenCalled()
    expect(api.share.create).toHaveBeenCalledWith('note-1', { isEnabled: true })
    expect(ok).toBe(true)
  })

  it('disabling stays immediate', async () => {
    useShareStore.setState({ shares: [shareRow({ isEnabled: true, views: 5 })] })
    vi.mocked(api.share.create).mockResolvedValueOnce({ share: shareRow({ isEnabled: false, views: 5 }) } as never)

    const ok = await useShareStore.getState().toggleShare('note-1', false)

    expect(vi.mocked(confirm)).not.toHaveBeenCalled()
    expect(api.share.create).toHaveBeenCalledWith('note-1', { isEnabled: false })
    expect(ok).toBe(true)
    const titles = useUi.getState().toasts.map((toast) => toast.title)
    expect(titles).not.toContain('share.publish_success')
  })
})
