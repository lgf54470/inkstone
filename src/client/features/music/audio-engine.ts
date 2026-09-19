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

export interface EqualizerSettings {
  enabled: boolean
  lowDb: number
  midDb: number
  highDb: number
}

let element: HTMLAudioElement | null = null
let bridge: AudioBridge | null = null
let analyserContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let analyserElement: HTMLAudioElement | null = null
let suspendTimer: number | null = null
let eqNodes: BiquadFilterNode[] = []
let equalizer: EqualizerSettings = { enabled: false, lowDb: 0, midDb: 0, highDb: 0 }
let normalizeEnabled = false
let normGainNode: GainNode | null = null
let normTap: AnalyserNode | null = null
let normPollTimer: number | null = null
let normGainDb = 0
const ANALYSER_FFT_SIZE = 256
const ANALYSER_SMOOTHING = 0.82
// ReplayGain approximation: RMS toward this level, judged on the pre-EQ element signal so
// the user's own volume is factored out. RMS is not LUFS — see the documented limitation.
const NORM_TARGET_DBFS = -16
const NORM_MAX_GAIN_DB = 12
const NORM_SILENCE_DBFS = -60
const NORM_POLL_MS = 500
const NORM_SMOOTHING = 0.25
const NORM_TAP_FFT_SIZE = 2_048
// A three-band shelf/peak chain covers bass, voice and treble shaping without the
// node count of a graphic EQ; the fixed corners are the usual audible crossover points.
const EQ_BANDS: Array<{ type: BiquadFilterType; frequencyHz: number; q?: number }> = [
  { type: 'lowshelf', frequencyHz: 180 },
  { type: 'peaking', frequencyHz: 1_000, q: 1 },
  { type: 'highshelf', frequencyHz: 4_500 },
]
// Suspend a little after the pause instead of at it: transport taps and track changes
// resume within this window and must not churn the audio hardware.
const PAUSE_SUSPEND_DELAY_MS = 5_000

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
  audio.addEventListener('play', () => {
    resumeAnalyserContext()
    // The play gesture is the retry window for a graph the browser blocked earlier.
    if (equalizer.enabled || normalizeEnabled) void ensureAudioGraph()
    startLoudnessPolling()
    bridge?.onPlayingChange(true)
  })
  audio.addEventListener('waiting', () => bridge?.onBuffering(true))
  audio.addEventListener('stalled', () => bridge?.onBuffering(true))
  audio.addEventListener('playing', () => bridge?.onBuffering(false))
  audio.addEventListener('pause', () => {
    scheduleAnalyserSuspend()
    stopLoudnessPolling()
    bridge?.onPlayingChange(false)
  })
  audio.addEventListener('error', () => bridge?.onError(readMediaError(audio)))
  return audio
}

function scheduleAnalyserSuspend(): void {
  if (!analyserContext) return
  if (suspendTimer !== null) window.clearTimeout(suspendTimer)
  suspendTimer = window.setTimeout(() => {
    suspendTimer = null
    void analyserContext?.suspend().catch((error: unknown) => {
      console.warn('[inkstone] audio analyser could not suspend:', error)
    })
  }, PAUSE_SUSPEND_DELAY_MS)
}

