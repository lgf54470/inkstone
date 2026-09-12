import type { MusicTrack } from '@shared/types'
import { musicStreamUrl } from '../../lib/api'

export interface AudioBridge {
  onTime: (ms: number) => void
  onDuration: (ms: number) => void
  onEnded: () => void
  onPlayingChange: (playing: boolean) => void
  onBuffering: (buffering: boolean) => void
  onError: (code: string) => void
}

let element: HTMLAudioElement | null = null
let bridge: AudioBridge | null = null
let analyserContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let analyserElement: HTMLAudioElement | null = null
const ANALYSER_FFT_SIZE = 256
const ANALYSER_SMOOTHING = 0.82

export function configureAudio(next: AudioBridge): void {
  bridge = next
}

export function audioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null
  element ??= createAudioElement()
  return element
}

function createAudioElement(): HTMLAudioElement {
  const audio = new Audio()
  audio.preload = 'metadata'
  // Kept in the document so browsers that require a live node keep routing media keys.
  audio.setAttribute('data-inkstone-audio', 'music')
  audio.hidden = true
  document.body.append(audio)
  audio.addEventListener('timeupdate', () => bridge?.onTime(audio.currentTime * 1000))
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration)) bridge?.onDuration(audio.duration * 1000)
  })
  audio.addEventListener('ended', () => bridge?.onEnded())
  audio.addEventListener('play', () => bridge?.onPlayingChange(true))
  audio.addEventListener('waiting', () => bridge?.onBuffering(true))
  audio.addEventListener('stalled', () => bridge?.onBuffering(true))
  audio.addEventListener('playing', () => bridge?.onBuffering(false))
  audio.addEventListener('pause', () => bridge?.onPlayingChange(false))
  audio.addEventListener('error', () => bridge?.onError(readMediaError(audio)))
  return audio
}

function readMediaError(audio: HTMLAudioElement): string {
  const code = audio.error?.code
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'network'
  if (code === MediaError.MEDIA_ERR_DECODE) return 'decode'
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'unsupported'
  return 'unknown'
}

export async function startPlayback(track: MusicTrack): Promise<'playing' | 'blocked' | 'unavailable'> {
  const audio = audioElement()
  if (!audio) return 'unavailable'
  const src = musicStreamUrl(track.id)
  if (!audio.src.endsWith(src)) audio.src = src
  try {
    await audio.play()
    return 'playing'
  } catch (error) {
    if ((error as Error).name === 'NotAllowedError') return 'blocked'
    return 'unavailable'
  }
}

export function pausePlayback(): void {
  audioElement()?.pause()
}

export function resumePlayback(): Promise<'playing' | 'blocked' | 'unavailable'> {
  const audio = audioElement()
  if (!audio || !audio.src) return Promise.resolve('unavailable')
  return audio.play().then(() => 'playing' as const).catch(() => 'blocked' as const)
}

export function seekTo(ms: number): void {
  const audio = audioElement()
  if (!audio) return
  audio.currentTime = Math.max(0, ms / 1000)
}

export function applyVolume(volume: number, muted: boolean): void {
  const audio = audioElement()
  if (!audio) return
  audio.volume = Math.min(1, Math.max(0, volume))
  audio.muted = muted
}

export function stopPlayback(): void {
  const audio = audioElement()
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

export function publishMediaSession(track: MusicTrack | null, playing: boolean): void {
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

export function bindMediaSessionActions(handlers: {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
}): void {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!session?.setActionHandler) return
  const entries: Array<[MediaSessionAction, () => void]> = [
    ['play', handlers.play],
    ['pause', handlers.pause],
    ['nexttrack', handlers.next],
    ['previoustrack', handlers.prev],
  ]
  for (const [action, handler] of entries) {
    try {
      session.setActionHandler(action, handler)
    } catch (error) {
      console.warn('[inkstone] media session action unsupported:', action, error)
    }
  }
}

export function readCurrentTimeMs(): number {
  return (audioElement()?.currentTime ?? 0) * 1000
}

// Routing the element through a suspended context would silence playback, so the graph is only
// built once the browser lets audio run; callers get null until then and retry on the next play.
export async function ensureAudioAnalyser(): Promise<AnalyserNode | null> {
  const audio = audioElement()
  if (!audio || typeof AudioContext !== 'function') return null
  const context = analyserContext ?? new AudioContext()
  analyserContext = context
  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch (error) {
      console.warn('[inkstone] audio analyser could not start:', error)
      return null
    }
  }
  if (context.state !== 'running') return null
  if (analyserElement === audio && analyserNode) return analyserNode
  const node = context.createAnalyser()
  node.fftSize = ANALYSER_FFT_SIZE
  node.smoothingTimeConstant = ANALYSER_SMOOTHING
  context.createMediaElementSource(audio).connect(node)
  node.connect(context.destination)
  analyserNode = node
  analyserElement = audio
  return node
}