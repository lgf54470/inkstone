import { afterEach, beforeEach, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import type { AudioBridge } from './audio-engine'

export interface FakeAnalyser {
  label: string
  fftSize: number
  smoothingTimeConstant: number
  frequencyBinCount: number
  timeDomainByte: number
  getByteTimeDomainData: (bytes: Uint8Array) => void
  connect: (target: { label: string }) => void
}

export interface FakeGain {
  label: string
  gain: { value: number }
  connect: (target: { label: string }) => void
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  suspendCalls = 0
  resumeCalls = 0
  destination = { label: 'destination' }
  connections: Array<[string, string]> = []
  biquads: Array<{ type: string; frequency: { value: number }; Q: { value: number }; gain: { value: number } }> = []
  analysers: FakeAnalyser[] = []
  gains: FakeGain[] = []
  private biquadCount = 0
  private analyserCount = 0

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createAnalyser() {
    // Each element chain builds its visualiser analyser first and its loudness tap
    // second, so the tap is distinguishable by position and by its larger fftSize.
    const index = this.analyserCount++
    const node: FakeAnalyser = {
      label: index % 2 === 0 ? 'analyser' : 'loudness-tap',
      fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 64, timeDomainByte: 128,
      getByteTimeDomainData: (bytes) => { bytes.fill(node.timeDomainByte) },
      connect: (target) => { this.connections.push([node.label, target.label]) },
    }
    this.analysers.push(node)
    return node
  }

  createGain() {
    const node: FakeGain = {
      label: 'norm', gain: { value: 1 },
      connect: (target) => { this.connections.push([node.label, target.label]) },
    }
    this.gains.push(node)
    return node
  }

  createBiquadFilter() {
    const node: {
      label: string
      type: string
      frequency: { value: number }
      Q: { value: number }
      gain: { value: number }
      connect: (target: { label: string }) => void
    } = {
      label: '', type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 },
      connect: (target) => { this.connections.push([node.label, target.label]) },
    }
    node.label = `filter${this.biquadCount++}`
    this.biquads.push(node)
    return node
  }

  createMediaElementSource() {
    return { label: 'source', connect: (target: { label: string }) => { this.connections.push(['source', target.label]) } }
  }

  suspend() {
    this.suspendCalls += 1
    this.state = 'suspended'
    return Promise.resolve()
  }

  resume() {
    this.resumeCalls += 1
    this.state = 'running'
    return Promise.resolve()
  }
}

// The engine binds its element at import time, so tests get a pristine module and a
// pristine body per case; leftovers from the previous test would confuse element lookups.
export function useFakeAudioStack(): void {
  beforeEach(() => {
    FakeAudioContext.instances = []
    document.body.innerHTML = ''
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
}

export async function loadedEngine() {
  const engine = await import('./audio-engine')
  const analyser = await engine.ensureAudioGraph()
  const context = FakeAudioContext.instances[0]
  const audio = engine.audioElement()
  if (!analyser || !context || !audio) throw new Error('the fake browser stack should have built an analyser graph')
  return { engine, context, audio }
}

export async function normalizedEngine() {
  const engine = await import('./audio-engine')
  engine.configureLoudnessNormalization(true)
  const analyser = await engine.ensureAudioGraph()
  const context = FakeAudioContext.instances[0]
  const audio = engine.audioElement()
  const tap = context?.analysers[1]
  const gain = context?.gains[0]
  if (!analyser || !context || !audio || !tap || !gain) throw new Error('the fake browser stack should have built a normalization graph')
  return { engine, context, audio, tap, gain }
}

export function recordingBridge(): { calls: Array<[string, unknown]>; bridge: AudioBridge } {
  const calls: Array<[string, unknown]> = []
  const bridge: AudioBridge = {
    onTime: (ms) => { calls.push(['time', ms]) },
    onDuration: (ms) => { calls.push(['duration', ms]) },
    onEnded: () => { calls.push(['ended', null]) },
    onPlayingChange: (playing) => { calls.push(['playing', playing]) },
    onBuffering: (buffering) => { calls.push(['buffering', buffering]) },
    onError: (code) => { calls.push(['error', code]) },
    onCrossfadeComplete: (trackId) => { calls.push(['complete', trackId]) },
  }
  return { calls, bridge }
}

export function fadeTrack(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 4_000, isPinned: false } as MusicTrack
}

export function installMediaElementPlayback(): void {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  // Pause has to behave like the browser's: it fires the event the listeners gate on.
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
}

export function standbyAudio(active: HTMLAudioElement): HTMLAudioElement {
  const standby = Array.from(document.body.querySelectorAll('audio')).find((node) => node !== active)
  if (!standby) throw new Error('the crossfade should have created a standby audio element')
  return standby as HTMLAudioElement
}
