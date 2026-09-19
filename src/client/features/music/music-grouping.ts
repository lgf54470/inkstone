import type { MusicTrack } from '@shared/types'
import type { MusicScope } from './music-store'

export type MusicGroupKind = 'albums' | 'artists'

export interface MusicGroup {
  // ID3 text cannot carry a unit separator, so joining the raw parts keeps different
  // artists' same-titled albums apart.
  key: string
  // Raw album/artist value; '' means the tag was missing and the label renders localized.
  name: string
  artist: string
  trackIds: string[]
  coverUrl: string | null
  durationMs: number
}

const KEY_SEPARATOR = String.fromCharCode(31)

export function buildGroups(tracks: MusicTrack[], kind: MusicGroupKind): MusicGroup[] {
  const groups = new Map<string, MusicGroup>()
  for (const track of tracks) {
    const name = (kind === 'albums' ? track.album : track.artist).trim()
    const artist = kind === 'albums' ? track.artist.trim() : name
    const key = kind === 'albums' ? artist + KEY_SEPARATOR + name : name
    let group = groups.get(key)
    if (!group) {
      group = { key, name, artist, trackIds: [], coverUrl: null, durationMs: 0 }
      groups.set(key, group)
    }
    group.trackIds.push(track.id)
    group.durationMs += track.durationMs
    group.coverUrl ??= track.coverUrl
  }
  return [...groups.values()].sort(compareGroups)
}

// Unnamed groups (missing tag) sink below everything named.
function compareGroups(a: MusicGroup, b: MusicGroup): number {
  if (!a.name !== !b.name) return a.name ? -1 : 1
  return a.name.localeCompare(b.name) || a.artist.localeCompare(b.artist)
}

export function groupMatchesQuery(group: MusicGroup, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return group.name.toLowerCase().includes(needle) || group.artist.toLowerCase().includes(needle)
}

export function groupScopeOf(kind: MusicGroupKind, group: MusicGroup): MusicScope {
  return kind === 'albums'
    ? { kind: 'album', artist: group.artist, album: group.name }
    : { kind: 'artist', artist: group.artist }
}

// Which browse grid a drilled-down scope came back from, for the back button.
export function parentGroupKind(scope: MusicScope): MusicGroupKind | null {
  if (scope.kind === 'album') return 'albums'
  if (scope.kind === 'artist') return 'artists'
  return null
}
