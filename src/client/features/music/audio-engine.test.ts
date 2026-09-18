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
