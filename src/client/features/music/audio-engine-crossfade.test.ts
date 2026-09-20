import { describe, expect, it, vi } from 'vitest'
import {
  FakeAudioContext, fadeTrack, installMediaElementPlayback, normalizedEngine,
  recordingBridge, standbyAudio, useFakeAudioStack,
} from './audio-engine.test-helpers'

useFakeAudioStack()

async function crossfadeEngine() {
  const engine = await import('./audio-engine')
  installMediaElementPlayback()
  const { calls, bridge } = recordingBridge()
  engine.configureAudio(bridge)
  const outgoing = engine.mediaElement()
  if (!outgoing) throw new Error('jsdom should provide an Audio constructor')
  return { calls, engine, outgoing }
}

describe('crossfade volume ramp', () => {
  it('ramps the outgoing track down and the incoming one up', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    expect(engine.startCrossfade(fadeTrack('b'))).toBe(true)
    const incoming = standbyAudio(outgoing)
    expect(incoming.volume).toBe(0)
    vi.advanceTimersByTime(1_500)
    expect(outgoing.volume).toBeCloseTo(0.3, 6)
    expect(incoming.volume).toBeCloseTo(0.3, 6)
  })

  it('absorbs a volume drag made mid-fade', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(outgoing)
    vi.advanceTimersByTime(1_500)
    outgoing.volume = 1
    vi.advanceTimersByTime(50)
    expect(outgoing.volume).toBeCloseTo(29 / 60, 4)
    expect(incoming.volume).toBeCloseTo(31 / 60, 4)
  })

  it('keeps a muted user muted as the incoming element takes over', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(outgoing)
    outgoing.muted = true
    vi.advanceTimersByTime(50)
    expect(incoming.muted).toBe(true)
  })
})

describe('crossfade handover', () => {
  it('swaps the active element and adopts its duration and volume', async () => {
    const { calls, engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.5
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(outgoing)
    Object.defineProperty(incoming, 'duration', { value: 120, configurable: true })
    vi.advanceTimersByTime(3_000)
    expect(engine.mediaElement()).toBe(incoming)
    expect(engine.crossfadeActive()).toBe(false)
    expect(calls).toContainEqual(['complete', 'b'])
    expect(calls).toContainEqual(['duration', 120_000])
    // The old element's pause must stay silent: it would read as the new track pausing.
    expect(calls).not.toContainEqual(['playing', false])
    expect(incoming.volume).toBeCloseTo(0.5, 6)
    expect(outgoing.getAttribute('src')).toBeNull()
    vi.advanceTimersByTime(1_000)
    expect(incoming.volume).toBeCloseTo(0.5, 6)
  })

  it('refuses a second fade while one is running', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    expect(engine.startCrossfade(fadeTrack('b'))).toBe(true)
    expect(engine.startCrossfade(fadeTrack('c'))).toBe(false)
    expect(standbyAudio(outgoing)).toBeTruthy()
  })
})

describe('crossfade gating and cancellation', () => {
  it('keeps standby element events off the bridge', async () => {
    const { calls, engine, outgoing } = await crossfadeEngine()
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(outgoing)
    incoming.dispatchEvent(new Event('timeupdate'))
    incoming.dispatchEvent(new Event('play'))
    outgoing.dispatchEvent(new Event('ended'))
    expect(calls).toEqual([])
  })

  it('restores the outgoing volume and element when cancelled', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(outgoing)
    vi.advanceTimersByTime(1_000)
    engine.cancelCrossfade()
    expect(engine.mediaElement()).toBe(outgoing)
    expect(outgoing.volume).toBeCloseTo(0.6, 6)
    expect(incoming.getAttribute('src')).toBeNull()
    vi.advanceTimersByTime(5_000)
    expect(outgoing.volume).toBeCloseTo(0.6, 6)
    expect(engine.startCrossfade(fadeTrack('c'))).toBe(true)
  })
})

describe('crossfade yields to transport commands', () => {
  it('cancels the fade when playback is paused', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    engine.startCrossfade(fadeTrack('b'))
    vi.advanceTimersByTime(1_500)
    engine.pausePlayback()
    expect(engine.crossfadeActive()).toBe(false)
    expect(engine.mediaElement()).toBe(outgoing)
    expect(outgoing.volume).toBeCloseTo(0.6, 6)
  })

  it('cancels the fade when the incoming play promise rejects', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => Promise.reject(new Error('nope')))
    expect(engine.startCrossfade(fadeTrack('b'))).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.crossfadeActive()).toBe(false)
    expect(engine.mediaElement()).toBe(outgoing)
    expect(outgoing.volume).toBeCloseTo(0.6, 6)
  })

  it('cancels the fade when playback restarts or stops', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    outgoing.volume = 0.6
    engine.startCrossfade(fadeTrack('b'))
    vi.advanceTimersByTime(1_000)
    await engine.startPlayback(fadeTrack('c'))
    expect(engine.crossfadeActive()).toBe(false)
    expect(engine.mediaElement()).toBe(outgoing)
    expect(outgoing.volume).toBeCloseTo(0.6, 6)
    expect(engine.startCrossfade(fadeTrack('d'))).toBe(true)
    engine.stopPlayback()
    expect(engine.crossfadeActive()).toBe(false)
  })
})

describe('crossfade audio graph follows the swap', () => {
  it('builds a chain for the incoming element and retunes both afterwards', async () => {
    const { engine, outgoing } = await crossfadeEngine()
    engine.configureEqualizer({ enabled: true, lowDb: 3, midDb: 0, highDb: 0 })
    await engine.ensureAudioGraph()
    engine.startCrossfade(fadeTrack('b'))
    vi.advanceTimersByTime(3_000)
    const context = FakeAudioContext.instances[0]
    if (!context) throw new Error('the swap should have reused the one audio context')
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(context.biquads).toHaveLength(6)
    expect(context.biquads.map((node) => node.gain.value)).toEqual([3, 0, 0, 3, 0, 0])
    engine.configureEqualizer({ enabled: true, lowDb: 5, midDb: 0, highDb: 0 })
    expect(context.biquads.map((node) => node.gain.value)).toEqual([5, 0, 0, 5, 0, 0])
    expect(outgoing.getAttribute('src')).toBeNull()
  })

  it('freezes loudness corrections for the fade and resumes them on the new element', async () => {
    const { audio, context, engine, gain } = await normalizedEngine()
    installMediaElementPlayback()
    audio.volume = 0.6
    context.analysers[1]!.timeDomainByte = 138
    audio.dispatchEvent(new Event('play'))
    engine.startCrossfade(fadeTrack('b'))
    vi.advanceTimersByTime(2_000)
    expect(gain.gain.value).toBe(1)
    // A pause inside the fade stops the polling; the completed swap must restart it.
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(1_500)
    expect(gain.gain.value).toBe(1)
    const incomingGain = context.gains[1]
    const incomingTap = context.analysers[3]
    if (!incomingGain || !incomingTap) throw new Error('the swap should have built the incoming element chain')
    incomingTap.timeDomainByte = 138
    vi.advanceTimersByTime(500)
    expect(incomingGain.gain.value).toBeGreaterThan(1)
  })
})
