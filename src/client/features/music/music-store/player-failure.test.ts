import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({ api: { music: { countPlay: vi.fn(async () => {}) } } }))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))
vi.mock('./providers', () => ({ swapFailedProviderTrack: vi.fn(async () => false) }))
vi.mock('../audio-engine', () => ({
  applyVolume: vi.fn(),
  mediaElement: vi.fn(() => null),
  CROSSFADE_MS: 3_000,
  cancelCrossfade: vi.fn(),
  configureAudio: vi.fn(),
  configureEqualizer: vi.fn(),
  configureLoudnessNormalization: vi.fn(),
  crossfadeActive: vi.fn(() => false),
  ensureAudioGraph: vi.fn(async () => null),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(async () => 'playing' as const),
  seekTo: vi.fn(),
  startCrossfade: vi.fn(() => false),
  preloadNext: vi.fn(),
  startPlayback: vi.fn(async () => 'unavailable' as const),
  stopPlayback: vi.fn(),
}))

import { startPlayback } from '../audio-engine'
import { toastMusicError, toastMusicNotice } from '../music-feedback'
import { swapFailedProviderTrack } from './providers'
import { playCollection, playTrack } from './player'
import type { MusicStoreState } from './types'

function track(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 1000, isPinned: false } as MusicTrack
}

function makeStore(mode: MusicStoreState['mode'] = 'order') {
  let state = {
    tracks: [track('a'), track('b'), track('c'), track('d')],
    queue: [] as string[],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
    durationMs: 0,
    mode,
    volume: 1,
    muted: false,
    playbackRate: 1,
    searchHistory: [] as string[],
  } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function'
        ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
        : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

function attemptedTrackIds(): string[] {
  return vi.mocked(startPlayback).mock.calls.map(([track]) => track.id)
}

beforeEach(() => {
  vi.mocked(startPlayback).mockClear()
  vi.mocked(startPlayback).mockResolvedValue('unavailable')
  vi.mocked(toastMusicError).mockClear()
})

describe('playback failure auto-advance', () => {
  it('skips a track that cannot play and starts the next one', async () => {
    const store = makeStore()
    vi.mocked(startPlayback)
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValue('playing')
    await playCollection(store.set, store.get, ['a', 'b', 'c'])
    expect(attemptedTrackIds()).toEqual(['a', 'b'])
    expect(store.state().currentIndex).toBe(1)
    expect(store.state().isPlaying).toBe(true)
  })

  it('gives up after three consecutive failures instead of burning the queue', async () => {
    const store = makeStore()
    await playCollection(store.set, store.get, ['a', 'b', 'c', 'd'])
    expect(attemptedTrackIds()).toEqual(['a', 'b', 'c'])
    expect(store.state().isPlaying).toBe(false)
    expect(toastMusicError).toHaveBeenCalledWith(null, 'music.playback_repeated_failures')
  })

  it('a user started collection resets the failure streak', async () => {
    const first = makeStore()
    await playCollection(first.set, first.get, ['a', 'b', 'c', 'd'])
    expect(attemptedTrackIds()).toHaveLength(3)
    const second = makeStore()
    vi.mocked(startPlayback)
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValue('playing')
    await playCollection(second.set, second.get, ['a', 'b', 'c'])
    expect(attemptedTrackIds().slice(3)).toEqual(['a', 'b'])
    expect(second.state().currentIndex).toBe(1)
  })

  it('repeat-one stops on failure because skipping cannot advance', async () => {
    const store = makeStore('repeat-one')
    await playCollection(store.set, store.get, ['a', 'b', 'c'])
    expect(attemptedTrackIds()).toEqual(['a'])
    expect(store.state().isPlaying).toBe(false)
  })
})

describe('provider failure fallback (FEA-A1-4)', () => {
  const providerTrack = (id: string): MusicTrack => ({ ...track(id), source: 'provider' } as MusicTrack)

  beforeEach(() => {
    vi.mocked(swapFailedProviderTrack).mockClear()
    vi.mocked(swapFailedProviderTrack).mockResolvedValue(false)
  })

  it('a failed provider track tries another source before skipping', async () => {
    const store = makeStore()
    store.set({ providerAutoSwap: true, tracks: [providerTrack('dead'), track('alive')], queue: ['dead'], currentIndex: 0 })
    vi.mocked(startPlayback).mockResolvedValueOnce('unavailable').mockResolvedValue('playing')
    vi.mocked(swapFailedProviderTrack).mockImplementationOnce(async (set) => {
      set({ queue: ['alive'] })
      return true
    })
    await playTrack(store.set, store.get, 'dead')
    expect(swapFailedProviderTrack).toHaveBeenCalledWith(store.set, store.get, 'dead')
    expect(attemptedTrackIds()).toEqual(['dead', 'alive'])
    expect(store.state().isPlaying).toBe(true)
    expect(toastMusicNotice).toHaveBeenCalledWith('music.provider_fallback_used')
  })

  it('a provider track with no alternate falls through to the normal skip', async () => {
    const store = makeStore()
    store.set({ tracks: [providerTrack('a'), track('b')] })
    vi.mocked(startPlayback).mockResolvedValueOnce('unavailable').mockResolvedValue('playing')
    await playCollection(store.set, store.get, ['a', 'b'])
    expect(attemptedTrackIds()).toEqual(['a', 'b'])
    expect(store.state().currentIndex).toBe(1)
  })
})
