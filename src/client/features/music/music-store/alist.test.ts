import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listAlistServers: vi.fn(async () => ({ servers: [{ id: 'as-1', name: 'NAS', url: 'https://a.example.com', rootPath: '/media' }] })),
        createAlistServer: vi.fn(async (input: { name: string }) => ({ id: 'as-2', ...input, rootPath: '/' })),
        deleteAlistServer: vi.fn(async () => ({ ok: true })),
      },
    },
  }
})
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { musicStoreStub } from './store.test-helpers'
import { createAlistServer, deleteAlistServer, loadAlistServers } from './alist'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({ alistServers: [], alistServersLoading: false } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('alist server store (FEA-A3-1)', () => {
  it('loads the server list', async () => {
    const store = makeStore()
    await loadAlistServers(store.set)
    expect(store.get().alistServers).toHaveLength(1)
    expect(store.get().alistServers[0]?.name).toBe('NAS')
  })

  it('creates a server and refreshes the list', async () => {
    const store = makeStore()
    await createAlistServer(store.set, { name: 'NAS2', url: 'https://b.example.com', token: 't' })
    expect(api.music.createAlistServer).toHaveBeenCalledWith({ name: 'NAS2', url: 'https://b.example.com', token: 't' })
  })

  it('deletes a server and drops it from the list', async () => {
    const store = makeStore()
    store.set({ alistServers: [{ id: 'as-1', name: 'NAS', url: 'https://a.example.com', rootPath: '/' }] })
    await deleteAlistServer(store.set, 'as-1')
    expect(store.get().alistServers).toEqual([])
  })
})
