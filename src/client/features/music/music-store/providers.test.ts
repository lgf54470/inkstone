import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { MUSIC_PREFS_KEY } from './state'
import { useMusic } from './index'
import { PROVIDER_SEARCH_MEMO_MS, clearProviderSearchCache, swapFailedProviderTrack } from './providers'

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

import { api } from '../../../lib/api'

function storedPrefs(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(MUSIC_PREFS_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

beforeEach(() => {
  clearProviderSearchCache()
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
    useMusic.setState({ providerResults: null, providerSearching: false, providerKeywords: '', providerScope: 'all' })
    vi.clearAllMocks()
  })

  it('searches when the provider is on and keeps the hits', async () => {
    useMusic.setState({ providerEnabled: { gds: true }, tracks: [] })
    await useMusic.getState().searchProviders('song a')
    expect(useMusic.getState().providerResults).toHaveLength(1)
    expect(useMusic.getState().providerKeywords).toBe('song a')
  })

  // FB3-F1: the scope is what the fan-out reads, so a scope naming one catalogue costs one request
  // and the reader is not paying five slots of the proxy's budget for an answer they did not want.
  it('asks only the catalogues the chosen scope names', async () => {
    useMusic.setState({ providerEnabled: { gds: true }, providerScope: 'migu', tracks: [] })
    await useMusic.getState().searchProviders('song a')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(1)
    expect(api.music.providerSearch).toHaveBeenCalledWith('migu', 'song a')
    expect(useMusic.getState().providerResults).toHaveLength(1)
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

// FB2-F1: adding is where a hit becomes a row. The request carries the ids the search handed out
// and nothing larger — the artwork and the words are the worker's to resolve, because sending them
// from here is exactly what used to fail: the body's ceiling is 8 KiB and a cover's base64 alone is
// several times that, so every add of a hit with artwork was refused before it was ever read.
// FB3-P1: one query was five upstream requests and five slots of the proxy's budget, and a reader who
// types a word, changes their mind and comes back pays for it twice. The memo is per (scope, keywords)
// and lives only in this session: an answer to the same question is the same answer, so asking again
// costs nothing — until the reader asks on purpose (the retry after a failure) or leaves the state the
// answer was made under (the catalogue switched off).
describe('provider search memo (FB3-P1)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useMusic.setState({
      providerEnabled: { gds: true }, providerScope: 'all', tracks: [],
      providerResults: null, providerKeywords: '', providerSearching: false, providerFailedSources: [],
    })
    vi.clearAllMocks()
  })

  it('answers a repeated query from the session instead of asking five catalogues again', async () => {
    await useMusic.getState().searchProviders('echo')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(5)
    // The query is left behind and typed again, which is the reader's actual cost today.
    await useMusic.getState().searchProviders('echoo')
    await useMusic.getState().searchProviders('echo')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(10)
    expect(useMusic.getState().providerResults).toHaveLength(1)
    expect(useMusic.getState().providerKeywords).toBe('echo')
  })

  it('asks again when the same words are asked of a different catalogue', async () => {
    await useMusic.getState().searchProviders('echo')
    useMusic.setState({ providerScope: 'migu' })
    await useMusic.getState().searchProviders('echo')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(6)
    expect(api.music.providerSearch).toHaveBeenLastCalledWith('migu', 'echo')
  })

  it('forgets the answer once the session has held it long enough', async () => {
    await useMusic.getState().searchProviders('echo')
    vi.advanceTimersByTime(PROVIDER_SEARCH_MEMO_MS + 1)
    await useMusic.getState().searchProviders('echo')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(10)
  })

  it('asks again when the reader asks on purpose', async () => {
    await useMusic.getState().searchProviders('echo')
    await useMusic.getState().searchProviders('echo', { force: true })
    expect(api.music.providerSearch).toHaveBeenCalledTimes(10)
  })

  it('drops what it remembered when the catalogue is switched off', async () => {
    await useMusic.getState().searchProviders('echo')
    useMusic.getState().setProviderEnabled('gds', false)
    useMusic.getState().setProviderEnabled('gds', true)
    await useMusic.getState().searchProviders('echo')
    expect(api.music.providerSearch).toHaveBeenCalledTimes(10)
  })
})

describe('provider add flow (FB2-F1)', () => {
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

  it('registers the row with the catalogue ids instead of the artwork and the words', async () => {
    useMusic.setState({ tracks: [] })
    await useMusic.getState().playProviderTrack({
      provider: 'gds', source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: 'Album One', durationMs: 210_000,
      coverId: 'p1', lyricId: 'l1',
    })
    expect(api.music.importProviderTrack).toHaveBeenCalledWith(expect.objectContaining({
      source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann', album: 'Album One', durationMs: 210_000,
      coverId: 'p1', lyricId: 'l1',
    }))
    const sent = vi.mocked(api.music.importProviderTrack).mock.calls[0]?.[0] ?? {}
    expect(sent).not.toHaveProperty('coverDataUrl')
    expect(sent).not.toHaveProperty('lyric')
    // Nothing is fetched from here any more, so there is no second request left to fail.
    expect(api.music.providerLyric).not.toHaveBeenCalled()
  })

  // A hit the catalogue knows nothing more about is still a song: the row is written from what the
  // search knew and the ids stay absent rather than becoming empty strings.
  it('adds a hit that carries no catalogue ids', async () => {
    useMusic.setState({ tracks: [] })
    await useMusic.getState().addProviderTrack({
      provider: 'gds', source: 'netease', sourceId: 'a9', title: 'Song A', artist: '', album: '', durationMs: null,
      coverId: null, lyricId: null,
    })
    expect(useMusic.getState().tracks.map((track) => track.id)).toContain('trk-1')
    expect(vi.mocked(api.music.importProviderTrack).mock.calls[0]?.[0]).toMatchObject({ coverId: undefined, lyricId: undefined })
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
    // FB2-F4: the repair writes the same row shape as a manual add. Without the ids the re-served
    // row comes back coverless and wordless even though the catalogue knows both.
    expect(api.music.importProviderTrack).toHaveBeenCalledWith(expect.objectContaining({
      source: 'netease', sourceId: 'a1', coverId: 'p1', lyricId: 'l1',
    }))
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
