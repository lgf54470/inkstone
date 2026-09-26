import { api } from '../../../lib/api'
import { CROSSFADE_MS, cancelCrossfade, crossfadeActive, startCrossfade } from '../audio-engine'
import { publishMediaSession } from '../media-session'
import { computeNextIndex } from '../music-utils'
import { orderAfterQueueSync, shuffleStep } from '../music-shuffle'
import { setProgressTime } from './progress'
import { persist } from './persist'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

// Driven by every playback tick: when the next track is one fade-length away and nothing
// argues for a hard stop, the engine takes over the ramp. The engine's own active fade is
// the single source of truth for "do not start a second one".
export function maybeStartCrossfade(get: MusicGet, ms: number): void {
  const state = get()
  if (!state.crossfadeEnabled || crossfadeActive()) return
  // Repeat-one and "stop after this track" both promise the current track ends plainly.
  if (state.mode === 'repeat-one' || state.sleepAfterCurrentTrack) return
  const next = nextTrackIndex(state)
  if (next < 0) return
  const track = state.tracks.find((candidate) => candidate.id === state.queue[next])
  if (!track || !(track.durationMs > 0)) return
  if (track.durationMs - ms > CROSSFADE_MS) return
  startCrossfade(track)
}

// Shuffle fades into the sequence's next track. A missing order means shuffle was
// armed but nothing dealt it yet; playNext deals it at the press, so skipping the
// fade for that one track keeps the two paths from choosing different songs.
function nextTrackIndex(state: Pick<MusicStoreState, 'queue' | 'currentIndex' | 'mode' | 'shuffleOrder'>): number {
  if (state.mode === 'shuffle') {
    const order = state.shuffleOrder
    return order ? shuffleStep(state.queue, state.queue[state.currentIndex] ?? null, order, 1) : -1
  }
  return computeNextIndex(state.currentIndex, state.queue.length, state.mode)
}

// The engine already handed audio over when this fires; the store only has to follow,
// which means adopting the track into the queue state without any reload or restart.
export function handleCrossfadeComplete(set: MusicSet, get: MusicGet, trackId: string): void {
  const state = get()
  const track = state.tracks.find((candidate) => candidate.id === trackId) ?? null
  const known = state.queue.indexOf(trackId)
  const queue = known >= 0 ? state.queue : [...state.queue, trackId]
  const currentIndex = known >= 0 ? known : queue.length - 1
  set({ queue, currentIndex, durationMs: track?.durationMs ?? state.durationMs, isPlaying: true, shuffleOrder: orderAfterQueueSync(state.mode, state.shuffleOrder, queue) })
  setProgressTime(0)
  if (!track) return
  publishMediaSession(track, true)
  void api.music.countPlay(track.id).catch((error: unknown) => {
    console.warn('[inkstone] play count failed:', error)
  })
}

export function setCrossfadeEnabled(set: MusicSet, get: MusicGet, enabled: boolean): void {
  set({ crossfadeEnabled: enabled })
  // Switching off mid-fade hands the ramp back: the outgoing element keeps playing
  // at the user's volume instead of fading into a track the user just opted out of.
  if (!enabled) cancelCrossfade()
  persist(get)
}
