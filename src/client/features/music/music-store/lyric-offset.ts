import { toastMusicNotice } from '../music-feedback'
import { persist } from './persist'
import { LYRIC_OFFSET_MAX_TRACKS, clampLyricOffset } from './state'
import type { MusicGet, MusicSet } from './types'

// Lyrics and audio drift apart by a fraction of a second on some rips; the
// calibration is kept per track so fixing one does not move the rest.
export function nudgeLyricOffset(set: MusicSet, get: MusicGet, trackId: string, deltaMs: number): void {
  const offset = clampLyricOffset((get().lyricOffsets[trackId] ?? 0) + deltaMs)
  writeLyricOffset(set, get, trackId, offset)
}

export function resetLyricOffset(set: MusicSet, get: MusicGet, trackId: string): void {
  writeLyricOffset(set, get, trackId, 0)
}

function writeLyricOffset(set: MusicSet, get: MusicGet, trackId: string, offset: number): void {
  if (!trackId) return
  const offsets = { ...get().lyricOffsets }
  // The map lives in localStorage, so it holds a bounded number of calibrations:
  // a new track past the bound is refused out loud, existing ones stay adjustable.
  if (!(trackId in offsets) && Object.keys(offsets).length >= LYRIC_OFFSET_MAX_TRACKS) {
    if (offset !== 0) toastMusicNotice('music.lyric_offset_full')
    return
  }
  // Back in sync is the default, so the map only holds tracks that were moved.
  if (offset === 0) delete offsets[trackId]
  else offsets[trackId] = offset
  set({ lyricOffsets: offsets })
  persist(get)
}
