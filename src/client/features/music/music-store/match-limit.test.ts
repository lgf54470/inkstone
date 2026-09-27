import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { SEARCH_RESULT_LIMIT } from '../music-search'
import { hiddenMatchCount, setQuery, setScope, showMoreMatches, visibleTracks } from './library-load'
import { musicStoreStub } from './store.test-helpers'

// FB-PF2: the grid mounts one card per match, so a broad query used to stop at the render budget and
// the header could only say how many it left out. The cap is now the reader's own: the notice is an
// action, and the budget it starts from is the same one the grid has always used.
function track(id: string): MusicTrack {
  return {
    id,
    title: `moonlight ${id}`,
    artist: '',
    album: '',
    durationMs: 0,
    source: 'r2',
    format: 'mp3',
    webdavPath: null,
    mime: 'audio/mpeg',
    sizeBytes: 0,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    contentHash: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

function queryStore(count: number) {
  // `setQuery` warms the pinyin index for the new text, which is a promise the fixture need
  // not run: the subject here is the budget, not the dictionary.
  const store = musicStoreStub({ lastLoadedAt: 0, prepareRomanization: () => Promise.resolve() })
  const tracks = Array.from({ length: count }, (_, index) => track(String(index)))
  store.set({ tracks, query: 'moonlight', romanized: {}, scope: { kind: 'all' }, sourceFilter: 'all', sort: 'recent', sortDirection: 'asc', viewMode: 'grid' })
  return store
}

describe('match limit (FB-PF2)', () => {
  it('starts at the render budget the capped grid has always used', () => {
    const store = queryStore(250)
    expect(visibleTracks(store.get())).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(hiddenMatchCount(store.get())).toBe(250 - SEARCH_RESULT_LIMIT)
  })

  it('shows one more page per ask and shrinks the notice to nothing', () => {
    const store = queryStore(SEARCH_RESULT_LIMIT + 40)
    showMoreMatches(store.set)
    expect(store.get().matchLimit).toBe(SEARCH_RESULT_LIMIT * 2)
    expect(visibleTracks(store.get())).toHaveLength(SEARCH_RESULT_LIMIT + 40)
    expect(hiddenMatchCount(store.get())).toBe(0)
  })

  it('counts the remainder against the raised limit, not the original budget', () => {
    const store = queryStore(SEARCH_RESULT_LIMIT * 2 + 30)
    showMoreMatches(store.set)
    expect(hiddenMatchCount(store.get())).toBe(30)
  })

  it('drops a raised limit when a new query starts', () => {
    const store = queryStore(300)
    showMoreMatches(store.set)
    setQuery(store.set, store.get, 'moon')
    expect(store.get().matchLimit).toBe(SEARCH_RESULT_LIMIT)
  })

  it('drops it when the scope changes too, so a view cannot inherit another one\'s budget', () => {
    const store = queryStore(300)
    showMoreMatches(store.set)
    setScope(store.set, { kind: 'favorites' })
    expect(store.get().matchLimit).toBe(SEARCH_RESULT_LIMIT)
  })

  it('leaves the list view alone, which windows its own rows', () => {
    const store = queryStore(300)
    store.set({ viewMode: 'list' })
    showMoreMatches(store.set)
    expect(visibleTracks(store.get())).toHaveLength(300)
    expect(hiddenMatchCount(store.get())).toBe(0)
  })
})

// FB-PF4: the budget was reached from the query path only, so a library nobody had searched still
// mounted a card per row the moment the reader switched to covers — the cost of opening the grid
// was the size of the collection, not the size of the page.
describe('unsearched grid (FB-PF4)', () => {
  function browsingStore(viewMode: 'grid' | 'list') {
    const store = musicStoreStub({ lastLoadedAt: 0, prepareRomanization: () => Promise.resolve() })
    const tracks = Array.from({ length: 250 }, (_, index) => track(String(index)))
    store.set({ tracks, query: '', romanized: {}, scope: { kind: 'all' }, sourceFilter: 'all', sort: 'recent', sortDirection: 'asc', viewMode })
    return store
  }

  it('mounts one page of cards and counts the rest instead of the whole library', () => {
    const store = browsingStore('grid')
    expect(visibleTracks(store.get())).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(hiddenMatchCount(store.get())).toBe(250 - SEARCH_RESULT_LIMIT)
  })

  it('shows the next page when the reader asks, so the notice is a way through and not a wall', () => {
    const store = browsingStore('grid')
    showMoreMatches(store.set)
    expect(visibleTracks(store.get())).toHaveLength(250)
    expect(hiddenMatchCount(store.get())).toBe(0)
  })

  it('keeps the cap on a playlist too, whose rows the grid also draws one by one', () => {
    const store = browsingStore('grid')
    const ids = store.get().tracks.map((entry) => entry.id)
    store.set({
      playlists: [{
        id: 'p1', name: 'p', description: '', isPinned: false, isFavorite: false, shareSlug: null,
        coverUrl: null, sortOrder: 0, createdAt: 0, updatedAt: 0, trackCount: ids.length,
        items: ids.map((trackId, sortOrder) => ({ id: `i${sortOrder}`, playlistId: 'p1', trackId, sortOrder })),
      }],
      scope: { kind: 'playlist', playlistId: 'p1' },
    })
    expect(visibleTracks(store.get())).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(hiddenMatchCount(store.get())).toBe(250 - SEARCH_RESULT_LIMIT)
  })
})
