import { afterEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'

function storedPrefs(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('provider switch (FEA-A1-1)', () => {
  it('toggles a provider on and persists the map', () => {
    vi.useFakeTimers()
    useMusic.getState().setProviderEnabled('gds', true)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerEnabled).toEqual({ gds: true })
    expect((storedPrefs()?.providerEnabled as Record<string, boolean>)?.gds).toBe(true)
  })

  it('keeps the other entries when a provider is switched off again', () => {
    vi.useFakeTimers()
    useMusic.getState().setProviderEnabled('gds', true)
    useMusic.getState().setProviderEnabled('gds', false)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerEnabled).toEqual({ gds: false })
  })
})
