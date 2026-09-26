import { describe, expect, it } from 'vitest'
import { musicStreamUrl } from '../../lib/api'
import { fadeTrack, installMediaElementPlayback, recordingBridge, standbyAudio, useFakeAudioStack } from './audio-engine.test-helpers'

useFakeAudioStack()

async function preloadEngine() {
  const engine = await import('./audio-engine')
  installMediaElementPlayback()
  const { bridge } = recordingBridge()
  engine.configureAudio(bridge)
  const active = engine.mediaElement()
  if (!active) throw new Error('jsdom should provide an Audio constructor')
  return { engine, active }
}

describe('next-track preload shelf (FEA-C1)', () => {
  it('parks the next track on a standby element without touching the playing one', async () => {
    const { engine, active } = await preloadEngine()
    engine.preloadNext(fadeTrack('b'))
    const standby = standbyAudio(active)
    expect(standby.preload).toBe('auto')
    expect(standby.src.endsWith(musicStreamUrl('b'))).toBe(true)
    expect(active.getAttribute('src')).toBeNull()
  })

  it('re-points the standby when the next track changes instead of stacking elements', async () => {
    const { engine, active } = await preloadEngine()
    engine.preloadNext(fadeTrack('b'))
    const standby = standbyAudio(active)
    engine.preloadNext(fadeTrack('c'))
    expect(standbyAudio(active)).toBe(standby)
    expect(standby.src.endsWith(musicStreamUrl('c'))).toBe(true)
  })

  it('leaves a running fade and its incoming element alone', async () => {
    const { engine, active } = await preloadEngine()
    engine.startCrossfade(fadeTrack('b'))
    const incoming = standbyAudio(active)
    engine.preloadNext(fadeTrack('c'))
    expect(standbyAudio(active)).toBe(incoming)
    expect(incoming.src.endsWith(musicStreamUrl('b'))).toBe(true)
  })

  it('skips video tracks — their stage handover never fades or preloads', async () => {
    const { engine, active } = await preloadEngine()
    engine.preloadNext({ ...fadeTrack('v'), mime: 'video/mp4' })
    expect(document.body.querySelectorAll('audio')).toHaveLength(1)
    expect(active.getAttribute('src')).toBeNull()
  })

  it('promotes a matching preload on startPlayback and copies the sound settings', async () => {
    const { engine, active } = await preloadEngine()
    active.volume = 0.5
    active.playbackRate = 1.5
    engine.preloadNext(fadeTrack('b'))
    const standby = standbyAudio(active)
    await engine.startPlayback(fadeTrack('b'))
    expect(engine.mediaElement()).toBe(standby)
    expect(standby.volume).toBeCloseTo(0.5, 6)
    expect(standby.playbackRate).toBeCloseTo(1.5, 6)
    expect(standby.src.endsWith(musicStreamUrl('b'))).toBe(true)
    expect(active.getAttribute('src')).toBeNull()
  })

  it('keeps the plain same-element path when nothing was preloaded', async () => {
    const { engine, active } = await preloadEngine()
    await engine.startPlayback(fadeTrack('c'))
    expect(engine.mediaElement()).toBe(active)
    expect(active.src.endsWith(musicStreamUrl('c'))).toBe(true)
  })

  it('starts a fade on the preloaded standby without reassigning its stream', async () => {
    const { engine, active } = await preloadEngine()
    engine.preloadNext(fadeTrack('b'))
    const standby = standbyAudio(active)
    const assignments: string[] = []
    Object.defineProperty(standby, 'src', {
      get: () => standby.getAttribute('src') ?? '',
      set: (value: string) => { assignments.push(value) },
      configurable: true,
    })
    expect(engine.startCrossfade(fadeTrack('b'))).toBe(true)
    expect(assignments).toEqual([])
    expect(engine.crossfadeActive()).toBe(true)
  })
})
