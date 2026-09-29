import { useEffect, useMemo, type RefObject } from 'react'
import type { MusicTrack } from '@shared/types'
import { preferredScrollBehavior } from '../../lib/motion'
import { activeLyricIndex, lyricsPending, parseLyric, type LyricLine } from './music-utils'
import { useCurrentTrack, useMusic, useProgress } from './music-store'

// The library ships tracks without lyric text; detail views mount this hook to
// have the store fetch it by id once, then read the merged `track.lyric` themselves.
export function useTrackLyric(track: MusicTrack | null | undefined): void {
  const ensureTrackLyric = useMusic((state) => state.ensureTrackLyric)
  const id = track?.id ?? null
  const hasLyric = track?.hasLyric ?? false
  useEffect(() => {
    if (id && hasLyric) void ensureTrackLyric(id)
  }, [id, hasLyric, ensureTrackLyric])
}

// The lyrics a track carries, where the playhead is among them, and how far the track's
// own calibration shifts that reading. A positive calibration means "these lyrics run
// early", so the line under the playhead is found that much further back.
export function useImmersiveLyrics(track: ReturnType<typeof useCurrentTrack>): {
  lyrics: LyricLine[]
  lyricOffsetMs: number
  activeIndex: number
  pending: boolean
} {
  const lyrics = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const lyricOffsetMs = useMusic((state) => (track ? state.lyricOffsets[track.id] ?? 0 : 0))
  const activeIndex = useProgress((state) => activeLyricIndex(lyrics, state.currentTimeMs - lyricOffsetMs))
  return { lyrics, lyricOffsetMs, activeIndex, pending: lyricsPending(track) }
}

// The active line is brought into view when it changes, not on every tick of the clock.
export function useLyricScroll(open: boolean, activeIndex: number, scrollerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open || activeIndex < 0) return
    scrollerRef.current?.querySelector<HTMLElement>('[data-active-line="true"]')?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() })
  }, [activeIndex, open, scrollerRef])
}
