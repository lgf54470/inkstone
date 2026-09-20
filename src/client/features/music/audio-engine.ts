import type { MusicTrack } from '@shared/types'
import { isVideoMime } from '@shared/music-media'
import { musicStreamUrl } from '../../lib/api'
import { currentMediaStage, registerMediaStagePlacer } from './media-stage'

export interface AudioBridge {
  onTime: (ms: number) => void
  onDuration: (ms: number) => void
  onEnded: () => void
  onPlayingChange: (playing: boolean) => void
  onBuffering: (buffering: boolean) => void
  onError: (code: string) => void
  onCrossfadeComplete: (trackId: string) => void
}

export interface EqualizerSettings {
  enabled: boolean
  lowDb: number
  midDb: number
  highDb: number
}

// One WebAudio chain per element: a media element source can only ever be
// attached once, so each of the two alternating playback elements keeps its
// own gain/EQ/analyser set instead of rebuilding them at every swap.
interface AudioChain {
  analyser: AnalyserNode
  eqNodes: BiquadFilterNode[]
  normGain: GainNode
  normTap: AnalyserNode
  normDb: number
}

interface CrossfadeState {
  outgoing: HTMLMediaElement
  incoming: HTMLMediaElement
  trackId: string
  elapsed: number
  timer: number
}

// The stored mime decides which kind of element carries the track: an <audio> element
// refuses a container with a video track outright, and a picture needs a real <video>.
type MediaKind = 'audio' | 'video'

let element: HTMLMediaElement | null = null
let spareElement: HTMLMediaElement | null = null
let fade: CrossfadeState | null = null
let bridge: AudioBridge | null = null
let analyserContext: AudioContext | null = null
let activeChain: AudioChain | null = null
const chains = new WeakMap<HTMLMediaElement, AudioChain>()
const elementsByKind = new Map<MediaKind, HTMLMediaElement>()
const knownChains: AudioChain[] = []
let suspendTimer: number | null = null
let equalizer: EqualizerSettings = { enabled: false, lowDb: 0, midDb: 0, highDb: 0 }
let normalizeEnabled = false
let normPollTimer: number | null = null
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
export const CROSSFADE_MS = 3_000
const CROSSFADE_STEP_MS = 50
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

export function mediaElement(): HTMLMediaElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  element ??= acquireMediaElement('audio')
  return element
}

function kindOfTrack(track: MusicTrack): MediaKind {
  return isVideoMime(track.mime) ? 'video' : 'audio'
}

// The active element's kind is what the current track asked for; the standby element a
// crossfade borrows must be the same kind, so the pair never disagrees about the picture.
function kindOfElement(media: HTMLMediaElement): MediaKind {
  return media.getAttribute('data-inkstone-media') === 'video' ? 'video' : 'audio'
}

function createMediaElement(kind: MediaKind): HTMLMediaElement {
  const media: HTMLMediaElement = kind === 'video' ? createVideoElement() : new Audio()
  media.preload = 'metadata'
  // Kept in the document so browsers that require a live node keep routing media keys.
  media.setAttribute('data-inkstone-media', kind)
  // A video element stays hidden until the UI offers it a stage to be seen from.
  media.hidden = true
  document.body.append(media)
  elementsByKind.set(kind, media)
  relayBridgeEvents(media)
  wirePlaybackLifecycle(media)
  return media
}

// The browser's own transport controls on the element: a picture nobody can pause is
// worse than no picture, and native controls keep keyboard and screen-reader behaviour.
function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video')
  video.controls = true
  video.playsInline = true
  return video
}

function acquireMediaElement(kind: MediaKind): HTMLMediaElement {
  return elementsByKind.get(kind) ?? createMediaElement(kind)
}

// Only one element may hold the stream at a time: the previous kind is released before the
// next track loads, and its cached graph chain stays behind for when that kind comes back.
function setActiveElement(kind: MediaKind): HTMLMediaElement {
  // The element that is already playing decides: after a crossfade swapped to its standby,
  // the per-kind table would still name the element the fade handed over.
  if (element && kindOfElement(element) === kind) return element
  const next = acquireMediaElement(kind)
  const previous = element
  if (previous && previous !== next) {
    previous.pause()
    previous.removeAttribute('src')
    previous.load()
    // A retired element goes back to the engine's shelf: it may still sit in a surface's
    // container, and that container being unmounted would take the element out of the document.
    document.body.append(previous)
    previous.hidden = true
  }
  element = next
  placeOnStage(next)
  return next
}

// The picture lives wherever the topmost now-playing surface put its container; everything
// else about the element is unchanged, so seeking and the graph survive the move.
function placeOnStage(media: HTMLMediaElement): void {
  const host = kindOfElement(media) === 'video' ? currentMediaStage() : null
  const target = host ?? document.body
  if (media.parentElement !== target) target.append(media)
  media.hidden = target === document.body
}

