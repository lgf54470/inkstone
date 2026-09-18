import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../music-metadata', () => ({
  scanTrackMetadata: vi.fn(),
  probeTrackDuration: vi.fn(async () => 0),
}))
vi.mock('../music-cover-lookup', () => ({ lookupCoverDataUrl: vi.fn(async () => null) }))
vi.mock('../music-export', () => ({ saveBlob: vi.fn() }))
vi.mock('../../../lib/api', () => ({
  musicStreamUrl: vi.fn(() => ''),
  api: { music: { patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })) } },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { lookupCoverDataUrl } from '../music-cover-lookup'
import { scanTrackMetadata } from '../music-metadata'
import { toastMusicError, toastMusicNotice } from '../music-feedback'
import { matchMissingCovers } from './library-covers'
import { refreshTrackMetadata } from './library-tracks'
import { dismissLibraryJob } from './transfers'
import type { MusicLibraryJob, MusicStoreState } from './types'

function track(id: string, coverUrl: string | null = null): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 60_000, source: 'r2', coverUrl, lyric: null, hasLyric: false } as MusicTrack
}

function makeStore(tracks: MusicTrack[]) {
  let state = { tracks, libraryJobs: [] as MusicLibraryJob[], transfersOpen: false } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

afterEach(() => {
  vi.mocked(scanTrackMetadata).mockReset()
  vi.mocked(lookupCoverDataUrl).mockReset()
  vi.mocked(lookupCoverDataUrl).mockResolvedValue(null)
  vi.clearAllMocks()
})

describe('metadata scan jobs', () => {
  it('runs the scan as one transfer task that clears itself on success', async () => {
    const store = makeStore([track('a'), track('b')])
    const seen: MusicLibraryJob[] = []
    vi.mocked(scanTrackMetadata).mockImplementation(async () => {
      seen.push(...store.state().libraryJobs)
      return { coverDataUrl: null, title: null, artist: 'Someone', album: null, lyric: null, durationMs: 0 }
    })
    expect(await refreshTrackMetadata(store.set as never, store.get as never, ['a', 'b'])).toBe(2)
    expect(seen).toHaveLength(2)
    expect(seen.every((job) => job.kind === 'metadata' && job.status === 'running')).toBe(true)
    expect(store.state().libraryJobs).toEqual([])
    expect(store.state().transfersOpen).toBe(true)
  })

  it('refuses to stack a second scan while one is running', async () => {
    const store = makeStore([track('a'), track('b')])
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(scanTrackMetadata).mockImplementation(async () => {
      await gate
      return { coverDataUrl: null, title: null, artist: 'Someone', album: null, lyric: null, durationMs: 0 }
    })
    const first = refreshTrackMetadata(store.set as never, store.get as never, ['a'])
    expect(store.state().libraryJobs).toHaveLength(1)
    expect(await refreshTrackMetadata(store.set as never, store.get as never, ['b'])).toBe(0)
    expect(store.state().libraryJobs).toHaveLength(1)
    release()
    await first
    expect(store.state().libraryJobs).toEqual([])
  })
})

describe('cover match jobs', () => {
  it('reports one step of progress per lookup', async () => {
    const store = makeStore([track('a'), track('b'), track('c')])
    const doneAtLookup: number[] = []
    vi.mocked(lookupCoverDataUrl).mockImplementation(async () => {
      doneAtLookup.push(store.state().libraryJobs[0]?.done ?? -1)
      return null
    })
    expect(await matchMissingCovers(store.set as never, store.get as never)).toBe(0)
    expect(doneAtLookup).toEqual([0, 1, 2])
    expect(store.state().libraryJobs).toEqual([])
  })

  it('leaves a dismissible task when a lookup fails and says so', async () => {
    const store = makeStore([track('a')])
    vi.mocked(lookupCoverDataUrl).mockRejectedValueOnce(new TypeError('offline'))
    expect(await matchMissingCovers(store.set as never, store.get as never)).toBe(0)
    expect(store.state().libraryJobs).toEqual([{ kind: 'covers', done: 0, total: 1, status: 'failed' }])
    expect(toastMusicError).toHaveBeenCalledTimes(1)
    dismissLibraryJob(store.set as never, 'covers')
    expect(store.state().libraryJobs).toEqual([])
  })

  it('opens no task when there is nothing to look for', async () => {
    const store = makeStore([track('a', 'cover-key')])
    expect(await matchMissingCovers(store.set as never, store.get as never)).toBe(0)
    expect(toastMusicNotice).toHaveBeenCalledWith('music.covers_unmatched')
    expect(store.state().libraryJobs).toEqual([])
    expect(store.state().transfersOpen).toBe(false)
  })
})
