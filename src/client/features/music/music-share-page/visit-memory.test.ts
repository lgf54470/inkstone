import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicPlaylistTrack } from '../../../lib/api'
import { forgetPlaylistVisit, readPlaylistVisit, rememberPlaylistVisit, tracksSinceVisit } from './visit-memory'

const SLUG = 'abc234def567ghi890jkl'

function track(id: string, createdAt: number): PublicPlaylistTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 1_000, mime: 'audio/mpeg', lyric: null,
    coverUrl: null, streamUrl: `/stream/${id}`, tagIds: [], createdAt,
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
})
