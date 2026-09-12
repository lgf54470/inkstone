import { useCallback, useMemo } from 'react'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './music-store'

export function useTrackListActions(
  tracks: MusicTrack[],
  currentId: string | null,
  onEdit: (track: MusicTrack) => void,
) {
  const playCollection = useMusic((state) => state.playCollection)
  const togglePlay = useMusic((state) => state.togglePlay)
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  const onPlay = useCallback((track: MusicTrack) => {
    if (track.id === currentId) {
      void togglePlay()
      return
    }
    const index = tracks.findIndex((entry) => entry.id === track.id)
    void playCollection(tracks.map((entry) => entry.id), index < 0 ? 0 : index)
  }, [currentId, tracks, playCollection, togglePlay])
  return useMemo(
    () => ({ onPlay, onToggleFavorite: toggleFavorite, onEdit }),
    [onPlay, toggleFavorite, onEdit],
  )
}

export function shuffledIds(ids: string[]): string[] {
  const out = [...ids]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const previous = out[index]!
    out[index] = out[swap]!
    out[swap] = previous
  }
  return out
}
