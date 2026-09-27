import { preloadNext } from '../audio-engine'
import { providerStreamQuality } from '../music-utils'
import { nextTrackIndex } from './crossfade'
import type { MusicGet } from './types'

// The window the fade uses is only 3s — enough to start a ramp, not to download a
// stream — so the prefetch asks earlier and serves both advances, fade or plain.
const PRELOAD_AHEAD_MS = 15_000

// Driven by the same playback tick as the crossfade: once the next queue track is
// this close to its end, the engine parks its stream on the standby element. Ticks
// re-run the decision, so a queue edit re-points the preload by itself.
export function maybePreloadNext(get: MusicGet, ms: number): void {
  const state = get()
  // Repeat-one and "stop after this track" both promise the current track ends plainly.
  if (state.mode === 'repeat-one' || state.sleepAfterCurrentTrack) return
  const next = nextTrackIndex(state)
  if (next < 0) return
  const track = state.tracks.find((candidate) => candidate.id === state.queue[next])
  if (!track || !(track.durationMs > 0)) return
  // The browser would serve a repeat of the playing stream from cache, but the
  // request itself is pure waste, so the same-recording next stays unprefetched.
  if (track.id === state.queue[state.currentIndex]) return
  if (track.durationMs - ms > PRELOAD_AHEAD_MS) return
  preloadNext(track, providerStreamQuality(track, state.providerQuality))
}
