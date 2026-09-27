import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'
import { swapFailedProviderTrack } from './providers'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        providerSearch: vi.fn(async (_source: string, keywords: string) => ({
          results: [{ provider: 'gds', source: 'netease', sourceId: 'a1', title: keywords, artist: 'Ann', album: '', durationMs: null, coverId: 'p1', lyricId: 'l1' }],
        })),
        providerLyric: vi.fn(async () => ({ lyric: '[00:01.000]la la' })),
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
// The cover lookup fetches image bytes and re-encodes them; the store only has to pass what it
// gets back, so the encoder is stubbed here and covered by its own test elsewhere.
vi.mock('../music-provider-artwork', () => ({
  providerCoverDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
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

  // FB-F6: the panel separates "no match" from "nothing answered", so the source that
  // threw has to survive the merge as a named failure rather than vanish into an empty page.
  it('records the catalogues that did not answer', async () => {
    vi.mocked(api.music.providerSearch).mockImplementationOnce(async () => {
      throw new Error('source down')
    })
    useMusic.setState({ providerEnabled: { gds: true }, tracks: [], providerFailedSources: [] })
    await useMusic.getState().searchProviders('song a')
    expect(useMusic.getState().providerFailedSources).toEqual(['netease'])
    expect(useMusic.getState().providerResults).toHaveLength(1)
  })

  it('clears the named failures along with the results when the provider is turned off', async () => {
    useMusic.setState({ providerEnabled: {}, providerFailedSources: ['netease'] })
    await useMusic.getState().searchProviders('song a')
    expect(useMusic.getState().providerFailedSources).toEqual([])
  })

  it('clears the results when the provider is off or the query is empty', async () => {
    useMusic.setState({ providerEnabled: {}, providerResults: [{ provider: 'gds', source: 'netease', sourceId: 'a1', title: 'X', artist: '', album: '', durationMs: null, coverId: null, lyricId: null }] })
    await useMusic.getState().searchProviders('song')
    expect(useMusic.getState().providerResults).toBeNull()
    await useMusic.getState().searchProviders('  ')
    expect(useMusic.getState().providerResults).toBeNull()
  })

})

// FB-F5: adding is where a hit becomes a row, and the artwork and words the search handed out
// have to be resolved here — after the row exists there is nothing left to ask the catalogue.
describe('provider add flow (FB-F5)', () => {
  afterEach(() => {
    useMusic.setState({ tracks: [] })
    vi.clearAllMocks()
  })

  it('plays a hit by registering the idempotent row and appending the track', async () => {
    useMusic.setState({ tracks: [] })
    await useMusic.getState().playProviderTrack({ provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: '', durationMs: null, coverId: null, lyricId: null })
    expect(api.music.importProviderTrack).toHaveBeenCalled()
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
  })

  // FB-F5: adding an online hit is the only moment the ids the search handed out are still in
  // hand — after the row is written there is nothing left to ask, so the artwork and the words
  // are resolved here and stored with it.
  it('resolves the cover and the lyric before registering the row', async () => {
    useMusic.setState({ tracks: [] })
    await useMusic.getState().playProviderTrack({
      provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: '', durationMs: null,
      coverId: 'p1', lyricId: 'l1',
    })
    expect(api.music.providerLyric).toHaveBeenCalledWith('netease', 'l1')
    expect(api.music.importProviderTrack).toHaveBeenCalledWith(expect.objectContaining({
      lyric: '[00:01.000]la la',
      coverDataUrl: 'data:image/jpeg;base64,AAAA',
    }))
  })

  // Best effort by design: a catalogue that will not answer about artwork must not stop the
  // song from being added.
  it('still adds the row when the artwork or lyric lookup fails', async () => {
    vi.mocked(api.music.providerLyric).mockRejectedValueOnce(new Error('no lyric'))
    useMusic.setState({ tracks: [] })
    await useMusic.getState().playProviderTrack({
      provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: '', durationMs: null,
      coverId: 'p1', lyricId: 'l1',
    })
    expect(api.music.importProviderTrack).toHaveBeenCalledWith(expect.objectContaining({ lyric: undefined }))
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
  })
})

// FB-F10: taking a hit into the library and auditioning it are two intents. The audition hands the
// song to the player (the old behaviour, unchanged); the add stops at the library, and a batch walks
// the hits one at a time so one dead catalogue cannot take the whole selection with it.
describe('provider library add (FB-F10)', () => {
  const hit = (sourceId: string, title = `Song ${sourceId}`) => ({
    provider: 'gds', source: 'netease', sourceId, title, artist: 'Ann', album: '', durationMs: null, coverId: null, lyricId: null,
  })

  afterEach(() => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
    vi.clearAllMocks()
  })

  it('adds a hit to the library without touching the queue', async () => {
    useMusic.setState({ tracks: [], queue: [] })
    await useMusic.getState().addProviderTrack(hit('a1'))
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
    expect(useMusic.getState().queue).toEqual([])
  })

  it('adds a batch one by one and counts what landed', async () => {
    vi.mocked(api.music.importProviderTrack).mockResolvedValueOnce({ id: 'trk-1' } as never).mockResolvedValueOnce({ id: 'trk-2' } as never)
    useMusic.setState({ tracks: [] })
    const result = await useMusic.getState().addProviderTracks([hit('a1'), hit('a2')])
    expect(result).toEqual({ added: 2, failed: 0 })
    expect(useMusic.getState().tracks.map((track) => track.id)).toEqual(['trk-1', 'trk-2'])
  })

  it('keeps going when one hit in the batch fails, and says how many landed', async () => {
    vi.mocked(api.music.importProviderTrack)
      .mockResolvedValueOnce({ id: 'trk-1' } as never)
      .mockRejectedValueOnce(new Error('no such song'))
      .mockResolvedValueOnce({ id: 'trk-3' } as never)
    useMusic.setState({ tracks: [] })
    const result = await useMusic.getState().addProviderTracks([hit('a1'), hit('a2'), hit('a3')])
    expect(result).toEqual({ added: 2, failed: 1 })
    expect(useMusic.getState().tracks.map((track) => track.id)).toEqual(['trk-1', 'trk-3'])
  })
})