registerMediaStagePlacer(() => {
  if (element) placeOnStage(element)
})

// Every listener is gated on being the active element: the standby element is live
// during a crossfade and its events must not drive progress, the bridge or the graph.
function onActiveElement(audio: HTMLMediaElement, event: string, handle: () => void): void {
  audio.addEventListener(event, () => {
    if (audio === element) handle()
  })
}

function relayBridgeEvents(audio: HTMLMediaElement): void {
  onActiveElement(audio, 'timeupdate', () => bridge?.onTime(audio.currentTime * 1000))
  onActiveElement(audio, 'durationchange', () => {
    if (Number.isFinite(audio.duration)) bridge?.onDuration(audio.duration * 1000)
  })
  // A crossfade starting right at the end must not also trigger the store's advance.
  audio.addEventListener('ended', () => {
    if (audio !== element || fade) return
    bridge?.onEnded()
  })
  onActiveElement(audio, 'waiting', () => bridge?.onBuffering(true))
  onActiveElement(audio, 'stalled', () => bridge?.onBuffering(true))
  onActiveElement(audio, 'playing', () => bridge?.onBuffering(false))
  onActiveElement(audio, 'error', () => bridge?.onError(readMediaError(audio)))
}

function wirePlaybackLifecycle(audio: HTMLMediaElement): void {
  onActiveElement(audio, 'play', () => {
    resumeAnalyserContext()
    // The play gesture is the retry window for a graph the browser blocked earlier.
    if (equalizer.enabled || normalizeEnabled) void ensureAudioGraph()
    startLoudnessPolling()
    bridge?.onPlayingChange(true)
  })
  onActiveElement(audio, 'pause', () => {
    scheduleAnalyserSuspend()
    stopLoudnessPolling()
    bridge?.onPlayingChange(false)
  })
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

function readMediaError(audio: HTMLMediaElement): string {
  const code = audio.error?.code
  if (code === MediaError.MEDIA_ERR_NETWORK) return 'network'
  if (code === MediaError.MEDIA_ERR_DECODE) return 'decode'
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return 'unsupported'
  return 'unknown'
}

export async function startPlayback(track: MusicTrack): Promise<'playing' | 'blocked' | 'unavailable'> {
  if (typeof document === 'undefined') return 'unavailable'
  cancelCrossfade()
  const audio = setActiveElement(kindOfTrack(track))
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
  cancelCrossfade()
  mediaElement()?.pause()
}

export function resumePlayback(): Promise<'playing' | 'blocked' | 'unavailable'> {
  const audio = mediaElement()
  if (!audio || !audio.src) return Promise.resolve('unavailable')
  return audio.play().then(() => 'playing' as const).catch(() => 'blocked' as const)
}

export function seekTo(ms: number): void {
  const audio = mediaElement()
  if (!audio) return
  audio.currentTime = Math.max(0, ms / 1000)
}

export function applyVolume(volume: number, muted: boolean): void {
  const audio = mediaElement()
  if (!audio) return
  audio.volume = Math.min(1, Math.max(0, volume))
  audio.muted = muted
}

export function stopPlayback(): void {
  const audio = mediaElement()
  if (!audio) return
  cancelCrossfade()
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

export function readCurrentTimeMs(): number {
  return (mediaElement()?.currentTime ?? 0) * 1000
}

// Routing the element through a suspended context would silence playback, so the graph is only
// built once the browser lets audio run; callers get null until then and retry on the next play.
// Each element keeps its own chain in a cache because createMediaElementSource can only ever be
// called once per element — the crossfade standby element gets its chain on the first swap.
export async function ensureAudioGraph(): Promise<AnalyserNode | null> {
  const audio = mediaElement()
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
  const cached = chains.get(audio)
  if (cached) {
    activeChain = cached
    return cached.analyser
  }
  const chain = buildAudioChain(context, audio)
  chains.set(audio, chain)
  knownChains.push(chain)
  activeChain = chain
  applyEqualizerToGraph()
  return chain.analyser
}

function buildAudioChain(context: AudioContext, audio: HTMLMediaElement): AudioChain {
  const analyser = context.createAnalyser()
  analyser.fftSize = ANALYSER_FFT_SIZE
  analyser.smoothingTimeConstant = ANALYSER_SMOOTHING
  const eqNodes = createEqualizerFilters(context)
  const normGain = context.createGain()
  const normTap = context.createAnalyser()
  normTap.fftSize = NORM_TAP_FFT_SIZE
  const source = context.createMediaElementSource(audio)
  // The gain sits before the EQ so the loudness tap below measures the file's own
  // signal, not the user's volume or the EQ colouring layered on top of it.
  source.connect(normGain)
  normGain.connect(eqNodes[0] ?? analyser)
  source.connect(normTap)
  for (let index = 0; index < eqNodes.length; index += 1) {
    eqNodes[index]?.connect(eqNodes[index + 1] ?? analyser)
  }
  analyser.connect(context.destination)
  return { analyser, eqNodes, normGain, normTap, normDb: 0 }
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
  const gains = equalizer.enabled ? [equalizer.lowDb, equalizer.midDb, equalizer.highDb] : EQ_BANDS.map(() => 0)
  for (const chain of knownChains) {
    chain.eqNodes.forEach((filter, index) => {
      filter.gain.value = gains[index] ?? 0
    })
  }
}

// Turning normalization off hands the level back to the user's volume immediately;
// the graph itself stays because the element source can only ever be attached once.
export function configureLoudnessNormalization(enabled: boolean): void {
  normalizeEnabled = enabled
  if (!enabled) {
    if (activeChain) {
      activeChain.normDb = 0
      applyLoudnessGain()
    }
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
  if (!activeChain || !audio || fade) return
  if (audio.muted || audio.volume <= 0) return
  const measured = readLoudnessDbfs(activeChain.normTap, audio.volume)
  if (measured === null || measured < NORM_SILENCE_DBFS) return
  const desired = Math.min(NORM_MAX_GAIN_DB, Math.max(-NORM_MAX_GAIN_DB, NORM_TARGET_DBFS - measured))
  activeChain.normDb += (desired - activeChain.normDb) * NORM_SMOOTHING
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
  if (!activeChain) return
  activeChain.normGain.gain.value = linearGainFromDb(activeChain.normDb)
}

export function crossfadeActive(): boolean {
  return fade !== null
}

// Plays the next track on the standby element while the current one fades out on the
// volume slider, absorbing any user volume change made mid-fade. Returns false when
// there is nothing to fade (no active element yet, or a fade already running).
export function startCrossfade(track: MusicTrack): boolean {
  const outgoing = element
  if (!outgoing || fade) return false
  // The ramp only blends sound: the standby element holds no picture slot, so a video
  // hand-over would still cut hard mid-fade. Video takes the plain track-end path.
  const kind = kindOfElement(outgoing)
  if (kind !== 'audio' || kindOfTrack(track) !== 'audio') return false
  const incoming = spareElement && kindOfElement(spareElement) === kind ? spareElement : createMediaElement(kind)
  spareElement = incoming
  incoming.volume = 0
  incoming.muted = outgoing.muted
  incoming.src = musicStreamUrl(track.id)
  fade = {
    outgoing, incoming, trackId: track.id, elapsed: 0,
    timer: window.setInterval(stepCrossfade, CROSSFADE_STEP_MS),
  }
  void incoming.play().catch(() => cancelCrossfade())
  return true
}

function stepCrossfade(): void {
  if (!fade) return
  const { outgoing, incoming } = fade
  fade.elapsed += CROSSFADE_STEP_MS
  const t = Math.min(1, fade.elapsed / CROSSFADE_MS)
  // The two sliders always sum back to where the user's volume stands, so a drag
  // during the fade is absorbed instead of being overwritten by the ramp.
  const userVolume = Math.min(1, Math.max(0, outgoing.volume + incoming.volume))
  outgoing.volume = userVolume * (1 - t)
  incoming.volume = userVolume * t
  incoming.muted = outgoing.muted
  if (t >= 1) completeCrossfade()
}

function completeCrossfade(): void {
  if (!fade) return
  const { outgoing, incoming, trackId } = fade
  window.clearInterval(fade.timer)
  fade = null
  const userVolume = Math.min(1, Math.max(0, outgoing.volume + incoming.volume))
  // Swap the active element before pausing the old one so its pause listener is gated
  // and cannot stop the polling or schedule a context suspend for the incoming audio.
  element = incoming
  spareElement = outgoing
  outgoing.pause()
  outgoing.removeAttribute('src')
  outgoing.load()
  incoming.volume = userVolume
  activeChain = chains.get(incoming) ?? null
  // The incoming element's own durationchange fired while it was still gated.
  if (Number.isFinite(incoming.duration)) bridge?.onDuration(incoming.duration * 1000)
  if (equalizer.enabled || normalizeEnabled) void ensureAudioGraph()
  startLoudnessPolling()
  bridge?.onCrossfadeComplete(trackId)
}

export function cancelCrossfade(): void {
  if (!fade) return
  const { outgoing, incoming } = fade
  window.clearInterval(fade.timer)
  fade = null
  const userVolume = Math.min(1, Math.max(0, outgoing.volume + incoming.volume))
  outgoing.volume = userVolume
  incoming.pause()
  incoming.removeAttribute('src')
  incoming.load()
  incoming.volume = 0
}