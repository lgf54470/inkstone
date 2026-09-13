import { useMemo } from 'react'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './index'
import { visibleTracks } from './library-load'
import { currentTrack } from './player'

export function useVisibleTracks(): MusicTrack[] {
  const tracks = useMusic((s) => s.tracks)
  const playlists = useMusic((s) => s.playlists)
  const tags = useMusic((s) => s.tags)
  const scope = useMusic((s) => s.scope)
  const query = useMusic((s) => s.query)
  const sort = useMusic((s) => s.sort)
  const sourceFilter = useMusic((s) => s.sourceFilter)
  const recentIds = useMusic((s) => s.recentIds)
  const romanized = useMusic((s) => s.romanized)
  return useMemo(
    () => visibleTracks({ tracks, playlists, tags, scope, query, sort, sourceFilter, recentIds, romanized } as never),
    [tracks, playlists, tags, scope, query, sort, sourceFilter, recentIds, romanized],
  )
}

export function useCurrentTrack(): MusicTrack | null {
  const queue = useMusic((s) => s.queue)
  const currentIndex = useMusic((s) => s.currentIndex)
  const tracks = useMusic((s) => s.tracks)
  return useMemo(
    () => currentTrack({ queue, currentIndex, tracks } as never),
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