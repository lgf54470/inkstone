import { afterEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_PREFS_KEY, loadPreferences } from './state'
import { useMusic } from './index'

function storedPrefs(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

// FB-F7: the worker has always accepted five quality tiers; the client never sent one, so
// every play was hard-coded to 320. The preference is the missing half of that contract.
describe('online quality (FB-F7)', () => {
  it('ships 320 and persists a chosen tier', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerQuality: 320 })
    expect(useMusic.getState().providerQuality).toBe(320)
    useMusic.getState().setProviderQuality(740)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerQuality).toBe(740)
    expect(storedPrefs()?.providerQuality).toBe(740)
  })
})

// FB3-F1: the search scope is a preference like the tier beside it — it decides how much one query
// costs, so it outlives the panel that set it and is read back where the fan-out happens.
describe('online search scope (FB3-F1)', () => {
  it('ships the aggregate scope and persists a single catalogue', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerScope: 'all' })
    useMusic.getState().setProviderScope('migu')
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerScope).toBe('migu')
    expect(storedPrefs()?.providerScope).toBe('migu')
  })

  it('keeps a stored catalogue and reads anything else as the aggregate scope', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ providerScope: 'bilibili' }))
    expect(loadPreferences().providerScope).toBe('bilibili')
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({ providerScope: 'spotify' }))
    expect(loadPreferences().providerScope).toBe('all')
  })
})

// FB-S6: the opt-in is a decision with consequences, so it is stated once and on purpose.
describe('online source notice (FB-S6)', () => {
  it('ships unacknowledged and records the acknowledgement', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerNoticeAccepted: false })
    useMusic.getState().acceptProviderNotice()
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerNoticeAccepted).toBe(true)
    expect(storedPrefs()?.providerNoticeAccepted).toBe(true)
  })
})

describe('source badge preference', () => {
  it('toggles and persists', () => {
    vi.useFakeTimers()
    useMusic.setState({ showSourceBadge: true })
    useMusic.getState().setShowSourceBadge(false)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().showSourceBadge).toBe(false)
    expect(storedPrefs()?.showSourceBadge).toBe(false)
  })
})

// Junk in localStorage is a shape the reader has to survive: a tier the worker would reject
// must never leave the client, and an unreadable boolean is a "no", not a "yes".
describe('reading the new preferences back', () => {
  it('keeps the stored values', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      providerQuality: 999,
      providerNoticeAccepted: true,
      showSourceBadge: false,
    }))
    const prefs = loadPreferences()
    expect(prefs.providerQuality).toBe(999)
    expect(prefs.providerNoticeAccepted).toBe(true)
    expect(prefs.showSourceBadge).toBe(false)
  })

  it('falls back to the defaults for junk', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      providerQuality: 256,
      providerNoticeAccepted: 'yes',
      showSourceBadge: 1,
    }))
    const prefs = loadPreferences()
    expect(prefs.providerQuality).toBe(320)
    expect(prefs.providerNoticeAccepted).toBe(false)
    expect(prefs.showSourceBadge).toBe(true)
  })
})
