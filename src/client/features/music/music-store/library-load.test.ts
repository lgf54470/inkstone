import { afterEach, describe, expect, it, vi } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicPlaylistDetail, MusicStats, MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: { music: { library: vi.fn() } },
}))
vi.mock('../music-search', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, ensureRomanized: vi.fn() }
})

import { api } from '../../../lib/api'
import { ensureRomanized } from '../music-search'
import { hiddenMatchCount, loadLibrary, openTrackMenu, prepareRomanization, setSort, setSortDirection, sortTracks, visibleTracks } from './library-load'
import type { MusicSet, MusicStoreState } from './types'

const libraryPayload = { tracks: [] as MusicTrack[], tags: [], playlists: [], stats: statsFixture() }

function statsFixture(): MusicStats {
  return { trackCount: 0, favoriteCount: 0, pinnedCount: 0, playlistCount: 0, tagCount: 0, totalBytes: 0, totalDurationMs: 0 }
}

function makeStore() {
  return musicStoreStub({ lastLoadedAt: 0 })
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(api.music.library).mockReset()
  vi.mocked(ensureRomanized).mockReset()
})

function searchableTrack(id: string): MusicTrack {
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
  const store = makeStore()
  const tracks = Array.from({ length: count }, (_, index) => searchableTrack(String(index)))
  store.set({ tracks, query: 'moonlight', romanized: {}, scope: { kind: 'all' }, sourceFilter: 'all', sort: 'recent', sortDirection: 'asc' })
  return store
}

describe('search hit truncation (UI-16)', () => {
  it('counts the matches that the capped list leaves out', () => {
    const store = queryStore(250)
    expect(visibleTracks(store.get())).toHaveLength(200)
    expect(hiddenMatchCount(store.get())).toBe(50)
  })

  it('counts nothing hidden when every match fits', () => {
    expect(hiddenMatchCount(queryStore(120).get())).toBe(0)
  })

  it('counts nothing hidden without a query', () => {
    const store = queryStore(250)
    store.set({ query: '' })
    expect(hiddenMatchCount(store.get())).toBe(0)
  })

  it('counts nothing hidden when the query matches fewer tracks than the cap', () => {
    const store = queryStore(250)
    store.set({ query: 'moonlight 24' })
    expect(hiddenMatchCount(store.get())).toBe(0)
  })
})

describe('loadLibrary conditional read (PERF-4)', () => {
  it('sends the stored validator and keeps the library objects on 304', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00Z'))
    const payload = { ...libraryPayload, tracks: [searchableTrack('t1')] }
    // The real api reads the validator off the response header; the stub hands one over.
    vi.mocked(api.music.library).mockImplementation(async (_etag, onEtag) => {
      onEtag?.('W/"library-1"')
      return payload
    })
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    const loaded = store.get().tracks
    expect(loaded).toHaveLength(1)

    vi.setSystemTime(new Date('2026-09-19T10:01:01Z'))
    vi.mocked(api.music.library).mockResolvedValue(null as never)
    await loadLibrary(store.set, store.get)

    expect(api.music.library).toHaveBeenLastCalledWith('W/"library-1"', expect.any(Function))
    // Same array, so every memo built over the library survives the reload.
    expect(store.get().tracks).toBe(loaded)
    expect(store.get().lastLoadedAt).toBe(Date.now())
  })
})

describe('loadLibrary in-flight dedup', () => {
  it('shares one request between concurrent loads', async () => {
    let release: (value: typeof libraryPayload) => void = () => {}
    vi.mocked(api.music.library).mockReturnValue(new Promise((resolve) => { release = resolve }))
    const store = makeStore()
    const first = loadLibrary(store.set, store.get)
    const second = loadLibrary(store.set, store.get)
    release(libraryPayload)
    await Promise.all([first, second])
    expect(api.music.library).toHaveBeenCalledTimes(1)
  })
})

