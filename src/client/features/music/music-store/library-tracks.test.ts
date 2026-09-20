import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'

vi.mock('../music-metadata', () => ({
  scanTrackMetadata: vi.fn(),
  probeTrackDuration: vi.fn(async () => 0),
}))
vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
      deleteTrack: vi.fn(async () => ({ ok: true })),
      batchTracks: vi.fn(async () => ({ ok: true, updated: 2 })),
      trackLyric: vi.fn(async () => ({ lyric: '[00:00.00]fetched' })),
      library: vi.fn(async () => {
        throw new Error('the library must not be reloaded for a single-track change')
      }),
    },
  },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))
vi.mock('./offline', () => ({
  forgetOfflineTracks: vi.fn(),
}))

import { api } from '../../../lib/api'
import { scanTrackMetadata } from '../music-metadata'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { batchTracks, deleteTrack, ensureTrackLyric, refreshTrackMetadata } from './library-tracks'
import { forgetOfflineTracks } from './offline'
import type { MusicStoreState } from './types'

afterEach(() => {
  vi.mocked(api.music.trackLyric).mockClear()
  vi.mocked(api.music.library).mockClear()
  // A case that makes the batch request fail must not leak that rejection into the next one.
  vi.mocked(api.music.batchTracks).mockReset().mockResolvedValue({ ok: true, updated: 0 })
  vi.mocked(toastMusic).mockClear()
  vi.mocked(toastMusicError).mockClear()
  vi.mocked(toastMusicNotice).mockClear()
})

function track(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 0, source: 'r2', coverUrl: null, lyric: null } as MusicTrack
}

function makeStore(tracks: MusicTrack[]) {
  return musicStoreStub({ tracks, libraryJobs: [], queue: [], currentIndex: 0, selectedIds: [], playlists: [], tags: [], stats: null })
}

describe('refreshTrackMetadata', () => {
  it('skips a track whose tag scan throws and still refreshes the rest', async () => {
    vi.mocked(scanTrackMetadata)
      .mockRejectedValueOnce(new RangeError('offset is out of bounds'))
      .mockResolvedValueOnce({ coverDataUrl: null, title: null, artist: 'Someone', album: null, lyric: null, durationMs: 0 })
    const store = makeStore([track('poison-1'), track('good-1')])
    const updated = await refreshTrackMetadata(
      store.set,
      store.get,
      ['poison-1', 'good-1'],
    )
    expect(updated).toBe(1)
    expect(toastMusic).toHaveBeenCalledWith('music.metadata_refreshed', { value0: 1 })
  })

  it('notices the user when every scanned track was unreadable', async () => {
    vi.mocked(scanTrackMetadata).mockRejectedValueOnce(new Error('malformed tag'))
    const store = makeStore([track('poison-1')])
    const updated = await refreshTrackMetadata(store.set, store.get, ['poison-1'])
    expect(updated).toBe(0)
    expect(toastMusicNotice).toHaveBeenCalledWith('music.metadata_unavailable')
  })

  it('scans several tracks at once but never more than the cap', async () => {
    let active = 0
    let maxActive = 0
    vi.mocked(scanTrackMetadata).mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return { coverDataUrl: null, title: null, artist: 'Someone', album: null, lyric: null, durationMs: 0 }
    })
    const ids = Array.from({ length: 8 }, (_, index) => `c${index}`)
    const store = makeStore(ids.map(track))

    const updated = await refreshTrackMetadata(store.set, store.get, ids)

    expect(updated).toBe(8)
    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
  })
})


function fullStore(seed: Partial<MusicStoreState>) {
  let state = {
    tracks: [], tags: [], playlists: [], stats: null, queue: [], currentIndex: 0, selectedIds: [],
    ...seed,
  } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
  }
}

function storedTrack(id: string): MusicTrack {
  return {
    ...track(id), sizeBytes: 1000, durationMs: 60_000, hasLyric: false,
    isFavorite: false, isPinned: false, tagIds: [],
  } as unknown as MusicTrack
}

const emptyStats = { trackCount: 0, favoriteCount: 0, pinnedCount: 0, playlistCount: 0, tagCount: 0, totalBytes: 0, totalDurationMs: 0 }

