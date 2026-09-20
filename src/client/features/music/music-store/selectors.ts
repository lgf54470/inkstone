import { useDeferredValue, useMemo } from 'react'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './index'
import { hiddenMatchCount, visibleTracks } from './library-load'
import { currentTrack } from './player'

export function useVisibleTracks(): MusicTrack[] {
  const tracks = useMusic((s) => s.tracks)
  const playlists = useMusic((s) => s.playlists)
  const tags = useMusic((s) => s.tags)
  const scope = useMusic((s) => s.scope)
  const query = useMusic((s) => s.query)
  const sort = useMusic((s) => s.sort)
  const sortDirection = useMusic((s) => s.sortDirection)
  const sourceFilter = useMusic((s) => s.sourceFilter)
  const romanized = useMusic((s) => s.romanized)
  // Ranking the whole library is the expensive part; React may paint the previous
  // result once more rather than block typing while a fresh query settles.
  const deferredQuery = useDeferredValue(query)
  return useMemo(
    () => visibleTracks({ tracks, playlists, tags, scope, query: deferredQuery, sort, sortDirection, sourceFilter, romanized }),
    [tracks, playlists, tags, scope, deferredQuery, sort, sortDirection, sourceFilter, romanized],
  )
}

// Same inputs as the list — including the deferred query — so the "matches left out"
// notice can never describe a result the list has not painted yet.
export function useHiddenMatchCount(): number {
  const tracks = useMusic((s) => s.tracks)
  const playlists = useMusic((s) => s.playlists)
  const tags = useMusic((s) => s.tags)
  const scope = useMusic((s) => s.scope)
  const query = useMusic((s) => s.query)
  const sourceFilter = useMusic((s) => s.sourceFilter)
  const romanized = useMusic((s) => s.romanized)
  const deferredQuery = useDeferredValue(query)
  return useMemo(
    () => hiddenMatchCount({ tracks, playlists, tags, scope, query: deferredQuery, sourceFilter, romanized }),
    [tracks, playlists, tags, scope, deferredQuery, sourceFilter, romanized],
  )
}

export function useCurrentTrack(): MusicTrack | null {
  const queue = useMusic((s) => s.queue)
  const currentIndex = useMusic((s) => s.currentIndex)
  const tracks = useMusic((s) => s.tracks)
  return useMemo(
    () => currentTrack({ queue, currentIndex, tracks }),
    [queue, currentIndex, tracks],
  )
}

export function useScopeTracks(scope: { kind: 'favorites' } | { kind: 'pinned' }): MusicTrack[] {
  const tracks = useMusic((s) => s.tracks)
  return useMemo(
    () => (scope.kind === 'favorites'
      ? tracks.filter((track) => track.isFavorite)
      : tracks.filter((track) => track.isPinned)),
    [tracks, scope.kind],
  )
}

export function useTagCounts(): Map<string, number> {
  const tracks = useMusic((s) => s.tracks)
  return useMemo(() => buildTagCounts(tracks), [tracks])
}

// Counts tracks per tag directly; the sidebar tree rolls descendants into the parent's total.
export function buildTagCounts(tracks: MusicTrack[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const track of tracks) {
    for (const tagId of track.tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
  }
  return counts
}