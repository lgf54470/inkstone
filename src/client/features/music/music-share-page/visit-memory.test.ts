import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicPlaylistTrack } from '../../../lib/api'
import { forgetPlaylistVisit, newestTrackAt, readPlaylistVisit, rememberPlaylistVisit, tracksSinceVisit } from './visit-memory'

const SLUG = 'abc234def567ghi890jkl'

// `addedAt` is what the comparison reads, and `createdAt` defaults somewhere else on purpose: an old
// track can be added to a playlist today, and the case below that pins the distinction sets both.
function track(id: string, addedAt: number, createdAt = addedAt - 5): PublicPlaylistTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 1_000, mime: 'audio/mpeg', lyric: null,
    coverUrl: null, streamUrl: `/stream/${id}`, tagIds: [], createdAt, addedAt,
  }
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('the visit stamp', () => {
  it('has nothing to report before the first visit', () => {
    expect(readPlaylistVisit(SLUG).lastSeenAt).toBeNull()
  })

  it('remembers when this browser last opened one playlist without touching another', () => {
    rememberPlaylistVisit(SLUG, 1_000)
    rememberPlaylistVisit('other', 2_000)
    expect(readPlaylistVisit(SLUG).lastSeenAt).toBe(1_000)
    expect(readPlaylistVisit('other').lastSeenAt).toBe(2_000)
  })

  it('forgets on request, which is the whole of the opt-out', () => {
    rememberPlaylistVisit(SLUG, 1_000)
    forgetPlaylistVisit(SLUG)
    expect(readPlaylistVisit(SLUG).lastSeenAt).toBeNull()
  })

  it('reads a stamp it cannot make sense of as a first visit', () => {
    window.localStorage.setItem('inkstone.playlist-visit.' + SLUG, 'yesterday')
    expect(readPlaylistVisit(SLUG).lastSeenAt).toBeNull()
    window.localStorage.setItem('inkstone.playlist-visit.' + SLUG, '-5')
    expect(readPlaylistVisit(SLUG).lastSeenAt).toBeNull()
  })

  // A storage that throws is the normal case in private mode, and the page has to render anyway.
  it('degrades to a first visit when storage refuses', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    } as unknown as Storage
    expect(readPlaylistVisit(SLUG, broken).lastSeenAt).toBeNull()
    expect(() => rememberPlaylistVisit(SLUG, 1, broken)).not.toThrow()
    expect(() => forgetPlaylistVisit(SLUG, broken)).not.toThrow()
  })
})

describe('what changed since the last visit', () => {
  it('reports nothing at all on a first visit', () => {
    expect(tracksSinceVisit([track('a', 10), track('b', 20)], null)).toEqual([])
  })

  it('reports only what appeared after the stamp', () => {
    const tracks = [track('old', 1_000), track('also-old', 1_500), track('new', 2_500)]
    expect(tracksSinceVisit(tracks, 2_000)).toEqual(['new'])
  })

  // Strictly after: the stamp is the instant the reader last had the page open, so anything stamped
  // at that same millisecond is not "since" it. The window where that could hide a track is one
  // millisecond wide, and treating it as new would instead mark a track they were just looking at.
  it('does not call a track stamped at the same instant new', () => {
    expect(tracksSinceVisit([track('same', 2_000)], 2_000)).toEqual([])
    expect(tracksSinceVisit([track('later', 2_001)], 2_000)).toEqual(['later'])
  })

  it('reports nothing when the playlist has not grown', () => {
    expect(tracksSinceVisit([track('a', 1_000)], 5_000)).toEqual([])
  })

  // The two timestamps a public track carries are different facts, and only one of them is about this
  // playlist: an upload from last year that was added this morning is news here, and a fresh upload
  // that has been sitting in the playlist for a month is not.
  it('goes by when the item entered the playlist, not when the track was created', () => {
    const addedToday = track('added-today', 3_000, 1)
    const oldItem = track('old-item', 10, 9_000)
    expect(tracksSinceVisit([addedToday, oldItem], 1_000)).toEqual(['added-today'])
  })
})

// What a visit hands to the next one: the newest item it displayed. Order is not assumed — the payload
// is ordered by the playlist's own arrangement, which says nothing about when a track was added.
describe('what a visit leaves behind', () => {
  it('is the newest item, wherever it sits in the list', () => {
    expect(newestTrackAt([track('a', 1_000), track('c', 3_000), track('b', 2_000)])).toBe(3_000)
  })

  it('is nothing at all for an empty playlist', () => {
    expect(newestTrackAt([])).toBeNull()
  })
})
