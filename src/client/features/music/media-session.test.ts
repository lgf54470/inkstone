import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindMediaSessionActions, publishMediaSession, updateMediaSessionPosition } from './media-session'

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

function installMediaSession(): FakeMediaSession {
  const session = new FakeMediaSession()
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  return session
}

describe('media session metadata', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'mediaSession', { value: undefined, configurable: true })
    vi.unstubAllGlobals()
  })

  it('carries the track and the transport state to the lock screen', () => {
    vi.stubGlobal('MediaMetadata', class {
      constructor(init: Record<string, unknown>) {
        Object.assign(this, init)
      }
    })
    const session = installMediaSession()
    publishMediaSession(
      { title: 'River', artist: 'Ada', album: 'Silt', coverUrl: 'https://x/cover.png' },
      true,
    )
    expect(session.metadata).toEqual({
      album: 'Silt', artist: 'Ada', artwork: [{ src: 'https://x/cover.png' }], title: 'River',
    })
    expect(session.playbackState).toBe('playing')
    publishMediaSession(null, false)
    expect(session.metadata).toBeNull()
    expect(session.playbackState).toBe('paused')
  })

  it('keeps publishing the transport state when the browser has no MediaMetadata', () => {
    const session = installMediaSession()
    publishMediaSession({ title: 'River', artist: '', album: '', coverUrl: null }, true)
    expect(session.playbackState).toBe('playing')
  })
})

describe('media session position state', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'mediaSession', { value: undefined, configurable: true })
  })

  it('publishes seconds together with the caller-supplied playback rate', () => {
    const session = installMediaSession()
    updateMediaSessionPosition(90_500, 120_000, 1.5)
    expect(session.positions).toEqual([{ duration: 120, position: 90.5, playbackRate: 1.5 }])
  })

  it('stays silent until a positive duration exists and clamps stale ticks to the end', () => {
    const session = installMediaSession()
    updateMediaSessionPosition(1_000, 0, 1)
    updateMediaSessionPosition(Number.NaN, 120_000, 1)
    expect(session.positions).toEqual([])
    updateMediaSessionPosition(130_000, 120_000, 1)
    expect(session.positions).toEqual([{ duration: 120, position: 120, playbackRate: 1 }])
  })

  it('routes the lock-screen seekto handler into millisecond seeks', () => {
    const session = installMediaSession()
    const seeks: number[] = []
    bindMediaSessionActions({
      play: () => {}, pause: () => {}, next: () => {}, prev: () => {},
      seek: (ms) => { seeks.push(ms) },
    })
    const seekTo = session.handlers.get('seekto')
    if (!seekTo) throw new Error('the seekto handler should be bound')
    seekTo({ seekTime: 12.5 })
    seekTo({})
    expect(seeks).toEqual([12_500])
  })

  it('tolerates browsers without a media session at all', () => {
    updateMediaSessionPosition(1_000, 2_000, 1)
    bindMediaSessionActions({
      play: () => {}, pause: () => {}, next: () => {}, prev: () => {}, seek: () => {},
    })
    publishMediaSession(null, false)
  })
})
