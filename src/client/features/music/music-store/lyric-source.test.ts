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
      searchTrackLyric: vi.fn(async () => ({ lyric: '[00:12.00]from lrclib' })),
      providerLyric: vi.fn(async () => ({ lyric: '' })),
      patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    },
  },
}))
vi.mock('../providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../providers')>()),
  searchGds: vi.fn(async () => ({ results: [], failedSources: [] })),
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { searchGds } from '../providers'
import { toastMusic, toastMusicNotice } from '../music-feedback'
import { searchTrackLyric } from './library-lyrics'
import { lyricSourceOrder } from '../music-utils'
import type { MusicStoreState } from './types'

function track(id: string, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id, title: id, artist: 'Artist', album: '', durationMs: 60_000,
    source: 'r2', coverUrl: null, lyric: null, hasLyric: false, ...overrides,
  } as MusicTrack
}

function makeStore(tracks: MusicTrack[], overrides: Partial<MusicStoreState> = {}) {
  let state = { tracks, ...overrides } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

function notFound(): never {
  throw new FakeApiError(404, 'not_found', 'No lyrics matched this track')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.music.searchTrackLyric).mockImplementation(async () => ({ lyric: '[00:12.00]from lrclib' }))
  vi.mocked(api.music.providerLyric).mockReset()
  vi.mocked(api.music.providerLyric).mockImplementation(async () => ({ lyric: '' }))
  vi.mocked(searchGds).mockImplementation(async () => ({ results: [], failedSources: [] }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// FB-F13: the order is the whole policy, so it is a pure function that the UI can also read.
describe('lyric source order (FB-F13)', () => {
  it('follows the preference when the reader named a source', () => {
    expect(lyricSourceOrder('lrclib', track('t1'))).toEqual(['lrclib'])
    expect(lyricSourceOrder('catalogue', track('t1'))).toEqual(['catalogue'])
  })

  it('asks the row\'s own catalogue entry before the crowd-sourced one', () => {
    const provider = track('t1', { source: 'provider', providerSource: 'netease', providerSongId: 'abc' })
    expect(lyricSourceOrder('auto', provider)).toEqual(['catalogue', 'lrclib'])
  })

  it('asks the crowd-sourced source before searching a catalogue by name', () => {
    expect(lyricSourceOrder('auto', track('t1'))).toEqual(['lrclib', 'catalogue'])
  })
})

// The lookup is what the row menu runs, and it reports which source answered.
describe('lyric lookup by source (FB-F13)', () => {
  it('stops at the first source that answers and names it', async () => {
    const store = makeStore([track('t1')], { lyricSource: 'auto', providerEnabled: { gds: true } })
    await searchTrackLyric(store.set, store.get, 't1')
    expect(vi.mocked(api.music.searchTrackLyric)).toHaveBeenCalledWith('t1')
    expect(vi.mocked(api.music.patchTrack).mock.calls[0]?.[1]).toEqual({ lyric: '[00:12.00]from lrclib' })
    expect(toastMusic).toHaveBeenCalledWith('music.lyrics_matched_from', { value0: 'lrclib' })
  })

  it('falls back to the catalogue when the crowd-sourced source has nothing', async () => {
    vi.mocked(api.music.searchTrackLyric).mockImplementation(notFound)
    vi.mocked(searchGds).mockResolvedValue({
      results: [{ provider: 'gds', source: 'netease', sourceId: 'abc', title: 't1', artist: 'Artist', album: '', durationMs: 60_000, coverId: null, lyricId: 'ly-1' }],
      failedSources: [],
    })
    vi.mocked(api.music.providerLyric).mockImplementation(async () => ({ lyric: '[00:01.00]from catalogue' }))
    const store = makeStore([track('t1')], { lyricSource: 'auto', providerEnabled: { gds: true } })
    await searchTrackLyric(store.set, store.get, 't1')
    expect(vi.mocked(api.music.providerLyric)).toHaveBeenCalledWith('netease', 'ly-1')
    expect(vi.mocked(api.music.patchTrack).mock.calls[0]?.[1]).toEqual({ lyric: '[00:01.00]from catalogue' })
    expect(toastMusic).toHaveBeenCalledWith('music.lyrics_matched_from', { value0: 'catalogue' })
  })

  it('reads a provider row\'s own entry without searching for it', async () => {
    vi.mocked(api.music.searchTrackLyric).mockImplementation(notFound)
    vi.mocked(api.music.providerLyric).mockImplementation(async () => ({ lyric: '[00:02.00]own entry' }))
    const store = makeStore(
      [track('t1', { source: 'provider', providerSource: 'netease', providerSongId: 'song-9' })],
      { lyricSource: 'auto', providerEnabled: { gds: true } },
    )
    await searchTrackLyric(store.set, store.get, 't1')
    expect(vi.mocked(api.music.providerLyric)).toHaveBeenCalledWith('netease', 'song-9')
    expect(vi.mocked(searchGds)).not.toHaveBeenCalled()
    expect(vi.mocked(api.music.searchTrackLyric)).not.toHaveBeenCalled()
  })

})

describe('lyric lookup limits (FB-F13)', () => {
  it('does not reach a catalogue the reader never turned on', async () => {
    vi.mocked(api.music.searchTrackLyric).mockImplementation(notFound)
    const store = makeStore([track('t1')], { lyricSource: 'auto', providerEnabled: {} })
    await searchTrackLyric(store.set, store.get, 't1')
    expect(vi.mocked(searchGds)).not.toHaveBeenCalled()
    expect(vi.mocked(api.music.providerLyric)).not.toHaveBeenCalled()
    expect(toastMusicNotice).toHaveBeenCalledWith('music.lyrics_unmatched')
  })

  it('honours an explicit source even when the preference says otherwise', async () => {
    vi.mocked(api.music.searchTrackLyric).mockImplementation(notFound)
    vi.mocked(searchGds).mockResolvedValue({
      results: [{ provider: 'gds', source: 'kuwo', sourceId: 'k1', title: 't1', artist: 'Artist', album: '', durationMs: 60_000, coverId: null, lyricId: 'ly-2' }],
      failedSources: [],
    })
    vi.mocked(api.music.providerLyric).mockImplementation(async () => ({ lyric: '[00:03.00]asked for' }))
    const store = makeStore([track('t1')], { lyricSource: 'lrclib', providerEnabled: { gds: true } })
    await searchTrackLyric(store.set, store.get, 't1', 'catalogue')
    expect(vi.mocked(api.music.searchTrackLyric)).not.toHaveBeenCalled()
    expect(vi.mocked(api.music.patchTrack).mock.calls[0]?.[1]).toEqual({ lyric: '[00:03.00]asked for' })
  })
})
