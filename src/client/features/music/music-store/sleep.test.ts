import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({ api: { music: { countPlay: vi.fn(async () => {}) } } }))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))
vi.mock('../audio-engine', () => ({
  applyVolume: vi.fn(),
  audioElement: vi.fn(() => null),
  bindMediaSessionActions: vi.fn(),
  CROSSFADE_MS: 3_000,
  cancelCrossfade: vi.fn(),
  configureAudio: vi.fn(),
  configureEqualizer: vi.fn(),
  configureLoudnessNormalization: vi.fn(),
  crossfadeActive: vi.fn(() => false),
  ensureAudioGraph: vi.fn(async () => null),
  pausePlayback: vi.fn(),
  publishMediaSession: vi.fn(),
  resumePlayback: vi.fn(async () => 'playing' as const),
  seekTo: vi.fn(),
  startCrossfade: vi.fn(() => false),
  startPlayback: vi.fn(async () => 'playing' as const),
  stopPlayback: vi.fn(),
  updateMediaSessionPosition: vi.fn(),
}))

import { pausePlayback, resumePlayback, startPlayback } from '../audio-engine'
import { handleEnded, setSleepAfterCurrentTrack, setSleepTimer } from './player'
import type { MusicStoreState } from './types'

function track(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 1000, isPinned: false } as MusicTrack
}

function makeStore(overrides: Partial<MusicStoreState> = {}) {
  let state = {
    tracks: [track('a'), track('b'), track('c')],
    queue: ['a', 'b', 'c'],
    currentIndex: 0,
    isPlaying: true,
    streamLoading: false,
    durationMs: 1000,
    mode: 'order',
    volume: 1,
    muted: false,
    playbackRate: 1,
    searchHistory: [],
    sleepEndsAt: null,
    sleepAfterCurrentTrack: false,
    ...overrides,
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

beforeEach(() => {
  vi.mocked(pausePlayback).mockClear()
  vi.mocked(resumePlayback).mockClear()
  vi.mocked(startPlayback).mockClear()
})

describe('sleep modes stay exclusive', () => {
  it('arming the after-current stop clears the minute timer', () => {
    const store = makeStore({ sleepEndsAt: Date.now() + 60_000 })
    setSleepAfterCurrentTrack(store.set, store.get, true)
    expect(store.state().sleepAfterCurrentTrack).toBe(true)
    expect(store.state().sleepEndsAt).toBeNull()
  })

  it('arming a minute timer clears the after-current stop', () => {
    const store = makeStore({ sleepAfterCurrentTrack: true })
    setSleepTimer(store.set, store.get, 30)
    expect(store.state().sleepEndsAt).not.toBeNull()
    expect(store.state().sleepAfterCurrentTrack).toBe(false)
    setSleepTimer(store.set, store.get, null)
  })

  it('turning the sleep timer off clears both modes', () => {
    const store = makeStore({ sleepEndsAt: Date.now() + 60_000, sleepAfterCurrentTrack: true })
    setSleepTimer(store.set, store.get, null)
    expect(store.state().sleepEndsAt).toBeNull()
    expect(store.state().sleepAfterCurrentTrack).toBe(false)
  })
})

describe('track end honours the after-current stop', () => {
  it('pauses instead of advancing when armed', async () => {
    const store = makeStore({ sleepAfterCurrentTrack: true })
    await handleEnded(store.set, store.get)
    expect(pausePlayback).toHaveBeenCalledTimes(1)
    expect(startPlayback).not.toHaveBeenCalled()
    expect(store.state().sleepAfterCurrentTrack).toBe(false)
  })

  it('wins over repeat-one, whose loop would never reach an end', async () => {
    const store = makeStore({ mode: 'repeat-one', sleepAfterCurrentTrack: true })
    await handleEnded(store.set, store.get)
    expect(pausePlayback).toHaveBeenCalledTimes(1)
    expect(resumePlayback).not.toHaveBeenCalled()
  })

  it('advances normally when the sleep mode is not armed', async () => {
    const store = makeStore()
    await handleEnded(store.set, store.get)
    expect(pausePlayback).not.toHaveBeenCalled()
    expect(vi.mocked(startPlayback).mock.calls.map(([track]) => track.id)).toEqual(['b'])
  })
})
