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
