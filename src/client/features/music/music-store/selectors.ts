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
  const remoteLyricMatches = useMusic((s) => s.remoteLyricMatches)
  const viewMode = useMusic((s) => s.viewMode)
  const matchLimit = useMusic((s) => s.matchLimit)
  const offlineTrackIds = useMusic((s) => s.offlineTrackIds)
  // Ranking the whole library is the expensive part; React may paint the previous
  // result once more rather than block typing while a fresh query settles.
  const deferredQuery = useDeferredValue(query)
  return useMemo(
    () => visibleTracks({ tracks, playlists, tags, scope, query: deferredQuery, sort, sortDirection, sourceFilter, romanized, remoteLyricMatches, viewMode, matchLimit, offlineTrackIds }),
    [tracks, playlists, tags, scope, deferredQuery, sort, sortDirection, sourceFilter, romanized, remoteLyricMatches, viewMode, matchLimit, offlineTrackIds],
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
  const remoteLyricMatches = useMusic((s) => s.remoteLyricMatches)
  const viewMode = useMusic((s) => s.viewMode)
  const matchLimit = useMusic((s) => s.matchLimit)
  const offlineTrackIds = useMusic((s) => s.offlineTrackIds)
  const deferredQuery = useDeferredValue(query)
  return useMemo(
    () => hiddenMatchCount({ tracks, playlists, tags, scope, query: deferredQuery, sourceFilter, romanized, remoteLyricMatches, viewMode, matchLimit, offlineTrackIds }),
    [tracks, playlists, tags, scope, deferredQuery, sourceFilter, romanized, remoteLyricMatches, viewMode, matchLimit, offlineTrackIds],
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

// A loop range only ever applies to the track it was marked on, so every surface
// answers the same question: does the marked range belong to what is playing now.
// Subscribes in primitives and derives in a memo — an object built in the selector
// itself would be new every snapshot and re-render forever.
export function useActiveLoopRange(): { startMs: number; endMs: number } | null {
  const loop = useMusic((s) => s.loopRange)
  const currentId = useMusic((s) => s.queue[s.currentIndex] ?? null)
  return useMemo(
    () => (loop && loop.endMs !== null && loop.trackId === currentId ? { startMs: loop.startMs, endMs: loop.endMs } : null),
    [loop, currentId],
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