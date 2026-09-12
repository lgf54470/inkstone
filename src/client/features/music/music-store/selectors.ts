import { useMemo } from 'react'
import type { MusicTag, MusicTrack } from '@shared/types'
import { useMusic } from './index'
import { visibleTracks } from './library-load'
import { currentTrack } from './player'
import { collectTagIds } from '../music-utils'

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
  const tags = useMusic((s) => s.tags)
  return useMemo(() => buildTagCounts(tracks, tags), [tracks, tags])
}

export function buildTagCounts(tracks: MusicTrack[], tags: MusicTag[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tag of tags) {
    const ids = collectTagIds(tag.id, tags)
    counts.set(tag.id, tracks.filter((track) => track.tagIds.some((id) => ids.has(id))).length)
  }
  return counts
}