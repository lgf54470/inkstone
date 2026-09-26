import { afterEach, describe, expect, it, vi } from 'vitest'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        providerSearch: vi.fn(async (_source: string, keywords: string) => ({
          results: [{ provider: 'gds', source: 'netease', sourceId: 'a1', title: keywords, artist: 'Ann', album: '', durationMs: null }],
        })),
        importProviderTrack: vi.fn(async () => ({ id: 'trk-1', title: 'Song A', source: 'provider' })),
      },
    },
  }
})
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'

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

describe('provider search flow (FEA-A1-3)', () => {
  afterEach(() => {
    useMusic.setState({ providerResults: null, providerSearching: false, providerKeywords: '' })
    vi.clearAllMocks()
  })

  it('searches when the provider is on and keeps the hits', async () => {
    useMusic.setState({ providerEnabled: { gds: true }, tracks: [] })
    await useMusic.getState().searchProviders('song a')
    expect(useMusic.getState().providerResults).toHaveLength(1)
    expect(useMusic.getState().providerKeywords).toBe('song a')
  })

  it('clears the results when the provider is off or the query is empty', async () => {
    useMusic.setState({ providerEnabled: {}, providerResults: [{ provider: 'gds', source: 'netease', sourceId: 'a1', title: 'X', artist: '', album: '', durationMs: null }] })
    await useMusic.getState().searchProviders('song')
    expect(useMusic.getState().providerResults).toBeNull()
    await useMusic.getState().searchProviders('  ')
    expect(useMusic.getState().providerResults).toBeNull()
  })

  it('plays a hit by registering the idempotent row and appending the track', async () => {
    useMusic.setState({ tracks: [] })
    await useMusic.getState().playProviderTrack({ provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: '', durationMs: null })
    expect(api.music.importProviderTrack).toHaveBeenCalled()
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
  })
})
