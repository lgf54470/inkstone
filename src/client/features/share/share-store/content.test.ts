import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUi } from '../../../store/ui'
import { useShareStore } from './index'
import { api } from '../../../lib/api'

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      folders: {
        create: vi.fn(),
        patch: vi.fn(),
        remove: vi.fn(),
        list: vi.fn(async () => []),
      },
      tags: {
        create: vi.fn(),
        patch: vi.fn(),
        remove: vi.fn(),
        list: vi.fn(async () => []),
      },
      list: vi.fn(async () => ({ shares: [], globalStats: null })),
    },
  },
}))

beforeEach(() => {
  useUi.setState({ toasts: [] })
  useShareStore.setState({ folders: [], tags: [], error: false })
  vi.clearAllMocks()
})

function failsWithDangerToast(run: () => Promise<unknown>) {
  return async () => {
    const result = await run()
    expect(result).toBeFalsy()
    expect(useUi.getState().toasts.map((toast) => toast.title)).toContain('common.action_failed')
  }
}

describe('share folder/tag CRUD failure surfacing', () => {
  it('createFolder toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.folders.create).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().createFolder('Docs')
  }))

  it('patchFolder toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.folders.patch).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().patchFolder('f1', { name: 'Renamed' })
  }))

  it('deleteFolder toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.folders.remove).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().deleteFolder('f1')
  }))

  it('createTag toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.tags.create).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().createTag('work')
  }))

  it('patchTag toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.tags.patch).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().patchTag('t1', { name: 'Renamed' })
  }))

  it('deleteTag toasts when the request fails', failsWithDangerToast(() => {
    vi.mocked(api.share.tags.remove).mockRejectedValueOnce(new Error('boom'))
    return useShareStore.getState().deleteTag('t1')
  }))
})
