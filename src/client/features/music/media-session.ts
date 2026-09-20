import type { MusicTrack } from '@shared/types'

// The lock-screen / car-kit surface is a separate concern from playback: it only ever reads
// what the engine already knows and writes into navigator.mediaSession, so the engine stays
// free to host the media elements themselves.

// The lock screen only ever reads these four fields, so that is what it asks for: a caller
// holding a partial track can publish it without fabricating the rest of one.
export type MediaSessionTrack = Pick<MusicTrack, 'title' | 'artist' | 'album' | 'coverUrl'>

export function publishMediaSession(track: MediaSessionTrack | null, playing: boolean): void {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!session) return
  try {
    session.metadata = track && typeof MediaMetadata === 'function'
      ? new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.coverUrl ? [{ src: track.coverUrl }] : undefined,
      })
      : null
    session.playbackState = playing ? 'playing' : 'paused'
  } catch (error) {
    console.warn('[inkstone] media session metadata rejected:', error)
  }
}

// Lock-screen and car-kit progress bars are built from positionState and committed
// through seekto; without them the scrubber is dead even though metadata shows.
export function updateMediaSessionPosition(
  positionMs: number,
  durationMs: number,
  playbackRate: number,
): void {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!session?.setPositionState || !(durationMs > 0) || !(positionMs >= 0)) return
  const duration = durationMs / 1000
  // The browser rejects a position past the end, and in-flight ticks can outrun a shrinking duration.
  const position = Math.min(positionMs / 1000, duration)
  try {
    session.setPositionState({ duration, position, playbackRate })
  } catch (error) {
    console.warn('[inkstone] media session position rejected:', error)
  }
}

export function bindMediaSessionActions(handlers: {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (ms: number) => void
}): void {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!session?.setActionHandler) return
  const entries: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', handlers.play],
    ['pause', handlers.pause],
    ['nexttrack', handlers.next],
    ['previoustrack', handlers.prev],
    ['seekto', (details) => {
      if (details.seekTime === undefined) return
      handlers.seek(details.seekTime * 1000)
    }],
  ]
  for (const [action, handler] of entries) {
    try {
      session.setActionHandler(action, handler)
    } catch (error) {
      console.warn('[inkstone] media session action unsupported:', action, error)
    }
  }
}
