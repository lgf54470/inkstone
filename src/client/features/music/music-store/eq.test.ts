import { afterEach, describe, expect, it, vi } from 'vitest'

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

import { configureEqualizer, configureLoudnessNormalization, ensureAudioGraph } from '../audio-engine'
import { useMusic } from './index'
import { MUSIC_PREFS_KEY, loadPreferences, savePreferences } from './state'

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(configureEqualizer).mockClear()
  vi.mocked(configureLoudnessNormalization).mockClear()
  vi.mocked(ensureAudioGraph).mockClear()
  window.localStorage.clear()
  // The store module is shared across tests in this file; leave no sound-setting residue.
  useMusic.setState({ eqEnabled: false, eqLowDb: 0, eqMidDb: 0, eqHighDb: 0, normalizeEnabled: false })
})

describe('equalizer preferences drive the engine', () => {
  it('pushes band edits to the engine with the live enable flag', () => {
    useMusic.getState().setEqBand('low', 6)
    useMusic.getState().setEqEnabled(true)
    expect(useMusic.getState().eqLowDb).toBe(6)
    expect(useMusic.getState().eqEnabled).toBe(true)
    expect(configureEqualizer).toHaveBeenLastCalledWith({ enabled: true, lowDb: 6, midDb: 0, highDb: 0 })
  })

  it('clamps band gains to the audible range and rejects junk', () => {
    useMusic.getState().setEqBand('mid', 99)
    expect(useMusic.getState().eqMidDb).toBe(12)
    useMusic.getState().setEqBand('mid', -99)
    expect(useMusic.getState().eqMidDb).toBe(-12)
    useMusic.getState().setEqBand('mid', Number.NaN)
    expect(useMusic.getState().eqMidDb).toBe(0)
  })

  it('tries to start a blocked audio graph when the EQ is switched on', () => {
    useMusic.getState().setEqEnabled(true)
    expect(ensureAudioGraph).toHaveBeenCalledTimes(1)
    useMusic.getState().setEqEnabled(false)
    expect(ensureAudioGraph).toHaveBeenCalledTimes(1)
  })

  it('persists the EQ state into the debounced preference write', () => {
    vi.useFakeTimers()
    useMusic.getState().setEqBand('mid', 7)
    useMusic.getState().setEqEnabled(true)
    vi.advanceTimersByTime(250)
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    expect(stored.eqEnabled).toBe(true)
    expect(stored.eqMidDb).toBe(7)
  })

  it('stores band gains per band without disturbing the others', () => {
    useMusic.getState().setEqBand('low', 4)
    useMusic.getState().setEqBand('mid', 2)
    useMusic.getState().setEqBand('high', -3)
    const state = useMusic.getState()
    expect([state.eqLowDb, state.eqMidDb, state.eqHighDb]).toEqual([4, 2, -3])
  })
})

describe('equalizer preferences survive a reload', () => {
  it('round-trips through localStorage', () => {
    savePreferences({
      ...loadPreferences(),
      eqEnabled: true,
      eqLowDb: 5,
      eqMidDb: -2,
      eqHighDb: 12,
    })
    const prefs = loadPreferences()
    expect(prefs.eqEnabled).toBe(true)
    expect([prefs.eqLowDb, prefs.eqMidDb, prefs.eqHighDb]).toEqual([5, -2, 12])
  })

  it('falls back to a flat off EQ when stored values are junk', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      eqEnabled: 'yes',
      eqLowDb: Infinity,
      eqMidDb: 9_999,
      eqHighDb: null,
    }))
    const prefs = loadPreferences()
    expect(prefs.eqEnabled).toBe(false)
    expect([prefs.eqLowDb, prefs.eqMidDb, prefs.eqHighDb]).toEqual([0, 12, 0])
  })
})

describe('equalizer boots from stored preferences', () => {
  it('seeds the engine when a fresh store is created', async () => {
    savePreferences({ ...loadPreferences(), eqEnabled: true, eqLowDb: 8 })
    vi.resetModules()
    const engine = await import('../audio-engine')
    await import('./index')
    expect(engine.configureEqualizer).toHaveBeenCalledWith({ enabled: true, lowDb: 8, midDb: 0, highDb: 0 })
  })
})

describe('loudness normalization drives the engine', () => {
  it('hands the enable flag to the engine and retries a blocked graph on', () => {
    useMusic.getState().setNormalizeEnabled(true)
    expect(useMusic.getState().normalizeEnabled).toBe(true)
    expect(configureLoudnessNormalization).toHaveBeenLastCalledWith(true)
    expect(ensureAudioGraph).toHaveBeenCalledTimes(1)
  })

  it('tells the engine to release the level when switched off, without a graph retry', () => {
    useMusic.getState().setNormalizeEnabled(false)
    expect(configureLoudnessNormalization).toHaveBeenLastCalledWith(false)
    expect(ensureAudioGraph).not.toHaveBeenCalled()
  })
})

describe('loudness normalization persists and boots', () => {
  it('writes the flag into the debounced preference save', () => {
    vi.useFakeTimers()
    useMusic.getState().setNormalizeEnabled(true)
    vi.advanceTimersByTime(250)
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    expect(stored.normalizeEnabled).toBe(true)
  })

  it('round-trips through localStorage and ignores junk', () => {
    savePreferences({ ...loadPreferences(), normalizeEnabled: true })
    expect(loadPreferences().normalizeEnabled).toBe(true)
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ normalizeEnabled: 'yes' }))
    expect(loadPreferences().normalizeEnabled).toBe(false)
  })

  it('seeds the engine from the stored flag when a fresh store is created', async () => {
    savePreferences({ ...loadPreferences(), normalizeEnabled: true })
    vi.resetModules()
    const engine = await import('../audio-engine')
    const fresh = await import('./index')
    expect(engine.configureLoudnessNormalization).toHaveBeenCalledWith(true)
    expect(fresh.useMusic.getState().normalizeEnabled).toBe(true)
  })
})
