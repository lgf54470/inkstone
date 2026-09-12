import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import type { MusicGet, MusicSet } from './types'

const SAVE_THROTTLE_MS = 5_000
const POSITION_STEP_MS = 4_000

let saveTimer: number | null = null

export async function restorePlayback(set: MusicSet, get: MusicGet): Promise<void> {
  try {
    const { playback } = await api.music.playback()
    if (!playback || !playback.queue.length) return
    const known = new Map(playback.tracks.map((track) => [track.id, track]))
    const queue = playback.queue.filter((id) => known.has(id))
    if (!queue.length) return
    const currentIndex = Math.max(0, Math.min(playback.currentIndex, queue.length - 1))
    const current = known.get(queue[currentIndex] ?? '') ?? null
    set({
      tracks: mergeTracks(get().tracks, playback.tracks),
      queue,
      currentIndex,
      currentTimeMs: Math.min(playback.positionMs, current?.durationMs ?? playback.positionMs),
      durationMs: current?.durationMs ?? 0,
    })
  } catch (error) {
    console.warn('[inkstone] music playback restore failed:', error)
  }
}

export async function savePlayback(get: MusicGet): Promise<void> {
  const state = get()
  const queue = state.queue.slice(0, LIMITS.musicPlaylistItemsMax)
  await api.music.savePlayback({
    queue,
    currentIndex: Math.max(0, Math.min(state.currentIndex, Math.max(0, queue.length - 1))),
    positionMs: Math.max(0, Math.round(state.currentTimeMs)),
  })
}

export function schedulePlaybackSave(get: MusicGet): void {
  if (saveTimer !== null) return
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void savePlayback(get).catch((error: unknown) => {
      console.warn('[inkstone] music playback save failed:', error)
    })
  }, SAVE_THROTTLE_MS)
}

interface PlaybackSnapshot {
  queue: string[]
  currentIndex: number
  currentTimeMs: number
}

export function hasPlaybackChanged(state: PlaybackSnapshot, previous: PlaybackSnapshot): boolean {
  if (state.queue !== previous.queue || state.currentIndex !== previous.currentIndex) return true
  return Math.abs(state.currentTimeMs - previous.currentTimeMs) > POSITION_STEP_MS
}

function mergeTracks(existing: MusicTrack[], restored: MusicTrack[]): MusicTrack[] {
  const byId = new Map(existing.map((track) => [track.id, track]))
  for (const track of restored) if (!byId.has(track.id)) byId.set(track.id, track)
  return [...byId.values()]
}
