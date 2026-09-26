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
  startPlayback: vi.fn(async () => 'playing' as const),
  stopPlayback: vi.fn(),
}))

import { startPlayback } from '../audio-engine'
import { cycleMode, playNext, playPrevious } from './player'
import { addToQueue, removeFromQueue } from './queue-ops'
import { dropFromQueue } from './library-tracks'
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
  vi.mocked(startPlayback).mockClear()
})

describe('cycleMode builds and clears the shuffle order', () => {
  it('entering shuffle creates a play order that starts at the current track', () => {
    const store = makeStore()
    cycleMode(store.set, store.get)
    expect(store.state().mode).toBe('repeat-all')
    cycleMode(store.set, store.get)
    expect(store.state().mode).toBe('repeat-one')
    cycleMode(store.set, store.get)
    expect(store.state().mode).toBe('shuffle')
    const order = store.state().shuffleOrder
    expect(order?.[0]).toBe('a')
    expect([...order!].sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaving shuffle clears the order and never reorders the queue itself', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    cycleMode(store.set, store.get)
    expect(store.state().mode).toBe('order')
    expect(store.state().shuffleOrder).toBeNull()
    expect(store.state().queue).toEqual(['a', 'b', 'c'])
  })
})

describe('shuffle playback walks the sequence', () => {
  it('plays every track once before wrapping, without repeats', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    void playNext(store.set, store.get)
    void playNext(store.set, store.get)
    void playNext(store.set, store.get)
    const played = vi.mocked(startPlayback).mock.calls.map(([played]) => (played as MusicTrack).id)
    expect(played).toEqual(['b', 'c', 'a'])
    expect(store.state().currentIndex).toBe(0)
  })

  it('previous lands on the track that actually played before', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    void playPrevious(store.set, store.get)
    expect(store.state().queue[store.state().currentIndex]).toBe('c')
  })
})

describe('queue edits keep the shuffle order in step', () => {
  it('a play-next insertion plays right after the current track', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    addToQueue(store.set, store.get, 'd', true)
    expect(store.state().queue).toEqual(['a', 'd', 'b', 'c'])
    expect(store.state().shuffleOrder).toEqual(['c', 'a', 'd', 'b'])
  })

  it('removing a queued row drops it from the play order', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    removeFromQueue(store.set, store.get, 1)
    expect(store.state().shuffleOrder).toEqual(['c', 'a'])
  })

  it('deleting library tracks drops them from the play order', () => {
    const store = makeStore({ mode: 'shuffle', shuffleOrder: ['c', 'a', 'b'] })
    dropFromQueue(store.set, store.get, new Set(['b']))
    expect(store.state().queue).toEqual(['a', 'c'])
    expect(store.state().shuffleOrder).toEqual(['c', 'a'])
  })
})
