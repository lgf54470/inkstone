import { describe, expect, it, vi } from 'vitest'

import { EQ_BAND_COUNT, EQ_BANDS } from './music-eq-bands'
import { FakeAudioContext, loadedEngine, normalizedEngine, useFakeAudioStack } from './audio-engine.test-helpers'

useFakeAudioStack()

// A gain per band, named by the band it belongs to. Spelled as an index map rather than a ten-element
// array so the intent of an assertion stays readable now that every band has to be listed.
function bands(entries: Record<number, number>): number[] {
  return Array.from({ length: EQ_BAND_COUNT }, (_, index) => entries[index] ?? 0)
}

describe('analyser context lifecycle', () => {
  it('suspends the context only after a pause that stuck', async () => {
    const { context, audio } = await loadedEngine()
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(4_999)
    expect(context.suspendCalls).toBe(0)
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(10_000)
    expect(context.suspendCalls).toBe(0)
    expect(context.resumeCalls).toBe(0)
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(5_000)
    expect(context.suspendCalls).toBe(1)
    audio.dispatchEvent(new Event('play'))
    expect(context.resumeCalls).toBe(1)
    expect(context.state).toBe('running')
  })

  it('never builds a context when the analyser graph was never requested', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.mediaElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(10_000)
    expect(FakeAudioContext.instances).toEqual([])
  })
})

describe('equalizer graph', () => {
  it('routes playback through a normalization gain and one filter per band before the analyser', async () => {
    const { context } = await loadedEngine()
    // The chain is asserted from the shared table rather than spelled out: what this test is about is
    // that the graph matches the table, band for band, and that every filter is wired to the next.
    const chain = EQ_BANDS.map((_, index) => [
      `filter${index}`,
      index + 1 < EQ_BAND_COUNT ? `filter${index + 1}` : 'analyser',
    ])
    expect(context.connections).toEqual([
      ['source', 'norm'],
      ['norm', 'filter0'],
      ['source', 'loudness-tap'],
      ...chain,
      ['analyser', 'destination'],
    ])
    expect(context.analysers[1]?.fftSize).toBe(2_048)
    expect(context.biquads).toHaveLength(EQ_BAND_COUNT)
    expect(context.biquads.map((node) => node.type)).toEqual(EQ_BANDS.map((band) => band.type))
    expect(context.biquads.map((node) => node.frequency.value)).toEqual(EQ_BANDS.map((band) => band.frequencyHz))
    expect(context.biquads[1]?.Q.value).toBe(1.41)
    expect(context.biquads.map((node) => node.gain.value)).toEqual(bands({}))
  })

  it('reuses the chain when asked again for the same element', async () => {
    const { context, engine } = await loadedEngine()
    await engine.ensureAudioGraph()
    expect(context.biquads).toHaveLength(EQ_BAND_COUNT)
    expect(context.analysers).toHaveLength(2)
  })

  it('applies stored settings to a graph built afterwards', async () => {
    const engine = await import('./audio-engine')
    engine.configureEqualizer({ enabled: true, bandsDb: bands({ 0: 6, 4: -3, 9: 2 }) })
    const { context } = await loadedEngine()
    expect(context.biquads.map((node) => node.gain.value)).toEqual(bands({ 0: 6, 4: -3, 9: 2 }))
  })

  it('retunes a live graph and silences every band when disabled', async () => {
    const { engine, context } = await loadedEngine()
    engine.configureEqualizer({ enabled: true, bandsDb: bands({ 0: 4, 9: -5 }) })
    expect(context.biquads.map((node) => node.gain.value)).toEqual(bands({ 0: 4, 9: -5 }))
    engine.configureEqualizer({ enabled: false, bandsDb: bands({ 0: 4, 9: -5 }) })
    expect(context.biquads.map((node) => node.gain.value)).toEqual(bands({}))
  })
})

describe('play gesture graph retry', () => {
  it('retries the blocked graph on the play gesture once the EQ is on', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.mediaElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    engine.configureEqualizer({ enabled: true, bandsDb: bands({ 0: 3 }) })
    expect(FakeAudioContext.instances).toEqual([])
    audio.dispatchEvent(new Event('play'))
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0]?.biquads.map((node) => node.gain.value)).toEqual(bands({ 0: 3 }))
  })

  it('leaves a plain play event without a graph while the EQ is off', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.mediaElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.dispatchEvent(new Event('play'))
    expect(FakeAudioContext.instances).toEqual([])
  })

  it('retries the blocked graph on the play gesture when only normalization is on', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.mediaElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    engine.configureLoudnessNormalization(true)
    expect(FakeAudioContext.instances).toEqual([])
    audio.dispatchEvent(new Event('play'))
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0]?.analysers[1]?.fftSize).toBe(2_048)
  })
})

describe('loudness normalization corrections', () => {
  it('boosts a quiet file back toward the target level', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    expect(gain.gain.value).toBeGreaterThan(1)
  })

  it('turns a loud file down toward the target level', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    tap.timeDomainByte = 200
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    expect(gain.gain.value).toBeLessThan(1)
  })

  it('caps the correction at the maximum gain', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    tap.timeDomainByte = 129
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(60_000)
    expect(gain.gain.value).toBeLessThanOrEqual(10 ** (12 / 20) + 1e-9)
    expect(gain.gain.value).toBeGreaterThan(3.9)
  })

  it('factors the user volume out of the measurement', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 0.5
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    // At half volume the file already sits near the target; without dividing the
    // volume back out this same signal would read 6 dB quieter and be boosted to ~1.19.
    expect(gain.gain.value).toBeLessThan(1.05)
  })
})

describe('loudness normalization guards', () => {
  it('leaves the level alone on silence', async () => {
    const { audio, gain } = await normalizedEngine()
    audio.volume = 1
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(4_000)
    expect(gain.gain.value).toBe(1)
  })

  it('does not chase the meter while the audio is muted', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    audio.muted = true
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    expect(gain.gain.value).toBe(1)
  })
})

describe('loudness normalization polling stops', () => {
  it('stops polling once a pause sticks', async () => {
    const { audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    audio.dispatchEvent(new Event('pause'))
    const frozen = gain.gain.value
    expect(frozen).not.toBe(1)
    vi.advanceTimersByTime(10_000)
    expect(gain.gain.value).toBe(frozen)
  })

  it('releases the level and stops correcting when switched off', async () => {
    const { engine, audio, tap, gain } = await normalizedEngine()
    audio.volume = 1
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(500)
    engine.configureLoudnessNormalization(false)
    expect(gain.gain.value).toBe(1)
    vi.advanceTimersByTime(5_000)
    expect(gain.gain.value).toBe(1)
  })

  it('never polls while normalization is off', async () => {
    const { context, audio } = await loadedEngine()
    const tap = context.analysers[1]
    if (!tap) throw new Error('the graph should carry a loudness tap')
    audio.volume = 1
    tap.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    vi.advanceTimersByTime(5_000)
    expect(context.gains[0]?.gain.value).toBe(1)
  })
})