describe('ensureTrackLyric', () => {
  it('fetches the lyric text once for a track the library shipped without it', async () => {
    const store = fullStore({ tracks: [{ ...storedTrack('a'), hasLyric: true }] })
    await ensureTrackLyric(store.set, store.get, 'a')
    expect(api.music.trackLyric).toHaveBeenCalledTimes(1)
    expect(store.get().tracks[0].lyric).toBe('[00:00.00]fetched')
  })

  it('deduplicates concurrent fetches for the same track', async () => {
    let release: (value: { lyric: string }) => void = () => {}
    vi.mocked(api.music.trackLyric).mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
    const store = fullStore({ tracks: [{ ...storedTrack('a'), hasLyric: true }] })
    const first = ensureTrackLyric(store.set, store.get, 'a')
    const second = ensureTrackLyric(store.set, store.get, 'a')
    release({ lyric: '[00:00.00]fetched' })
    await Promise.all([first, second])
    expect(api.music.trackLyric).toHaveBeenCalledTimes(1)
  })

  it('never asks the server for a track without a lyric', async () => {
    const store = fullStore({ tracks: [storedTrack('a')] })
    await ensureTrackLyric(store.set, store.get, 'a')
    expect(api.music.trackLyric).not.toHaveBeenCalled()
  })
})

describe('single-record mutation merges', () => {
  it('deletes a track by dropping it locally and resummarizing stats', async () => {
    const store = fullStore({
      tracks: [storedTrack('a'), storedTrack('b')],
      stats: { ...emptyStats, trackCount: 2, totalBytes: 2000, totalDurationMs: 120_000 },
      queue: ['a'], currentIndex: 0,
    })
    await deleteTrack(store.set, store.get, 'a')
    expect(store.get().tracks.map((entry) => entry.id)).toEqual(['b'])
    expect(store.get().stats).toMatchObject({ trackCount: 1, totalBytes: 1000 })
    expect(store.get().queue).toEqual([])
    expect(api.music.library).not.toHaveBeenCalled()
  })

  it('applies a batch favorite to the selected tracks without a library reload', async () => {
    const store = fullStore({
      tracks: [storedTrack('a'), storedTrack('b')],
      stats: { ...emptyStats, trackCount: 2 },
      selectedIds: ['a'],
    })
    await batchTracks(store.set, store.get, 'favorite')
    expect(store.get().tracks.map((entry) => entry.isFavorite)).toEqual([true, false])
    expect(store.get().stats).toMatchObject({ trackCount: 2, favoriteCount: 1 })
    expect(store.get().selectedIds).toEqual([])
    expect(api.music.library).not.toHaveBeenCalled()
  })
})

// The server caps one batch request at a fixed id count; a larger selection must
// become several requests rather than one rejected request that changes nothing.
describe('batch requests over the server cap', () => {
  const cap = LIMITS.musicBatchItemsMax

  it('splits a selection larger than one batch and applies every chunk locally', async () => {
    const tracks = Array.from({ length: cap + 1 }, (_, index) => storedTrack('t' + index))
    const store = fullStore({ tracks, stats: { ...emptyStats, trackCount: tracks.length }, selectedIds: tracks.map((entry) => entry.id) })
    vi.mocked(api.music.batchTracks).mockClear()
    await batchTracks(store.set, store.get, 'favorite')
    expect(vi.mocked(api.music.batchTracks).mock.calls.map((call) => call[0].length)).toEqual([cap, 1])
    expect(store.get().tracks.every((entry) => entry.isFavorite)).toBe(true)
    expect(store.get().selectedIds).toEqual([])
    expect(toastMusic).toHaveBeenCalledWith('music.batch_done', { value0: cap + 1 })
    expect(api.music.library).not.toHaveBeenCalled()
  })

  it('keeps the chunks that succeeded when a later chunk is rejected', async () => {
    const tracks = Array.from({ length: cap + 1 }, (_, index) => storedTrack('t' + index))
    const store = fullStore({ tracks, stats: { ...emptyStats, trackCount: tracks.length }, selectedIds: tracks.map((entry) => entry.id) })
    vi.mocked(api.music.batchTracks)
      .mockClear()
      .mockResolvedValueOnce({ ok: true, updated: cap })
      .mockRejectedValueOnce(new Error('too_many_attempts'))
    await batchTracks(store.set, store.get, 'favorite')
    expect(store.get().tracks[0].isFavorite).toBe(true)
    expect(store.get().tracks[cap]!.isFavorite).toBe(false)
    expect(vi.mocked(toastMusicError)).toHaveBeenCalled()
    expect(vi.mocked(toastMusic)).not.toHaveBeenCalledWith('music.batch_done', expect.anything())
  })
})

