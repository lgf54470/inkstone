import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  suspendCalls = 0
  resumeCalls = 0
  destination = {}

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createAnalyser() {
    return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 64, connect: () => {} }
  }

  createMediaElementSource() {
    return { connect: () => {} }
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

beforeEach(() => {
  FakeAudioContext.instances = []
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function loadedEngine() {
  const engine = await import('./audio-engine')
  const analyser = await engine.ensureAudioAnalyser()
  const context = FakeAudioContext.instances[0]
  const audio = engine.audioElement()
  if (!analyser || !context || !audio) throw new Error('the fake browser stack should have built an analyser graph')
  return { engine, context, audio }
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
    const audio = engine.audioElement()
    if (!audio) throw new Error('jsdom should provide an Audio constructor')
    audio.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(10_000)
    expect(FakeAudioContext.instances).toEqual([])
  })
})
