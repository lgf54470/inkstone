import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicStats, MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: { music: { library: vi.fn() } },
}))

import { api } from '../../../lib/api'
import { loadLibrary } from './library-load'
import type { MusicSet, MusicStoreState } from './types'

const libraryPayload = { tracks: [] as MusicTrack[], tags: [], playlists: [], stats: statsFixture() }

function statsFixture(): MusicStats {
  return { trackCount: 0, favoriteCount: 0, pinnedCount: 0, playlistCount: 0, tagCount: 0, totalBytes: 0, totalDurationMs: 0 }
}

function makeStore() {
  let state = { lastLoadedAt: 0 } as unknown as MusicStoreState
  const set: MusicSet = (patch) => {
    const next = typeof patch === 'function'
      ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
      : (patch as Partial<MusicStoreState>)
    state = { ...state, ...next }
  }
  return { set, get: () => state }
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(api.music.library).mockReset()
})

describe('loadLibrary in-flight dedup', () => {
  it('shares one request between concurrent loads', async () => {
    let release: (value: typeof libraryPayload) => void = () => {}
    vi.mocked(api.music.library).mockReturnValue(new Promise((resolve) => { release = resolve }))
    const store = makeStore()
    const first = loadLibrary(store.set, store.get)
    const second = loadLibrary(store.set, store.get)
    release(libraryPayload)
    await Promise.all([first, second])
    expect(api.music.library).toHaveBeenCalledTimes(1)
  })
})

describe('loadLibrary freshness window', () => {
  it('skips a reload while the library is still fresh', async () => {
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(1)
    expect(store.get().lastLoadedAt).toBeGreaterThan(0)
  })

  it('reloads once the freshness window has passed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00Z'))
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    vi.setSystemTime(new Date('2026-09-19T10:01:01Z'))
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(2)
  })

  it('lets a failed load be retried immediately', async () => {
    vi.mocked(api.music.library)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    expect(store.get().loadError).toBeTruthy()
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(2)
    expect(store.get().loadError).toBeNull()
  })

  it('force bypasses the freshness window', async () => {
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    await loadLibrary(store.set, store.get, true)
    expect(api.music.library).toHaveBeenCalledTimes(2)
  })
})
