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

import { api } from '../../../lib/api'
import { cancelCrossfade, configureAudio, crossfadeActive, startCrossfade } from '../audio-engine'
import { publishMediaSession } from '../media-session'
import { useMusic } from './index'
import { progressTimeMs, setProgressTime } from './progress'
import { MUSIC_PREFS_KEY, loadPreferences, savePreferences } from './state'

function track(id: string, durationMs = 10_000): MusicTrack {
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
  // clearAllMocks keeps factory implementations but drops per-test overrides.
  vi.mocked(crossfadeActive).mockReturnValue(false)
  useMusic.setState({
    tracks: [track('a'), track('b')],
    queue: ['a', 'b'],
    currentIndex: 0,
    mode: 'order',
    durationMs: 10_000,
    isPlaying: true,
    sleepAfterCurrentTrack: false,
    crossfadeEnabled: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  useMusic.setState({ crossfadeEnabled: false, sleepAfterCurrentTrack: false, mode: 'order' })
})

describe('crossfade start decisions', () => {
  it('starts the fade once the next track is within the window', () => {
    audioBridge.onTime(7_500)
    expect(startCrossfade).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('does not start far from the end', () => {
    audioBridge.onTime(1_000)
    expect(startCrossfade).not.toHaveBeenCalled()
  })

  it('never starts while the engine is already fading', () => {
    vi.mocked(crossfadeActive).mockReturnValue(true)
    audioBridge.onTime(9_900)
    expect(startCrossfade).not.toHaveBeenCalled()
  })

  it('stays off while the preference is off', () => {
    useMusic.setState({ crossfadeEnabled: false })
    audioBridge.onTime(9_900)
    expect(startCrossfade).not.toHaveBeenCalled()
  })

  it('honours repeat-one, stop-after-current-track and the last queue item', () => {
    useMusic.setState({ mode: 'repeat-one' })
    audioBridge.onTime(9_900)
    useMusic.setState({ mode: 'order', sleepAfterCurrentTrack: true })
    audioBridge.onTime(9_900)
    useMusic.setState({ sleepAfterCurrentTrack: false, queue: ['a'], currentIndex: 0 })
    audioBridge.onTime(9_900)
    expect(startCrossfade).not.toHaveBeenCalled()
  })

  it('waits for a track whose duration is still unknown', () => {
    useMusic.setState({ tracks: [track('a'), track('b', 0)] })
    audioBridge.onTime(9_900)
    expect(startCrossfade).not.toHaveBeenCalled()
  })
})

describe('crossfade completion adopts the incoming track', () => {
  it('moves the queue cursor without any reload', async () => {
    setProgressTime(9_999)
    audioBridge.onCrossfadeComplete('b')
    const state = useMusic.getState()
    expect(state.queue).toEqual(['a', 'b'])
    expect(state.currentIndex).toBe(1)
    expect(state.durationMs).toBe(10_000)
    expect(state.isPlaying).toBe(true)
    expect(progressTimeMs()).toBe(0)
    expect(startCrossfade).not.toHaveBeenCalled()
    expect(publishMediaSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), true)
    await Promise.resolve()
    expect(api.music.countPlay).toHaveBeenCalledWith('b')
  })

  it('adopts a shuffled next track that was not queued after the current one', () => {
    useMusic.setState({ queue: ['a'], currentIndex: 0, tracks: [track('a'), track('b')] })
    audioBridge.onCrossfadeComplete('b')
    const state = useMusic.getState()
    expect(state.queue).toEqual(['a', 'b'])
    expect(state.currentIndex).toBe(1)
  })
})

describe('crossfade enable switch', () => {
  it('cancels an in-flight fade when switched off', () => {
    useMusic.getState().setCrossfadeEnabled(false)
    expect(useMusic.getState().crossfadeEnabled).toBe(false)
    expect(cancelCrossfade).toHaveBeenCalledTimes(1)
    useMusic.getState().setCrossfadeEnabled(true)
    expect(cancelCrossfade).toHaveBeenCalledTimes(1)
  })

  it('cancels the fade when sleeping after the current track', () => {
    useMusic.getState().setSleepAfterCurrentTrack(true)
    expect(cancelCrossfade).toHaveBeenCalledTimes(1)
    useMusic.getState().setSleepAfterCurrentTrack(false)
    expect(cancelCrossfade).toHaveBeenCalledTimes(1)
  })
})

describe('crossfade preference persistence', () => {
  it('persists the switch through the debounced preference write', () => {
    vi.useFakeTimers()
    useMusic.getState().setCrossfadeEnabled(true)
    vi.advanceTimersByTime(250)
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    expect(stored.crossfadeEnabled).toBe(true)
  })

  it('round-trips and rejects junk like the other sound settings', () => {
    savePreferences({ ...loadPreferences(), crossfadeEnabled: true })
    expect(loadPreferences().crossfadeEnabled).toBe(true)
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ crossfadeEnabled: 'yes' }))
    expect(loadPreferences().crossfadeEnabled).toBe(false)
  })
})
