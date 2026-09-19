import { afterEach, describe, expect, it, vi } from 'vitest'

import { FakeAudioContext, loadedEngine, normalizedEngine, useFakeAudioStack } from './audio-engine.test-helpers'

useFakeAudioStack()


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
    const audio = engine.audioElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(10_000)
    expect(FakeAudioContext.instances).toEqual([])
  })
})

describe('equalizer graph', () => {
  it('routes playback through a normalization gain and three EQ filters before the analyser', async () => {
    const { context } = await loadedEngine()
    expect(context.connections).toEqual([
      ['source', 'norm'],
      ['norm', 'filter0'],
      ['source', 'loudness-tap'],
      ['filter0', 'filter1'],
      ['filter1', 'filter2'],
      ['filter2', 'analyser'],
      ['analyser', 'destination'],
    ])
    expect(context.analysers[1]?.fftSize).toBe(2_048)
    expect(context.biquads.map((node) => node.type)).toEqual(['lowshelf', 'peaking', 'highshelf'])
    expect(context.biquads.map((node) => node.frequency.value)).toEqual([180, 1_000, 4_500])
    expect(context.biquads[1]?.Q.value).toBe(1)
    expect(context.biquads.map((node) => node.gain.value)).toEqual([0, 0, 0])
  })

  it('reuses the chain when asked again for the same element', async () => {
    const { context, engine } = await loadedEngine()
    await engine.ensureAudioGraph()
    expect(context.biquads).toHaveLength(3)
    expect(context.analysers).toHaveLength(2)
  })

  it('applies stored settings to a graph built afterwards', async () => {
    const engine = await import('./audio-engine')
    engine.configureEqualizer({ enabled: true, lowDb: 6, midDb: -3, highDb: 2 })
    const { context } = await loadedEngine()
    expect(context.biquads.map((node) => node.gain.value)).toEqual([6, -3, 2])
  })

  it('retunes a live graph and silences every band when disabled', async () => {
    const { engine, context } = await loadedEngine()
    engine.configureEqualizer({ enabled: true, lowDb: 4, midDb: 0, highDb: -5 })
    expect(context.biquads.map((node) => node.gain.value)).toEqual([4, 0, -5])
    engine.configureEqualizer({ enabled: false, lowDb: 4, midDb: 0, highDb: -5 })
    expect(context.biquads.map((node) => node.gain.value)).toEqual([0, 0, 0])
  })
})

describe('play gesture graph retry', () => {
  it('retries the blocked graph on the play gesture once the EQ is on', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.audioElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    engine.configureEqualizer({ enabled: true, lowDb: 3, midDb: 0, highDb: 0 })
    expect(FakeAudioContext.instances).toEqual([])
    audio.dispatchEvent(new Event('play'))
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0]?.biquads.map((node) => node.gain.value)).toEqual([3, 0, 0])
  })

  it('leaves a plain play event without a graph while the EQ is off', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.audioElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.dispatchEvent(new Event('play'))
    expect(FakeAudioContext.instances).toEqual([])
  })

  it('retries the blocked graph on the play gesture when only normalization is on', async () => {
    const engine = await import('./audio-engine')
    const audio = engine.audioElement()
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

class FakeMediaSession {
  metadata: unknown = null
  playbackState = ''
  positions: Array<{ duration: number; position: number; playbackRate: number }> = []
  handlers = new Map<string, ((details: { seekTime?: number }) => void) | null>()

  setPositionState(state: { duration: number; position: number; playbackRate: number }): void {
    if (!(state.duration > 0)) throw new RangeError('duration must be positive')
    if (state.position > state.duration) throw new RangeError('position past the end')
    this.positions.push(state)
  }

  setActionHandler(action: string, handler: ((details: { seekTime?: number }) => void) | null): void {
    this.handlers.set(action, handler)
  }
}

async function loadedEngineWithMediaSession() {
  const session = new FakeMediaSession()
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  const engine = await import('./audio-engine')
  return { engine, session }
}

describe('media session position state', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'mediaSession', { value: undefined, configurable: true })
  })

  it('publishes seconds measured against the element playback rate', async () => {
    const { engine, session } = await loadedEngineWithMediaSession()
    const audio = engine.audioElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.playbackRate = 1.5
    engine.updateMediaSessionPosition(90_500, 120_000)
    expect(session.positions).toEqual([{ duration: 120, position: 90.5, playbackRate: 1.5 }])
  })

  it('stays silent until a positive duration exists and clamps stale ticks to the end', async () => {
    const { engine, session } = await loadedEngineWithMediaSession()
    engine.updateMediaSessionPosition(1_000, 0)
    engine.updateMediaSessionPosition(Number.NaN, 120_000)
    expect(session.positions).toEqual([])
    engine.updateMediaSessionPosition(130_000, 120_000)
    expect(session.positions).toEqual([{ duration: 120, position: 120, playbackRate: 1 }])
  })

  it('routes the lock-screen seekto handler into millisecond seeks', async () => {
    const { engine, session } = await loadedEngineWithMediaSession()
    const seeks: number[] = []
    engine.bindMediaSessionActions({
      play: () => {}, pause: () => {}, next: () => {}, prev: () => {},
      seek: (ms) => { seeks.push(ms) },
    })
    const seekTo = session.handlers.get('seekto')
    if (!seekTo) throw new Error('the seekto handler should be bound')
    seekTo({ seekTime: 12.5 })
    seekTo({})
    expect(seeks).toEqual([12_500])
  })

  it('tolerates browsers without a media session at all', async () => {
    const engine = await import('./audio-engine')
    engine.updateMediaSessionPosition(1_000, 2_000)
    engine.bindMediaSessionActions({
      play: () => {}, pause: () => {}, next: () => {}, prev: () => {}, seek: () => {},
    })
  })
})
