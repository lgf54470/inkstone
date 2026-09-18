import { useEffect } from 'react'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './music-store'

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
