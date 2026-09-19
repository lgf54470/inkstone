import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

const FakeApiError = vi.hoisted(() => {
  return class extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message)
    }
  }
})

vi.mock('../../../lib/api', () => ({
  ApiError: FakeApiError,
  api: {
    music: {
      searchTrackLyric: vi.fn(async () => ({ lyric: '[00:12.00]written line' })),
      patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    },
  },
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { toastMusic, toastMusicError, toastMusicNotice } from '../music-feedback'
import { searchTrackLyric } from './library-lyrics'
import type { MusicStoreState } from './types'

function track(id: string, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id, title: id, artist: 'Artist', album: '', durationMs: 60_000,
    source: 'r2', coverUrl: null, lyric: null, hasLyric: false, ...overrides,
  } as MusicTrack
}

function makeStore(tracks: MusicTrack[]) {
  let state = { tracks } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

beforeEach(() => {
  vi.mocked(api.music.searchTrackLyric).mockClear()
  vi.mocked(api.music.patchTrack).mockClear()
  vi.mocked(toastMusic).mockClear()
  vi.mocked(toastMusicError).mockClear()
  vi.mocked(toastMusicNotice).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('online lyric search (M-52)', () => {
  it('saves the match through the metadata patch and merges it into the library', async () => {
    const store = makeStore([track('t1')])
    await searchTrackLyric(store.set, store.get, 't1')
    expect(api.music.searchTrackLyric).toHaveBeenCalledWith('t1')
    expect(api.music.patchTrack).toHaveBeenCalledWith('t1', { lyric: '[00:12.00]written line' })
    expect(store.state().tracks[0]?.lyric).toBe('[00:12.00]written line')
    expect(toastMusic).toHaveBeenCalledWith('music.lyrics_matched')
  })

  it('reports a missing match as a notice without saving anything', async () => {
    const store = makeStore([track('t1')])
    vi.mocked(api.music.searchTrackLyric).mockRejectedValueOnce(new FakeApiError(404, 'not_found', 'No lyrics matched this track'))
    await searchTrackLyric(store.set, store.get, 't1')
    expect(api.music.patchTrack).not.toHaveBeenCalled()
    expect(toastMusicNotice).toHaveBeenCalledWith('music.lyrics_unmatched')
    expect(toastMusicError).not.toHaveBeenCalled()
  })

  it('surfaces an upstream failure as an error, not as silence', async () => {
    const store = makeStore([track('t1')])
    const failure = new FakeApiError(500, 'internal', 'boom')
    vi.mocked(api.music.searchTrackLyric).mockRejectedValueOnce(failure)
    await searchTrackLyric(store.set, store.get, 't1')
    expect(toastMusicError).toHaveBeenCalledWith(failure, 'music.lyric_search_failed')
    expect(toastMusicNotice).not.toHaveBeenCalled()
  })

  it('reports a failed save instead of pretending the lyric landed', async () => {
    const store = makeStore([track('t1')])
    const failure = new Error('write rejected')
    vi.mocked(api.music.patchTrack).mockRejectedValueOnce(failure)
    await searchTrackLyric(store.set, store.get, 't1')
    expect(store.state().tracks[0]?.lyric).toBeNull()
    expect(toastMusicError).toHaveBeenCalledWith(failure, 'music.save_failed')
    expect(toastMusic).not.toHaveBeenCalled()
  })

  it('ignores an id that left the library mid-flight', async () => {
    const store = makeStore([track('t1')])
    await searchTrackLyric(store.set, store.get, 'gone')
    expect(api.music.searchTrackLyric).not.toHaveBeenCalled()
    expect(toastMusic).not.toHaveBeenCalled()
  })
})
