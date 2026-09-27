import { beforeEach, describe, expect, it, vi } from 'vitest'

const SERVER = { id: 'sv-1', name: 'Home', kind: 'subsonic' as const, url: 'https://music.example.com', username: 'me', createdAt: 1, updatedAt: 1 }

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        listServerSources: vi.fn(async () => ({ servers: [SERVER] })),
        createServerSource: vi.fn(async (input: { name: string }) => ({ ...SERVER, id: 'sv-2', ...input })),
        deleteServerSource: vi.fn(async () => ({ ok: true })),
        probeServerSource: vi.fn(async () => ({ ok: true })),
        searchServerSource: vi.fn(async () => ({ serverId: 'sv-1', kind: 'subsonic', results: [{ itemId: 'it-1', title: 'song', artist: 'a', album: 'b', durationMs: 1000 }] })),
        importServerTrack: vi.fn(async () => ({ id: 'trk-1', title: 'song' })),
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
import { initialServerSourceState } from './servers'
import {
  clearServerSearch, createServerSource, deleteServerSource, importServerHit, importServerHits,
  loadServerSources, probeServerSource, searchServerSource, selectServerSourceForSearch,
} from './servers'
import type { MusicStoreState } from './types'

function makeStore() {
  return musicStoreStub({ ...initialServerSourceState(), tracks: [] } as unknown as MusicStoreState)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('music server listing', () => {
  it('loads the registrations', async () => {
    const store = makeStore()
    await loadServerSources(store.set)
    expect(store.read().serverSources).toHaveLength(1)
    expect(store.read().serverSources[0]?.kind).toBe('subsonic')
  })

  // The failure is held as state so the panel can tell it apart from an empty account and offer the
  // retry; the toast is only the transient signal beside it.
  it('keeps the failure when the listing is refused', async () => {
    vi.mocked(api.music.listServerSources).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await loadServerSources(store.set)
    expect(store.read().serverSourcesError).toBe('offline')
    expect(store.read().serverSourcesLoading).toBe(false)
  })

  it('appends a created server without a second fetch', async () => {
    const store = makeStore()
    const ok = await createServerSource(store.set, { name: 'Home2', kind: 'jellyfin', url: 'https://j.example.com', username: 'me', password: 'pw' })
    expect(ok).toBe(true)
    expect(store.read().serverSources.map((entry) => entry.name)).toContain('Home2')
  })

  it('reports a refused registration to the form instead of throwing', async () => {
    vi.mocked(api.music.createServerSource).mockRejectedValueOnce(new Error('unauthorized'))
    const store = makeStore()
    expect(await createServerSource(store.set, { name: 'Home', kind: 'subsonic', url: 'https://x.example.com', username: 'me', password: 'bad' })).toBe(false)
    expect(store.read().serverSources).toHaveLength(0)
  })

  it('drops a deleted server and forgets the search that was pointed at it', async () => {
    const store = makeStore()
    store.set({ serverSources: [SERVER], serverSearch: { ...initialServerSourceState().serverSearch, serverId: 'sv-1', keywords: 'song' } })
    await deleteServerSource(store.set, 'sv-1')
    expect(store.read().serverSources).toEqual([])
    expect(store.read().serverSearch.serverId).toBeNull()
    expect(store.read().serverSearch.keywords).toBe('')
  })
})

describe('music server test verdict', () => {
  it('records that the server answered', async () => {
    const store = makeStore()
    expect(await probeServerSource(store.set, 'sv-1')).toBe(true)
    expect(store.read().serverProbe).toEqual({ id: 'sv-1', state: 'ok', error: null })
    expect(store.read().serverProbingId).toBeNull()
  })

  // A refused test must not read like an accepted one, and the reason belongs beside the row.
  it('records the reason when it did not', async () => {
    vi.mocked(api.music.probeServerSource).mockRejectedValueOnce(new Error('401'))
    const store = makeStore()
    expect(await probeServerSource(store.set, 'sv-1')).toBe(false)
    expect(store.read().serverProbe).toEqual({ id: 'sv-1', state: 'error', error: '401' })
  })
})

describe('music server search', () => {
  it('keeps the hits it was answered with', async () => {
    const store = makeStore()
    await searchServerSource(store.set, 'sv-1', 'song')
    expect(store.read().serverSearch.hits).toHaveLength(1)
    expect(store.read().serverSearch.searching).toBe(false)
  })

  // The query belongs to a server: a late answer for a query the reader has replaced must not
  // overwrite the newer one.
  it('drops an answer that arrived after the query moved on', async () => {
    const store = makeStore()
    const pending = searchServerSource(store.set, 'sv-1', 'song')
    selectServerSourceForSearch(store.set, 'sv-2')
    await pending
    expect(store.read().serverSearch.hits).toEqual([])
    expect(store.read().serverSearch.serverId).toBe('sv-2')
  })

  it('holds the failure and clears it on the next attempt', async () => {
    vi.mocked(api.music.searchServerSource).mockRejectedValueOnce(new Error('offline'))
    const store = makeStore()
    await searchServerSource(store.set, 'sv-1', 'song')
    expect(store.read().serverSearch.error).toBe('offline')
    await searchServerSource(store.set, 'sv-1', 'song')
    expect(store.read().serverSearch.error).toBeNull()
  })

  it('clears the query and the hits together', async () => {
    const store = makeStore()
    await searchServerSource(store.set, 'sv-1', 'song')
    clearServerSearch(store.set)
    expect(store.read().serverSearch.keywords).toBe('')
    expect(store.read().serverSearch.hits).toEqual([])
  })
})

describe('adding a server hit', () => {
  const hit = { itemId: 'it-1', title: 'song', artist: 'a', album: 'b', durationMs: 1000 }

  it('adds the row to the library in place', async () => {
    const store = makeStore()
    expect(await importServerHit(store.set, 'sv-1', hit)).toBe(true)
    expect(store.read().tracks.map((track) => track.id)).toEqual(['trk-1'])
    expect(store.read().serverSearch.importingItemIds).toEqual([])
  })

  it('reports a refused add instead of throwing', async () => {
    vi.mocked(api.music.importServerTrack).mockRejectedValueOnce(new Error('quota'))
    const store = makeStore()
    expect(await importServerHit(store.set, 'sv-1', hit)).toBe(false)
    expect(store.read().tracks).toEqual([])
  })

  it('counts what landed when the whole list is added', async () => {
    vi.mocked(api.music.importServerTrack).mockRejectedValueOnce(new Error('quota'))
    const store = makeStore()
    const result = await importServerHits(store.set, 'sv-1', [hit, { ...hit, itemId: 'it-2' }])
    expect(result).toEqual({ added: 1, failed: 1 })
  })
})
