import type { MusicPlaylist, MusicTrack } from '@shared/types'
import { buildGroups } from './music-grouping'
import type { MusicProviderTrack } from '../../lib/api'
import type { MusicScope } from './music-store'

export interface MusicSearchSuggestion {
  // Stable React key for the popup row.
  key: string
  kind: 'artist' | 'album' | 'playlist' | 'online'
  label: string
  // Album artist for an album row, '' otherwise — two same-titled albums by
  // different artists are distinct suggestions and need the disambiguation.
  meta: string
  // A library row is a jump target; an online row carries the hit to audition instead.
  scope?: MusicScope
  hit?: MusicProviderTrack
  // FB3-F8: the library already holds this catalogue row, which is the difference between "plays
  // now" and "one press away from existing" — the reason those rows are listed first.
  inLibrary?: boolean
}

// FB3-F8: the catalogue's own answer to the same words, offered beside the library's jump targets.
// `keywords` is what the answer was asked for, so the popup stops offering rows whose query has been
// typed past — an answer is only as fresh as the words it belongs to.
export interface OnlineSuggestionInput {
  hits: MusicProviderTrack[]
  keywords: string
}

const MAX_PER_KIND = 3
const MAX_ONLINE = 3

// FEA-A1-5: jump targets for the search popup, derived from the same grouping
// the browse grids use (buildGroups), so a suggestion and its group card can
// never disagree about what exists. Unnamed groups (missing tag) are skipped:
// suggesting "unknown artist" is noise, the browse grid can keep showing it.
export function buildSearchSuggestions(
  tracks: MusicTrack[],
  playlists: MusicPlaylist[],
  text: string,
  online?: OnlineSuggestionInput,
): MusicSearchSuggestion[] {
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
  return [...artists, ...albums, ...playlistHits, ...onlineSuggestions(tracks, needle, online)]
}

// FB-F8's de-dup rule, read the other way round: a hit is the same song as a row when the catalogue
// and the song id agree. Those are the hits worth naming first — the reader can hear them now.
function libraryHitKeys(tracks: readonly MusicTrack[]): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const track of tracks) {
    if (track.providerSource && track.providerSongId) keys.add(`${track.providerSource}:${track.providerSongId}`)
  }
  return keys
}

function onlineSuggestions(tracks: MusicTrack[], needle: string, online?: OnlineSuggestionInput): MusicSearchSuggestion[] {
  if (!online || online.keywords.trim().toLowerCase() !== needle) return []
  const held = libraryHitKeys(tracks)
  return online.hits
    .filter((hit) => `${hit.title} ${hit.artist}`.toLowerCase().includes(needle))
    .map((hit) => ({ hit, inLibrary: held.has(`${hit.source}:${hit.sourceId}`) }))
    // A stable sort keeps the catalogue's own ranking inside each half, which is the order the panel
    // below the box already lists them in.
    .sort((a, b) => Number(Boolean(b.inLibrary)) - Number(Boolean(a.inLibrary)))
    .slice(0, MAX_ONLINE)
    .map(({ hit, inLibrary }) => ({
      key: `online:${hit.source}:${hit.sourceId}`,
      kind: 'online' as const,
      label: hit.title,
      meta: hit.artist,
      hit,
      inLibrary,
    }))
}
