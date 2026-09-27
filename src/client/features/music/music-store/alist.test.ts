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
        searchAlist: vi.fn(async () => ({ keywords: 'song', entries: [{ name: 'song.mp3', isDir: false, size: 16, path: '/sub/song.mp3' }] })),
        importAlistTrack: vi.fn(async () => ({ id: 'trk-1', title: 'song' })),
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
import { createAlistServer, deleteAlistServer, loadAlistServers, searchAlist } from './alist'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({ alistServers: [], alistServersLoading: false } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// FB-U6: a failed listing used to leave the panel saying "no servers yet" — the same words an empty
// account gets. The failure is now held as state so the panel can say which of the two it is and
// offer the retry; the toast stays as the transient signal.
describe('alist failure is not an empty list (FB-U6)', () => {
  it('holds the failure so the panel can tell it apart from an empty account', async () => {
    vi.mocked(api.music.listAlistServers).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadAlistServers(store.set)
    expect(store.get().alistServersError).toBe('offline')
  })

  it('clears it on the next load, whatever that load answers', async () => {
    vi.mocked(api.music.listAlistServers).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadAlistServers(store.set)
    await loadAlistServers(store.set)
    expect(store.get().alistServersError).toBeNull()
    expect(store.get().alistServers).toHaveLength(1)
  })
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

describe('alist search store (FEA-A3-3)', () => {
  it('forwards the keywords and returns the entries', async () => {
    makeStore()
    const entries = await searchAlist('as-1', 'song')
    expect(api.music.searchAlist).toHaveBeenCalledWith('as-1', 'song')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.path).toBe('/sub/song.mp3')
  })

  it('returns an empty list when the search fails', async () => {
    makeStore()
    vi.mocked(api.music.searchAlist).mockRejectedValueOnce(new Error('offline'))
    expect(await searchAlist('as-1', 'song')).toEqual([])
  })
})
