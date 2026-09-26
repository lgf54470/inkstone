import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { commitQuery } from './library-load'
import { visibleTracks } from './library-load'
import type { MusicStoreState } from './types'

const searchLyrics = vi.fn<(query: string) => Promise<{ ids: string[]; total: number }>>()

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      searchLyrics: (query: string) => searchLyrics(query),
    },
  },
}))

function track(id: string, title = id): MusicTrack {
  return {
    id, title, artist: '', album: '', durationMs: 1000, source: 'r2', format: 'mp3', webdavPath: null,
    mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 1, updatedAt: 1,
  }
}

function makeStore(overrides: Partial<MusicStoreState> = {}) {
  let state = {
    tracks: [] as MusicTrack[],
    playlists: [],
    tags: [],
    scope: { kind: 'all' } as MusicStoreState['scope'],
    sourceFilter: 'all',
    query: '',
    romanized: {},
    searchHistory: [],
    remoteLyricMatches: null,
    prepareRomanization: vi.fn(async () => {}),
    ...overrides,
  } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function'
        ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
        : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

beforeEach(() => {
  searchLyrics.mockReset()
})

describe('the library-wide lyric search (IMP-1)', () => {
  it('fetches lyric matches on commit and lists them after every name match', async () => {
    const store = makeStore({
      tracks: [track('name-hit', 'Long River'), track('lyric-hit', 'Something Else')],
    })
    searchLyrics.mockResolvedValue({ ids: ['lyric-hit'], total: 1 })
    commitQuery(store.set, store.get, 'long river')
    await vi.waitFor(() => expect(store.state().remoteLyricMatches).not.toBeNull())
    expect(searchLyrics).toHaveBeenCalledWith('long river')
    const ids = visibleTracks(store.state()).map((entry) => entry.id)
    expect(ids).toEqual(['name-hit', 'lyric-hit'])
  })

  it('drops an answer whose query is no longer the committed one', async () => {
    const store = makeStore({ tracks: [track('a')] })
    const answers = ['first query', 'second query'].map((value) => {
      let resolveAnswer: (answer: { ids: string[]; total: number }) => void = () => {}
      const promise = new Promise<{ ids: string[]; total: number }>((resolve) => { resolveAnswer = resolve })
      return { value, promise, resolve: resolveAnswer }
    })
    searchLyrics.mockImplementation((query: string) => (query === answers[0]!.value ? answers[0]!.promise : answers[1]!.promise))
    commitQuery(store.set, store.get, 'first query')
    commitQuery(store.set, store.get, 'second query')
    answers[0]!.resolve({ ids: ['stale'], total: 1 })
    answers[1]!.resolve({ ids: ['fresh'], total: 1 })
    await vi.waitFor(() => expect(store.state().remoteLyricMatches?.query).toBe('second query'))
    expect(store.state().remoteLyricMatches?.ids).toEqual(['fresh'])
  })

  it('spends no request on a single character and clears old matches (IMP-11)', async () => {
    const store = makeStore({ remoteLyricMatches: { query: 'old query', ids: ['x'], total: 1 } })
    commitQuery(store.set, store.get, 'a')
    expect(searchLyrics).not.toHaveBeenCalled()
    expect(store.state().remoteLyricMatches).toBeNull()
  })

  it('leaves scoped views to their own members even when the library answers', () => {
    const state = makeStore({
      tracks: [track('member', 'Long River List'), track('outsider', 'Long River Outsider')],
      playlists: [{ id: 'p1', name: 'List', description: '', isPinned: false, isFavorite: false, shareSlug: null, sortOrder: 0, createdAt: 1, updatedAt: 1, trackCount: 1, items: [{ id: 'i1', playlistId: 'p1', trackId: 'member', sortOrder: 0 }] }],
      scope: { kind: 'playlist', playlistId: 'p1' } as MusicStoreState['scope'],
      query: 'long river',
      remoteLyricMatches: { query: 'long river', ids: ['outsider', 'member'], total: 2 },
    }).state()
    const ids = visibleTracks(state).map((entry) => entry.id)
    expect(ids).toEqual(['member'])
  })
})
