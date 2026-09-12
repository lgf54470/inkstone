import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUi } from '../../../store/ui'
import { useShareStore } from './index'
import { api } from '../../../lib/api'

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

beforeEach(() => {
  useUi.setState({ toasts: [] })
  useShareStore.setState({ shares: [], loading: false, batchBusy: false })
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

  it('stays silent when the toggle succeeds', async () => {
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
    expect(useUi.getState().toasts).toHaveLength(0)
  })
})