describe('loadLibrary freshness window', () => {
  it('skips a reload while the library is still fresh', async () => {
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(1)
    expect(store.get().lastLoadedAt).toBeGreaterThan(0)
  })

  it('reloads once the freshness window has passed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00Z'))
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    vi.setSystemTime(new Date('2026-09-19T10:01:01Z'))
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(2)
  })

  it('lets a failed load be retried immediately', async () => {
    vi.mocked(api.music.library)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    expect(store.get().loadError).toBeTruthy()
    await loadLibrary(store.set, store.get)
    expect(api.music.library).toHaveBeenCalledTimes(2)
    expect(store.get().loadError).toBeNull()
  })

  it('force bypasses the freshness window', async () => {
    vi.mocked(api.music.library).mockResolvedValue(libraryPayload)
    const store = makeStore()
    await loadLibrary(store.set, store.get)
    await loadLibrary(store.set, store.get, true)
    expect(api.music.library).toHaveBeenCalledTimes(2)
  })
})

function selectorTrack(id: string, createdAt: number, isPinned = false): MusicTrack {
  return { id, title: id, artist: '', album: '', createdAt, isPinned } as MusicTrack
}

function playlistScopeState(): MusicStoreState {
  return {
    scope: { kind: 'playlist', playlistId: 'p1' },
    sourceFilter: 'all',
    query: '',
    sort: 'title',
    tracks: [selectorTrack('t1', 3, true), selectorTrack('t2', 1), selectorTrack('t3', 2)],
    playlists: [{
      id: 'p1',
      name: 'Road',
      trackCount: 3,
      items: [
        { id: 'i1', playlistId: 'p1', trackId: 't3', sortOrder: 0 },
        { id: 'i2', playlistId: 'p1', trackId: 't1', sortOrder: 1 },
        { id: 'i3', playlistId: 'p1', trackId: 't2', sortOrder: 2 },
      ],
    } as unknown as MusicPlaylistDetail],
  } as unknown as MusicStoreState
}

describe('visibleTracks in playlist scope', () => {
  it('keeps the manual item order instead of sorting or hoisting pins', () => {
    expect(visibleTracks(playlistScopeState()).map((track) => track.id)).toEqual(['t3', 't1', 't2'])
  })

  it('still applies the query filter inside a playlist', () => {
    const state = playlistScopeState()
    state.romanized = {}
    const searched = visibleTracks({ ...state, query: 't2' })
    expect(searched.map((track) => track.title)).toEqual(['t2'])
  })
})

function hashedTrack(id: string, contentHash: string | null, createdAt: number, isPinned = false): MusicTrack {
  return { id, title: id, artist: '', album: '', createdAt, isPinned, contentHash, sizeBytes: 10 } as MusicTrack
}

function duplicatesScopeState(): MusicStoreState {
  return {
    scope: { kind: 'duplicates' },
    sourceFilter: 'all',
    query: '',
    sort: 'title',
    tracks: [
      hashedTrack('a1', 'h1', 5, true),
      hashedTrack('a2', 'h1', 2),
      hashedTrack('a3', 'h1', 8),
      hashedTrack('b1', 'h2', 1),
      hashedTrack('b2', 'h2', 3),
      hashedTrack('solo', null, 9),
    ],
  } as unknown as MusicStoreState
}

describe('visibleTracks in duplicates scope', () => {
  it('keeps the group order instead of sorting or hoisting pins, and omits unhashed tracks', () => {
    // h1 wastes more (two extras) so it leads despite uploading after h2;
    // within a group the oldest copy comes first even when a later one is pinned.
    expect(visibleTracks(duplicatesScopeState()).map((track) => track.id)).toEqual(['a2', 'a1', 'a3', 'b1', 'b2'])
  })

  it('shows nothing when no two tracks share a checksum', () => {
    const state = duplicatesScopeState()
    const unique = state.tracks.map((track) => hashedTrack(track.id, track.id === 'solo' ? null : `solo-${track.id}`, track.createdAt))
    expect(visibleTracks({ ...state, tracks: unique })).toEqual([])
  })
})

function romanizeStore() {
  let state = {
    tracks: [{ id: 't1', title: '月光', artist: '', album: '' } as MusicTrack],
    romanized: {} as Record<string, string>,
  } as unknown as MusicStoreState
  const set: MusicSet = (patch) => {
    const next = typeof patch === 'function'
      ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state)
      : (patch as Partial<MusicStoreState>)
    state = { ...state, ...next }
  }
  return { set, get: () => state }
}

