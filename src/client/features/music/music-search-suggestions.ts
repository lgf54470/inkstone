import type { MusicPlaylist, MusicTrack } from '@shared/types'
import { buildGroups } from './music-grouping'
import type { MusicScope } from './music-store'

export interface MusicSearchSuggestion {
  // Stable React key for the popup row.
  key: string
  kind: 'artist' | 'album' | 'playlist'
  label: string
  // Album artist for an album row, '' otherwise — two same-titled albums by
  // different artists are distinct suggestions and need the disambiguation.
  meta: string
  scope: MusicScope
}

const MAX_PER_KIND = 3

// FEA-A1-5: jump targets for the search popup, derived from the same grouping
// the browse grids use (buildGroups), so a suggestion and its group card can
// never disagree about what exists. Unnamed groups (missing tag) are skipped:
// suggesting "unknown artist" is noise, the browse grid can keep showing it.
export function buildSearchSuggestions(tracks: MusicTrack[], playlists: MusicPlaylist[], text: string): MusicSearchSuggestion[] {
  const needle = text.trim().toLowerCase()
  if (!needle) return []
  const matches = (name: string): boolean => name.toLowerCase().includes(needle)
  const artists = buildGroups(tracks, 'artists')
    .filter((group) => group.name && matches(group.name))
    .slice(0, MAX_PER_KIND)
    .map((group) => ({
      key: `artist:${group.name}`,
      kind: 'artist' as const,
      label: group.name,
      meta: '',
      scope: { kind: 'artist', artist: group.name } satisfies MusicScope,
    }))
  const albums = buildGroups(tracks, 'albums')
    .filter((group) => group.name && matches(group.name))
    .slice(0, MAX_PER_KIND)
    .map((group) => ({
      key: `album:${group.artist}:${group.name}`,
      kind: 'album' as const,
      label: group.name,
      meta: group.artist,
      scope: { kind: 'album', artist: group.artist, album: group.name } satisfies MusicScope,
    }))
  const playlistHits = playlists
    .filter((entry) => matches(entry.name))
    .slice(0, MAX_PER_KIND)
    .map((entry) => ({
      key: `playlist:${entry.id}`,
      kind: 'playlist' as const,
      label: entry.name,
      meta: '',
      scope: { kind: 'playlist', playlistId: entry.id } satisfies MusicScope,
    }))
  return [...artists, ...albums, ...playlistHits]
}
