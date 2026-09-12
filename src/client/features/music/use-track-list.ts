import { useCallback, useMemo, useRef } from 'react'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './music-store'
import { rangeIds } from './music-utils'

export interface SelectModifiers {
  shift: boolean
  additive: boolean
}

export interface TrackSelection {
  selectedIds: string[]
  toggle: (id: string, modifiers: SelectModifiers) => void
  selectAll: () => void
  invert: () => void
  clear: () => void
}

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

// File-manager semantics: click selects one row, Ctrl toggles a row, Shift extends from the anchor.
export function useTrackSelection(orderedIds: string[]): TrackSelection {
  const selectedIds = useMusic((state) => state.selectedIds)
  const toggleSelect = useMusic((state) => state.toggleSelect)
  const selectAllIds = useMusic((state) => state.selectAll)
  const invertSelection = useMusic((state) => state.invertSelection)
  const clearSelection = useMusic((state) => state.clearSelection)
  const anchorRef = useRef<string | null>(null)

  const toggle = useCallback((id: string, modifiers: SelectModifiers) => {
    if (modifiers.shift && anchorRef.current) {
      const merged = new Set([...selectedIds, ...rangeIds(orderedIds, anchorRef.current, id)])
      selectAllIds(orderedIds.filter((entry) => merged.has(entry)))
      return
    }
    anchorRef.current = id
    toggleSelect(id, modifiers.additive)
  }, [orderedIds, selectedIds, selectAllIds, toggleSelect])

  return useMemo(() => ({
    selectedIds,
    toggle,
    selectAll: () => selectAllIds(orderedIds),
    invert: () => invertSelection(orderedIds),
    clear: () => clearSelection(),
  }), [selectedIds, toggle, orderedIds, selectAllIds, invertSelection, clearSelection])
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