describe('prepareRomanization', () => {
  it('shares one pass between concurrent requests', async () => {
    let release: (value: Record<string, string>) => void = () => {}
    vi.mocked(ensureRomanized).mockReturnValue(new Promise((resolve) => { release = resolve }))
    const store = romanizeStore()

    const first = prepareRomanization(store.set, store.get)
    const second = prepareRomanization(store.set, store.get)
    release({ t1: 'yueguang' })
    await Promise.all([first, second])

    expect(ensureRomanized).toHaveBeenCalledTimes(1)
    expect(store.get().romanized).toEqual({ t1: 'yueguang' })
  })

  it('publishes each batch to the store before the pass finishes', async () => {
    const store = romanizeStore()
    const seenMidPass = { current: null as Record<string, string> | null }
    vi.mocked(ensureRomanized).mockImplementation(async (_texts, _existing, onBatch) => {
      onBatch?.({ t1: 'yueguang partial' })
      seenMidPass.current = store.get().romanized
      return { t1: 'yueguang yuegg final' }
    })

    await prepareRomanization(store.set, store.get)

    expect(seenMidPass.current).toEqual({ t1: 'yueguang partial' })
    expect(store.get().romanized).toEqual({ t1: 'yueguang yuegg final' })
  })
})

function trackMenuStore(scope: MusicStoreState['scope']): MusicStoreState {
  return {
    scope,
    tracks: [],
    playlists: [{ id: 'p1', name: 'Road', items: [
      { id: 'i1', playlistId: 'p1', trackId: 't3', sortOrder: 0 },
      { id: 'i2', playlistId: 'p1', trackId: 't1', sortOrder: 1 },
    ] }] as unknown as MusicStoreState['playlists'],
    trackMenu: null,
  } as unknown as MusicStoreState
}

function menuSetter(state: { current: MusicStoreState }): MusicSet {
  return (patch) => {
    const next = typeof patch === 'function'
      ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state.current)
      : (patch as Partial<MusicStoreState>)
    state.current = { ...state.current, ...next }
  }
}

describe('openTrackMenu playlist identity', () => {
  it('fills the item identity so playlist rows expose playlist actions', () => {
    const holder = { current: trackMenuStore({ kind: 'playlist', playlistId: 'p1' }) }
    const track = { id: 't1', title: 'x' } as MusicTrack
    openTrackMenu(menuSetter(holder), () => holder.current, { target: { track }, anchor: { x: 0, y: 0 } })
    expect(holder.current.trackMenu?.target).toEqual({ track, itemId: 'i2', playlistId: 'p1' })
  })

  it('leaves the target untouched outside playlist scope', () => {
    const holder = { current: trackMenuStore({ kind: 'all' }) }
    const track = { id: 't1', title: 'x' } as MusicTrack
    openTrackMenu(menuSetter(holder), () => holder.current, { target: { track }, anchor: { x: 0, y: 0 } })
    expect(holder.current.trackMenu?.target).toEqual({ track })
  })

  it('keeps an explicitly provided identity', () => {
    const holder = { current: trackMenuStore({ kind: 'playlist', playlistId: 'p1' }) }
    const track = { id: 't1', title: 'x' } as MusicTrack
    openTrackMenu(menuSetter(holder), () => holder.current, { target: { track, itemId: 'iX', playlistId: 'p9' }, anchor: { x: 0, y: 0 } })
    expect(holder.current.trackMenu?.target).toEqual({ track, itemId: 'iX', playlistId: 'p9' })
  })
})

function sortableTrack(id: string, artist: string, album: string, durationMs: number, isPinned = false): MusicTrack {
  return { id, title: id, artist, album, durationMs, playCount: 0, createdAt: 0, isPinned } as MusicTrack
}

