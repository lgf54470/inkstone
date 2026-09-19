import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  togglePlay: vi.fn().mockResolvedValue(undefined),
  playNext: vi.fn().mockResolvedValue(undefined),
  playPrevious: vi.fn().mockResolvedValue(undefined),
  seek: vi.fn(),
  queue: [] as (string | null)[],
  currentIndex: -1,
  durationMs: 0,
  progressMs: 0,
}))

vi.mock('./music-store', () => ({
  useMusic: {
    getState: () => ({
      togglePlay: state.togglePlay,
      playNext: state.playNext,
      playPrevious: state.playPrevious,
      seek: state.seek,
      queue: state.queue,
      currentIndex: state.currentIndex,
      durationMs: state.durationMs,
    }),
  },
  progressTimeMs: () => state.progressMs,
}))

import { MUSIC_HOTKEYS } from './music-hotkeys'
import { registerAll } from '../../lib/hotkeys'

let dispose: () => void

beforeEach(() => {
  vi.clearAllMocks()
  state.queue = ['t1']
  state.currentIndex = 0
  state.durationMs = 60_000
  state.progressMs = 30_000
  dispose = registerAll(MUSIC_HOTKEYS)
})

afterEach(() => {
  dispose()
})

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('music playback hotkeys (FEAT-8)', () => {
  it('toggles playback on space when a track is loaded and focus sits on plain ground', () => {
    const event = press(document.body, { key: ' ' })
    expect(state.togglePlay).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves space alone while nothing has been loaded', () => {
    state.queue = []
    state.currentIndex = -1
    const event = press(document.body, { key: ' ' })
    expect(state.togglePlay).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves space alone on interactive targets so buttons keep keyboard activation', () => {
    const button = document.createElement('button')
    document.body.append(button)
    const event = press(button, { key: ' ' })
    button.remove()
    expect(state.togglePlay).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('switches tracks with the modded arrows', () => {
    expect(press(document.body, { key: 'ArrowRight', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(state.playNext).toHaveBeenCalledTimes(1)
    expect(press(document.body, { key: 'ArrowLeft', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(state.playPrevious).toHaveBeenCalledTimes(1)
  })

  it('seeks ten seconds with the alted arrows, clamped inside the track', () => {
    press(document.body, { key: 'ArrowLeft', altKey: true })
    expect(state.seek).toHaveBeenLastCalledWith(20_000)
    state.progressMs = 2_000
    press(document.body, { key: 'ArrowLeft', altKey: true })
    expect(state.seek).toHaveBeenLastCalledWith(0)
    state.progressMs = 55_000
    press(document.body, { key: 'ArrowRight', altKey: true })
    expect(state.seek).toHaveBeenLastCalledWith(60_000)
  })
})