describe('refreshTrackMetadata force mode (FEAT-6)', () => {
  function filledTrack(id: string): MusicTrack {
    return {
      id, title: id, artist: 'Wrong Artist', album: 'Wrong Album', durationMs: 1000,
      source: 'r2', coverUrl: 'https://cover/old', hasLyric: true, lyric: 'old lyric',
    } as MusicTrack
  }
  const scanned = {
    coverDataUrl: 'data:image/jpeg;base64,NEW', title: 'Real Song', artist: 'Right Artist',
    album: 'Right Album', lyric: '[00:00.00]tag lyric', durationMs: 0,
  }

  it('force replaces stored artist, album, cover and lyric with the tag values', async () => {
    vi.mocked(scanTrackMetadata).mockResolvedValue(scanned)
    vi.mocked(api.music.patchTrack).mockClear()
    const store = makeStore([filledTrack('a')])
    const updated = await refreshTrackMetadata(store.set, store.get, ['a'], true)
    expect(api.music.patchTrack).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ artist: 'Right Artist', album: 'Right Album', coverDataUrl: scanned.coverDataUrl, lyric: scanned.lyric }),
    )
    expect(updated).toBe(1)
  })

  it('fill-only mode still leaves a filled track untouched', async () => {
    vi.mocked(scanTrackMetadata).mockResolvedValue(scanned)
    vi.mocked(api.music.patchTrack).mockClear()
    const store = makeStore([filledTrack('a')])
    const updated = await refreshTrackMetadata(store.set, store.get, ['a'])
    expect(api.music.patchTrack).not.toHaveBeenCalled()
    expect(updated).toBe(0)
  })

  it('force rescans tracks that already look complete', async () => {
    vi.mocked(scanTrackMetadata).mockClear()
    vi.mocked(scanTrackMetadata).mockResolvedValue(scanned)
    const store = makeStore([filledTrack('a')])
    await refreshTrackMetadata(store.set, store.get, ['a'], true)
    expect(scanTrackMetadata).toHaveBeenCalledTimes(1)
  })

  it('force never replaces the stored title even when the tag differs', async () => {
    vi.mocked(scanTrackMetadata).mockResolvedValue(scanned)
    vi.mocked(api.music.patchTrack).mockClear()
    const store = makeStore([filledTrack('a')])
    await refreshTrackMetadata(store.set, store.get, ['a'], true)
    const patch = vi.mocked(api.music.patchTrack).mock.calls[0]?.[1] as Record<string, unknown>
    expect(patch.title).toBeUndefined()
  })
})

describe('deleting forgets the offline copies', () => {
  beforeEach(() => {
    vi.mocked(forgetOfflineTracks).mockClear()
  })

  it('a single deleted track drops its device copy', async () => {
    const store = makeStore([track('a')])
    await deleteTrack(store.set, store.get, 'a')
    expect(forgetOfflineTracks).toHaveBeenCalledTimes(1)
    expect(vi.mocked(forgetOfflineTracks).mock.calls[0]?.[2]).toEqual(['a'])
  })

  it('a batch delete drops every selected device copy', async () => {
    const store = makeStore([track('a'), track('b')])
    store.set({ selectedIds: ['a', 'b'] })
    await batchTracks(store.set, store.get, 'delete')
    expect(vi.mocked(forgetOfflineTracks).mock.calls[0]?.[2]).toEqual(['a', 'b'])
  })

  it('a non-delete batch action keeps device copies', async () => {
    const store = makeStore([track('a')])
    store.set({ selectedIds: ['a'] })
    await batchTracks(store.set, store.get, 'favorite')
    expect(forgetOfflineTracks).not.toHaveBeenCalled()
  })
})
