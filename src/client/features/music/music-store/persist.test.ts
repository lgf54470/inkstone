import { afterEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'

function storedPrefs(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

function prefsWrites(setItem: { mock: { calls: unknown[][] } }): unknown[][] {
  return setItem.mock.calls.filter((call) => call[0] === MUSIC_PREFS_KEY)
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('preference persistence', () => {
  it('coalesces a burst of preference changes into one debounced write', () => {
    vi.useFakeTimers()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    useMusic.getState().setVolume(0.3)
    useMusic.getState().setVolume(0.4)
    useMusic.getState().setVolume(0.5)
    expect(prefsWrites(setItem)).toHaveLength(0)
    vi.advanceTimersByTime(249)
    expect(prefsWrites(setItem)).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(prefsWrites(setItem)).toHaveLength(1)
    expect(storedPrefs()?.volume).toBe(0.5)
    setItem.mockRestore()
  })

  it('writes a pending change when the page goes away, and not again after', () => {
    vi.useFakeTimers()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    useMusic.getState().setVolume(0.25)
    window.dispatchEvent(new Event('pagehide'))
    expect(prefsWrites(setItem)).toHaveLength(1)
    expect(storedPrefs()?.volume).toBe(0.25)
    vi.advanceTimersByTime(500)
    expect(prefsWrites(setItem)).toHaveLength(1)
    setItem.mockRestore()
  })
})
