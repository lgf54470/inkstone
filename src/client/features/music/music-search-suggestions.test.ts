import { describe, expect, it } from 'vitest'
import type { MusicPlaylist, MusicTrack } from '@shared/types'
import { buildSearchSuggestions } from './music-search-suggestions'

function track(id: string, artist: string, album: string): MusicTrack {
  return { id, title: `Song ${id}`, artist, album, durationMs: 1000, isPinned: false } as MusicTrack
}

function playlist(id: string, name: string, trackCount: number): MusicPlaylist {
  return { id, name, trackCount } as MusicPlaylist
}

describe('search suggestions (FEA-A1-5)', () => {
  const tracks = [track('1', 'Sun Yi', 'Sunrise'), track('2', 'Moon', 'Sunset'), track('3', 'Sun Yi', 'Morning')]

  it('suggests matching artists, albums, and playlists with jump scopes', () => {
    const suggestions = buildSearchSuggestions(tracks, [playlist('p1', 'Sunday Chill', 4)], 'SUN')
    expect(suggestions.map((entry) => entry.label)).toEqual(['Sun Yi', 'Sunrise', 'Sunset', 'Sunday Chill'])
    expect(suggestions[0]?.scope).toEqual({ kind: 'artist', artist: 'Sun Yi' })
    expect(suggestions[1]?.scope).toEqual({ kind: 'album', artist: 'Sun Yi', album: 'Sunrise' })
    expect(suggestions[1]?.meta).toBe('Sun Yi')
    expect(suggestions[2]?.meta).toBe('Moon')
    expect(suggestions[3]?.scope).toEqual({ kind: 'playlist', playlistId: 'p1' })
  })

  it('caps each kind at three and skips unnamed groups', () => {
    const crowded = [
      track('1', 'Sun A', ''), track('2', 'Sun B', ''), track('3', 'Sun C', ''), track('4', 'Sun D', ''),
      track('5', '', 'Hidden'),
    ]
    const suggestions = buildSearchSuggestions(crowded, [], 'sun')
    expect(suggestions).toHaveLength(3)
    expect(suggestions.every((entry) => entry.kind === 'artist')).toBe(true)
  })

  it('answers nothing for blank text', () => {
    expect(buildSearchSuggestions(tracks, [playlist('p1', 'Sunday Chill', 4)], '  ')).toEqual([])
  })
})

// FB3-F8: the popup could only jump inside the library it already had. The online answer to the same
// query is a second set of rows — the song the reader is looking for may only exist in a catalogue —
// and the one worth putting first is the one the library already holds, because that row plays now.
describe('online suggestions (FB3-F8)', () => {
  const hit = (sourceId: string, title: string, source = 'netease') => ({
    provider: 'gds', source, sourceId, title, artist: 'Ann', album: '', durationMs: null, coverId: null, lyricId: null,
  })
  const tracks = [
    { id: 't1', title: 'Echoes', artist: 'Ann', album: '', durationMs: 1000, providerSource: 'netease', providerSongId: 'a1' } as MusicTrack,
  ]

  it('lists the catalogue answer after the library jump targets', () => {
    const suggestions = buildSearchSuggestions(tracks, [], 'echo', { hits: [hit('b9', 'Echo Beach')], keywords: 'echo' })
    expect(suggestions.map((entry) => entry.kind)).toEqual(['online'])
    expect(suggestions[0]?.label).toBe('Echo Beach')
    expect(suggestions[0]?.hit?.sourceId).toBe('b9')
    expect(suggestions[0]?.inLibrary).toBe(false)
  })

  it('puts the hits the library already holds first, and says so', () => {
    const suggestions = buildSearchSuggestions(tracks, [], 'echo', {
      hits: [hit('b9', 'Echo Beach'), hit('a1', 'Echoes')],
      keywords: 'echo',
    })
    expect(suggestions.map((entry) => entry.label)).toEqual(['Echoes', 'Echo Beach'])
    expect(suggestions[0]?.inLibrary).toBe(true)
  })

  it('is only as fresh as the answer it was given', () => {
    const stale = buildSearchSuggestions(tracks, [], 'echoo', { hits: [hit('b9', 'Echo Beach')], keywords: 'echo' })
    expect(stale).toEqual([])
  })

  it('caps the online rows and keeps the library half intact', () => {
    const hits = ['a', 'b', 'c', 'd'].map((id) => hit(id, `Echo ${id}`))
    const suggestions = buildSearchSuggestions(tracks, [playlist('p1', 'Echo list', 2)], 'echo', { hits, keywords: 'echo' })
    expect(suggestions.filter((entry) => entry.kind === 'online')).toHaveLength(3)
    expect(suggestions.filter((entry) => entry.kind === 'playlist')).toHaveLength(1)
  })

  it('skips a hit whose title and artist do not match the words', () => {
    const suggestions = buildSearchSuggestions(tracks, [], 'echo', { hits: [hit('z1', 'Something Else', 'kuwo')], keywords: 'echo' })
    expect(suggestions).toEqual([])
  })
})
