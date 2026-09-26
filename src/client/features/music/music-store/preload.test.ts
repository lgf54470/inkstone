import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  preloadNext: vi.fn(),
  resumePlayback: vi.fn(async () => 'playing' as const),
  seekTo: vi.fn(),
  startCrossfade: vi.fn(() => true),
  startPlayback: vi.fn(async () => 'playing' as const),
  stopPlayback: vi.fn(),
}))
vi.mock('../media-session', () => ({
  bindMediaSessionActions: vi.fn(),
  publishMediaSession: vi.fn(),
  updateMediaSessionPosition: vi.fn(),
}))

import { configureAudio, preloadNext } from '../audio-engine'
import { useMusic } from './index'

function track(id: string, durationMs = 30_000): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs, isPinned: false } as MusicTrack
}

// The store configures its bridge at module import; the function identity survives
// clearAllMocks, so the tests can keep driving this same captured bridge.
const bootCalls = vi.mocked(configureAudio).mock.calls
const audioBridge = bootCalls[bootCalls.length - 1]?.[0]
if (!audioBridge) throw new Error('the store should have configured the audio bridge')

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
  useMusic.setState({
    tracks: [track('a'), track('b'), track('c')],
    queue: ['a', 'b', 'c'],
    currentIndex: 0,
    mode: 'order',
    durationMs: 30_000,
    isPlaying: true,
    sleepAfterCurrentTrack: false,
    crossfadeEnabled: true,
  })
})

afterEach(() => {
  window.localStorage.clear()
  useMusic.setState({ crossfadeEnabled: false, sleepAfterCurrentTrack: false, mode: 'order' })
})

describe('next-track preload decision (FEA-C1)', () => {
  it('preloads the next track once it is inside the window', () => {
    audioBridge.onTime(20_000)
    expect(preloadNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('does not preload far from the end', () => {
    audioBridge.onTime(1_000)
    expect(preloadNext).not.toHaveBeenCalled()
  })

  it('preloads for the plain advance too — the window is not tied to the crossfade switch', () => {
    useMusic.setState({ crossfadeEnabled: false })
    audioBridge.onTime(20_000)
    expect(preloadNext).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('honours repeat-one, stop-after-current-track and the last queue item', () => {
    useMusic.setState({ mode: 'repeat-one' })
    audioBridge.onTime(29_900)
    useMusic.setState({ mode: 'order', sleepAfterCurrentTrack: true })
    audioBridge.onTime(29_900)
    useMusic.setState({ sleepAfterCurrentTrack: false, queue: ['a'], currentIndex: 0 })
    audioBridge.onTime(29_900)
    expect(preloadNext).not.toHaveBeenCalled()
  })

  it('skips the preload when the next queue entry is the same recording', () => {
    useMusic.setState({ queue: ['a', 'a', 'b'] })
    audioBridge.onTime(29_900)
    expect(preloadNext).not.toHaveBeenCalled()
  })
})