describe('provider failure fallback (FEA-A1-4)', () => {
  const deadTrack = { id: 'trk-dead', title: 'Song A', artist: 'Ann', album: '', durationMs: 1000, source: 'provider' } as MusicTrack

  afterEach(() => {
    useMusic.setState({ providerResults: null, providerSearching: false, providerKeywords: '', queue: [], currentIndex: 0, tracks: [] })
    vi.clearAllMocks()
  })

  it('swaps a failed provider track onto the best matching hit', async () => {
    useMusic.setState({ tracks: [deadTrack], queue: ['trk-dead'], currentIndex: 0, providerEnabled: { gds: true } })
    const swapped = await swapFailedProviderTrack(useMusic.setState, useMusic.getState, 'trk-dead')
    expect(swapped).toBe(true)
    expect(useMusic.getState().queue).toEqual(['trk-1'])
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
    expect(api.music.importProviderTrack).toHaveBeenCalledWith(expect.objectContaining({ source: 'netease', sourceId: 'a1' }))
  })

  it('skips a hit that resolves back to the failed row itself and reports no swap when nothing else fits', async () => {
    useMusic.setState({ tracks: [deadTrack], queue: ['trk-dead'], currentIndex: 0, providerEnabled: { gds: true } })
    vi.mocked(api.music.importProviderTrack).mockResolvedValue({ id: 'trk-dead', title: 'Song A', source: 'provider' } as MusicTrack)
    const swapped = await swapFailedProviderTrack(useMusic.setState, useMusic.getState, 'trk-dead')
    expect(swapped).toBe(false)
    expect(useMusic.getState().queue).toEqual(['trk-dead'])
  })

  it('does not search at all when the provider switch is off', async () => {
    useMusic.setState({ tracks: [deadTrack], queue: ['trk-dead'], currentIndex: 0, providerEnabled: {} })
    const swapped = await swapFailedProviderTrack(useMusic.setState, useMusic.getState, 'trk-dead')
    expect(swapped).toBe(false)
    expect(api.music.providerSearch).not.toHaveBeenCalled()
  })

  it('leaves non-provider tracks alone', async () => {
    useMusic.setState({ tracks: [{ ...deadTrack, source: 'r2' }], queue: ['trk-dead'], currentIndex: 0, providerEnabled: { gds: true } })
    const swapped = await swapFailedProviderTrack(useMusic.setState, useMusic.getState, 'trk-dead')
    expect(swapped).toBe(false)
    expect(api.music.providerSearch).not.toHaveBeenCalled()
  })
})
