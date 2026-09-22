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

/**
 * The three surfaces that document Space as a gesture of their own, by the markup that says so: the
 * slides editor (Space arms its pan), the show it opens (Space advances a slide) and the template
 * library (Space toggles the card the cursor is on).
 */
const SPACE_OWNING_MARKUP = [
  '<div class="bento-slides-fullscreen"></div>',
  '<div class="bento-slides-presenter"></div>',
  '<div data-surface="templates"></div>',
]

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

})

/**
 * Space is a shared key rather than the player's own: it activates whatever the keyboard is on, and
 * three surfaces use it as a gesture of their own. The player keeps it on plain ground only, which is
 * what these read — each case fails if the claim is widened back to everything else.
 */
describe('music playback hotkeys — the space it shares (FEAT-8)', () => {
  it('leaves space alone on a control that keeps the button contract by hand', () => {
    const pill = document.createElement('span')
    pill.setAttribute('role', 'button')
    pill.tabIndex = 0
    document.body.append(pill)
    const event = press(pill, { key: ' ' })
    pill.remove()
    expect(state.togglePlay).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves space to the surfaces that document it as one of their own gestures', () => {
    // Each of these owns Space itself (the slides editor's pan, the show's next slide, the template
    // library's select toggle) and each listens on `window` or on its own subtree, which this handler
    // — bound on `window` in the capture phase — would otherwise reach first. The key goes to the
    // body, the way an unfocused overlay receives it, so the surface is on screen rather than around
    // the target.
    for (const markup of SPACE_OWNING_MARKUP) {
      const host = document.createElement('div')
      host.innerHTML = markup
      document.body.append(host)
      const event = press(document.body, { key: ' ' })
      expect(event.defaultPrevented, markup).toBe(false)
      host.remove()
    }
    expect(state.togglePlay).not.toHaveBeenCalled()
    // …and the key is still the player's on plain ground, which is what the shortcut is for.
    expect(press(document.body, { key: ' ' }).defaultPrevented).toBe(true)
    expect(state.togglePlay).toHaveBeenCalledTimes(1)
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