function resumeAnalyserContext(): void {
  if (suspendTimer !== null) {
    window.clearTimeout(suspendTimer)
    suspendTimer = null
  }
  if (analyserContext?.state === 'suspended') {
    void analyserContext.resume().catch((error: unknown) => {
      console.warn('[inkstone] audio analyser could not resume:', error)
    })
  }
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

// Lock-screen and car-kit progress bars are built from positionState and committed
// through seekto; without them the scrubber is dead even though metadata shows.
export function updateMediaSessionPosition(positionMs: number, durationMs: number): void {
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!session?.setPositionState || !(durationMs > 0) || !(positionMs >= 0)) return
  const duration = durationMs / 1000
  // The browser rejects a position past the end, and in-flight ticks can outrun a shrinking duration.
  const position = Math.min(positionMs / 1000, duration)
  try {
    session.setPositionState({ duration, position, playbackRate: audioElement()?.playbackRate ?? 1 })
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

export function readCurrentTimeMs(): number {
  return (audioElement()?.currentTime ?? 0) * 1000
}

// Routing the element through a suspended context would silence playback, so the graph is only
// built once the browser lets audio run; callers get null until then and retry on the next play.
export async function ensureAudioGraph(): Promise<AnalyserNode | null> {
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
  eqNodes = createEqualizerFilters(context)
  const first = eqNodes[0] ?? node
  normGainNode = context.createGain()
  const source = context.createMediaElementSource(audio)
  // The gain sits before the EQ so the loudness tap below measures the file's own
  // signal, not the user's volume or the EQ colouring layered on top of it.
  source.connect(normGainNode)
  normGainNode.connect(first)
  normTap = context.createAnalyser()
  normTap.fftSize = NORM_TAP_FFT_SIZE
  source.connect(normTap)
  for (let index = 0; index < eqNodes.length; index += 1) {
    eqNodes[index]?.connect(eqNodes[index + 1] ?? node)
  }
  node.connect(context.destination)
  analyserNode = node
  analyserElement = audio
  applyEqualizerToGraph()
  return node
}

function createEqualizerFilters(context: AudioContext): BiquadFilterNode[] {
  return EQ_BANDS.map((band) => {
    const filter = context.createBiquadFilter()
    filter.type = band.type
    filter.frequency.value = band.frequencyHz
    if (band.q !== undefined) filter.Q.value = band.q
    return filter
  })
}

// Stored first so a graph built later (or rebuilt after a page change) picks up the
// current sound; a disabled EQ keeps every band at 0 dB instead of tearing the chain down.
export function configureEqualizer(next: EqualizerSettings): void {
  equalizer = next
  applyEqualizerToGraph()
}

function applyEqualizerToGraph(): void {
  if (!eqNodes.length) return
  const gains = equalizer.enabled ? [equalizer.lowDb, equalizer.midDb, equalizer.highDb] : EQ_BANDS.map(() => 0)
  eqNodes.forEach((filter, index) => {
    filter.gain.value = gains[index] ?? 0
  })
}

// Turning normalization off hands the level back to the user's volume immediately;
// the graph itself stays because the element source can only ever be attached once.
export function configureLoudnessNormalization(enabled: boolean): void {
  normalizeEnabled = enabled
  if (!enabled) {
    normGainDb = 0
    applyLoudnessGain()
    stopLoudnessPolling()
    return
  }
  const audio = element
  if (audio && !audio.paused) startLoudnessPolling()
}

function startLoudnessPolling(): void {
  if (!normalizeEnabled || normPollTimer !== null) return
  normPollTimer = window.setInterval(runLoudnessTick, NORM_POLL_MS)
}

function stopLoudnessPolling(): void {
  if (normPollTimer === null) return
  window.clearInterval(normPollTimer)
  normPollTimer = null
}

function runLoudnessTick(): void {
  const audio = element
  if (!normGainNode || !normTap || !audio) return
  if (audio.muted || audio.volume <= 0) return
  const measured = readLoudnessDbfs(normTap, audio.volume)
  if (measured === null || measured < NORM_SILENCE_DBFS) return
  const desired = Math.min(NORM_MAX_GAIN_DB, Math.max(-NORM_MAX_GAIN_DB, NORM_TARGET_DBFS - measured))
  normGainDb += (desired - normGainDb) * NORM_SMOOTHING
  applyLoudnessGain()
}

// The tap sees the signal after the element's own volume, so dividing that back out
// keeps the gain decision about the file, not about where the user set the slider.
function readLoudnessDbfs(tap: AnalyserNode, volume: number): number | null {
  const bytes = new Uint8Array(tap.fftSize)
  tap.getByteTimeDomainData(bytes)
  let sum = 0
  for (const byte of bytes) {
    const sample = (byte - 128) / 128 / volume
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / bytes.length)
  if (rms <= 0) return null
  return 20 * Math.log10(rms)
}

function linearGainFromDb(db: number): number {
  return 10 ** (db / 20)
}

function applyLoudnessGain(): void {
  if (!normGainNode) return
  normGainNode.gain.value = linearGainFromDb(normGainDb)
}