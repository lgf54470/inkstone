import { afterEach, describe, expect, it, vi } from 'vitest'

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
  preloadNext: vi.fn(),
  startPlayback: vi.fn(async () => 'playing' as const),
  stopPlayback: vi.fn(),
}))

import { configureEqualizer, configureLoudnessNormalization, ensureAudioGraph } from '../audio-engine'
import { EQ_BANDS, emptyEqBands } from '../music-eq-bands'
import { useMusic } from './index'
import { MUSIC_PREFS_KEY, loadPreferences, savePreferences } from './state'

const MID = 4
const HIGH = 9

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(configureEqualizer).mockClear()
  vi.mocked(configureLoudnessNormalization).mockClear()
  vi.mocked(ensureAudioGraph).mockClear()
  window.localStorage.clear()
  // The store module is shared across tests in this file; leave no sound-setting residue.
  useMusic.setState({ eqEnabled: false, eqBandsDb: emptyEqBands(), normalizeEnabled: false })
})

describe('equalizer preferences drive the engine', () => {
  it('pushes band edits to the engine with the live enable flag', () => {
    useMusic.getState().setEqBand(0, 6)
    useMusic.getState().setEqEnabled(true)
    expect(useMusic.getState().eqBandsDb[0]).toBe(6)
    expect(useMusic.getState().eqEnabled).toBe(true)
    expect(configureEqualizer).toHaveBeenLastCalledWith({
      enabled: true,
      bandsDb: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
  })

  it('clamps band gains to the audible range and rejects junk', () => {
    useMusic.getState().setEqBand(MID, 99)
    expect(useMusic.getState().eqBandsDb[MID]).toBe(12)
    useMusic.getState().setEqBand(MID, -99)
    expect(useMusic.getState().eqBandsDb[MID]).toBe(-12)
    useMusic.getState().setEqBand(MID, Number.NaN)
    expect(useMusic.getState().eqBandsDb[MID]).toBe(0)
  })

  it('tries to start a blocked audio graph when the EQ is switched on', () => {
    useMusic.getState().setEqEnabled(true)
    expect(ensureAudioGraph).toHaveBeenCalledTimes(1)
    useMusic.getState().setEqEnabled(false)
    expect(ensureAudioGraph).toHaveBeenCalledTimes(1)
  })

  it('persists the EQ state into the debounced preference write', () => {
    vi.useFakeTimers()
    useMusic.getState().setEqBand(MID, 7)
    useMusic.getState().setEqEnabled(true)
    vi.advanceTimersByTime(250)
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    expect(stored.eqEnabled).toBe(true)
    expect(stored.eqBandsDb).toEqual([0, 0, 0, 0, 7, 0, 0, 0, 0, 0])
  })

  it('stores band gains per band without disturbing the others', () => {
    useMusic.getState().setEqBand(0, 4)
    useMusic.getState().setEqBand(MID, 2)
    useMusic.getState().setEqBand(HIGH, -3)
    const bands = useMusic.getState().eqBandsDb
    expect([bands[0], bands[MID], bands[HIGH]]).toEqual([4, 2, -3])
    expect(bands.filter((db) => db !== 0)).toHaveLength(3)
  })

})

// A slider names its band by position, so a position the table does not have is a programming error
// rather than a gain — it must not silently grow the array the graph is indexed by.
describe('band edits stay inside the table', () => {
  it('ignores a band index the table does not have', () => {
    useMusic.getState().setEqBand(EQ_BANDS.length, 8)
    useMusic.getState().setEqBand(-1, 8)
    expect(useMusic.getState().eqBandsDb).toEqual(emptyEqBands())
  })
})

describe('equalizer preferences survive a reload', () => {
  it('round-trips through localStorage', () => {
    savePreferences({
      ...loadPreferences(),
      eqEnabled: true,
      eqBandsDb: [5, 5, 5, 0, -2, -2, -2, 12, 12, 12],
    })
    const prefs = loadPreferences()
    expect(prefs.eqEnabled).toBe(true)
    expect(prefs.eqBandsDb).toEqual([5, 5, 5, 0, -2, -2, -2, 12, 12, 12])
  })

  it('falls back to a flat off EQ when stored values are junk', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      eqEnabled: 'yes',
      eqBandsDb: [Infinity, 9_999, null],
    }))
    const prefs = loadPreferences()
    expect(prefs.eqEnabled).toBe(false)
    expect(prefs.eqBandsDb).toEqual([0, 12, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('reads a stored array of an older length without discarding it', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ eqBandsDb: [1, 2, 3] }))
    expect(loadPreferences().eqBandsDb).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0])
  })
})

// The three-band equalizer voiced a low shelf (180 Hz), one octave around 1 kHz and a high shelf
// (4.5 kHz). An upgrade that dropped those values would silently flatten a sound the reader had
// shaped, so each one is copied onto every band it used to cover.
describe('upgrading from the three-band equalizer', () => {
  it('spreads each old band over the new bands it covered', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      eqLowDb: 5,
      eqMidDb: -2,
      eqHighDb: 12,
    }))
    expect(loadPreferences().eqBandsDb).toEqual([5, 5, 5, 0, -2, -2, -2, 12, 12, 12])
  })

  it('leaves the new shape alone once it exists', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      eqBandsDb: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      eqLowDb: 9,
      eqMidDb: 9,
      eqHighDb: 9,
    }))
    expect(loadPreferences().eqBandsDb).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0])
  })
})

describe('equalizer boots from stored preferences', () => {
  it('seeds the engine when a fresh store is created', async () => {
    savePreferences({ ...loadPreferences(), eqEnabled: true, eqBandsDb: [8, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    vi.resetModules()
    const engine = await import('../audio-engine')
    await import('./index')
    expect(engine.configureEqualizer).toHaveBeenCalledWith({
      enabled: true,
      bandsDb: [8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
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
