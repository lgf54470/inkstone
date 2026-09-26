import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { useMusic } from './index'
import { loadPreferences, MUSIC_PREFS_KEY } from './state'

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('lyric style preferences (FEA-C4)', () => {
  it('persists both settings through the debounced preference write', () => {
    vi.useFakeTimers()
    useMusic.getState().setLyricAlign('center')
    useMusic.getState().setLyricTextSize('large')
    vi.advanceTimersByTime(250)
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    expect(stored.lyricAlign).toBe('center')
    expect(stored.lyricTextSize).toBe('large')
  })

  it('rejects junk values on load like the other sound settings', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ lyricAlign: 'middle', lyricTextSize: 'huge' }))
    const prefs = loadPreferences()
    expect(prefs.lyricAlign).toBe('left')
    expect(prefs.lyricTextSize).toBe('default')
  })
})
