import { LIMITS } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { progressTimeMs, setProgressTime } from './progress'
import type { MusicGet, MusicSet } from './types'

const SAVE_THROTTLE_MS = 5_000
const POSITION_STEP_MS = 4_000

let saveTimer: number | null = null
let pendingFull = false

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
      durationMs: current?.durationMs ?? 0,
    })
    setProgressTime(Math.min(playback.positionMs, current?.durationMs ?? playback.positionMs))
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
    positionMs: Math.max(0, Math.round(progressTimeMs())),
  })
}

// The playhead moves every few seconds while the queue moves rarely, so a save is
// tagged with what actually changed: only a queue change pays for the queue body.
export async function savePosition(get: MusicGet): Promise<void> {
  const state = get()
  await api.music.savePlaybackPosition({
    currentIndex: Math.max(0, state.currentIndex),
    positionMs: Math.max(0, Math.round(progressTimeMs())),
  })
}

export function schedulePlaybackSave(get: MusicGet, full: boolean): void {
  pendingFull = pendingFull || full
  if (saveTimer !== null) return
  saveTimer = window.setTimeout(() => {
    const save = pendingFull ? savePlayback : savePosition
    pendingFull = false
    saveTimer = null
    void save(get).catch((error: unknown) => {
      console.warn('[inkstone] music playback save failed:', error)
    })
  }, SAVE_THROTTLE_MS)
}

interface PlaybackSnapshot {
  queue: string[]
  currentIndex: number
  currentTimeMs: number
}

export type PlaybackChange = 'none' | 'queue' | 'position'

export function playbackChange(state: PlaybackSnapshot, previous: PlaybackSnapshot, savedPositionMs: number): PlaybackChange {
  if (state.queue !== previous.queue || state.currentIndex !== previous.currentIndex) return 'queue'
  // Position is quantized against the last saved anchor, not the previous tick:
  // adjacent progress updates land ~250ms apart and would never cross the step.
  if (Math.abs(state.currentTimeMs - savedPositionMs) > POSITION_STEP_MS) return 'position'
  return 'none'
}

function mergeTracks(existing: MusicTrack[], restored: MusicTrack[]): MusicTrack[] {
  const byId = new Map(existing.map((track) => [track.id, track]))
  for (const track of restored) if (!byId.has(track.id)) byId.set(track.id, track)
  return [...byId.values()]
}
