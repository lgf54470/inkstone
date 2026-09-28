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

// FB3-F2: the aggregate was one switch over five catalogues the reader could not see. Per catalogue
// they now decide both halves — on or off, and in what order they are asked — and that table is a
// preference like the rest, so it outlives the settings page that set it.
describe('per-catalogue table (FB3-F2)', () => {
  it('switches one catalogue off, and a scope that named it back to the aggregate', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerSourceEnabled: {}, providerScope: 'kuwo' })
    useMusic.getState().setProviderSourceEnabled('kuwo', false)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerSourceEnabled).toEqual({ kuwo: false })
    expect(useMusic.getState().providerScope).toBe('all')
    expect(storedPrefs()?.providerSourceEnabled).toEqual({ kuwo: false })
    expect(storedPrefs()?.providerScope).toBe('all')
  })

  it('moves a catalogue up the ask order and persists the order', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerSourceOrder: [] })
    useMusic.getState().moveProviderSource('migu', -1)
    vi.advanceTimersByTime(300)
    expect(useMusic.getState().providerSourceOrder).toEqual(['netease', 'migu', 'kuwo', 'qq', 'bilibili'])
    expect(storedPrefs()?.providerSourceOrder).toEqual(['netease', 'migu', 'kuwo', 'qq', 'bilibili'])
  })

  it('reads the stored table back and drops anything the proxy would refuse', () => {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify({
      providerSourceEnabled: { kuwo: false, spotify: false, qq: 'yes' },
      providerSourceOrder: ['qq', 'spotify', 'netease'],
    }))
    const prefs = loadPreferences()
    expect(prefs.providerSourceEnabled).toEqual({ kuwo: false })
    expect(prefs.providerSourceOrder).toEqual(['qq', 'netease'])
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