describe('recent scope reads the server-stamped last play — FEAT-9', () => {
  function playedTrack(id: string, lastPlayedAt: number | null): MusicTrack {
    return { ...sortableTrack(id, '', '', 0), lastPlayedAt }
  }

  it('lists only tracks the server saw played, most recent first', () => {
    const store = makeStore()
    store.set({
      tracks: [playedTrack('a', 100), playedTrack('b', null), playedTrack('c', 300), playedTrack('d', 200)],
      tags: [], playlists: [], query: '', sourceFilter: 'all', scope: { kind: 'recent' },
      sort: 'recent', sortDirection: 'asc', romanized: {}, lastLoadedAt: 0,
    } as Partial<MusicStoreState>)
    expect(visibleTracks(store.get()).map((track) => track.id)).toEqual(['c', 'd', 'a'])
  })
})

describe('browse and group-detail scopes — M-50', () => {
  function browseStore(scope: MusicStoreState['scope']) {
    const store = makeStore()
    store.set({
      tracks: [
        sortableTrack('a', 'Ann', 'Fog', 100),
        sortableTrack('b', 'Zoe', 'Fog', 200),
        sortableTrack('c', 'Ann', 'Spark', 300),
      ],
      tags: [], playlists: [], query: '', sourceFilter: 'all', sort: 'title', sortDirection: 'asc', romanized: {}, lastLoadedAt: 0,
      scope,
    } as Partial<MusicStoreState>)
    return store
  }

  it('browse kinds render a grid elsewhere, so the track list stays empty', () => {
    expect(visibleTracks(browseStore({ kind: 'albums' }).get())).toEqual([])
    expect(visibleTracks(browseStore({ kind: 'artists' }).get())).toEqual([])
  })

  it('album detail filters on artist and album together', () => {
    const ids = visibleTracks(browseStore({ kind: 'album', artist: 'Ann', album: 'Fog' }).get()).map((track) => track.id)
    expect(ids).toEqual(['a'])
  })

  it('artist detail keeps both albums of that artist', () => {
    const ids = visibleTracks(browseStore({ kind: 'artist', artist: 'Ann' }).get()).map((track) => track.id)
    expect(ids).toEqual(['a', 'c'])
  })
})

describe('sortTracks field and direction coverage (UI-9)', () => {
  const tracks = [
    sortableTrack('a', 'Zoe', 'Spark', 300),
    sortableTrack('b', 'Ann', 'Fog', 100),
    sortableTrack('c', 'Bob', 'Mist', 200, true),
  ]
  const ids = (sort: 'album' | 'duration', direction: 'asc' | 'desc') => sortTracks(tracks, sort, direction).map((track) => track.id)

  it('orders by album with pinned tracks kept first', () => {
    expect(ids('album', 'asc')).toEqual(['c', 'b', 'a'])
  })

  it('orders by duration ascending and descending', () => {
    expect(ids('duration', 'asc')).toEqual(['c', 'b', 'a'])
    expect(ids('duration', 'desc')).toEqual(['c', 'a', 'b'])
  })

  it('reverses the comparator for descending while pins stay hoisted', () => {
    expect(ids('album', 'desc')).toEqual(['c', 'a', 'b'])
  })
})

describe('setSort and setSortDirection', () => {
  it('choosing a new sort field resets the direction to ascending', () => {
    const store = makeStore()
    setSort(store.set, 'title')
    setSortDirection(store.set, 'desc')
    expect(store.get().sortDirection).toBe('desc')
    setSort(store.set, 'album')
    expect(store.get().sort).toBe('album')
    expect(store.get().sortDirection).toBe('asc')
  })

  it('visibleTracks honours the stored direction', () => {
    const store = makeStore()
    const state = store.get()
    Object.assign(state, {})
    store.set({
      tracks: [sortableTrack('a', 'Zoe', 'Spark', 300), sortableTrack('b', 'Ann', 'Fog', 100)],
      tags: [], playlists: [], query: '', sourceFilter: 'all', scope: { kind: 'all' },
      sort: 'duration', sortDirection: 'desc', romanized: {}, lastLoadedAt: 0,
    } as Partial<MusicStoreState>)
    expect(visibleTracks(store.get()).map((track) => track.id)).toEqual(['a', 'b'])
  })
})
