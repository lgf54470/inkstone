import type { MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { toastMusicError, toastMusicNotice } from '../music-feedback'
import { computeNextIndex, computePrevIndex, nextPlayMode } from '../music-utils'
import {
  applyVolume, audioElement, bindMediaSessionActions, configureAudio, configureEqualizer, configureLoudnessNormalization,
  ensureAudioGraph, pausePlayback, publishMediaSession,
  resumePlayback, seekTo, startPlayback, updateMediaSessionPosition,
} from '../audio-engine'
import type { EqualizerSettings } from '../audio-engine'
import { loadLibrary, visibleTracks } from './library-load'
import { progressTimeMs, setProgressTime } from './progress'
import { loadPreferences, readEqDb, savePreferences } from './state'
import type { MusicEqBand, MusicGet, MusicSet, MusicStoreState } from './types'

const STREAM_START_TIMEOUT_MS = 20_000
const RESUME_THRESHOLD_MS = 1_000
const MAX_CONSECUTIVE_PLAY_FAILURES = 3

export function connectAudio(set: MusicSet, get: MusicGet): void {
  // The engine holds the last known settings so a graph built later (or after a
  // browser-blocked start) picks up the stored sound without a store subscription.
  const prefs = loadPreferences()
  configureEqualizer(readEqualizer(prefs))
  configureLoudnessNormalization(prefs.normalizeEnabled)
  configureAudio({
    onTime: (ms) => {
      setProgressTime(ms)
      updateMediaSessionPosition(ms, get().durationMs)
    },
    onDuration: (ms) => {
      set({ durationMs: ms })
      recordLearnedDuration(get, ms)
    },
    onEnded: () => void handleEnded(set, get),
    onPlayingChange: (playing) => {
      set({ isPlaying: playing, streamLoading: playing ? get().streamLoading : false })
      publishMediaSession(currentTrack(get()), playing)
    },
    onBuffering: (buffering) => {
      set({ streamLoading: buffering })
      if (buffering) armStreamWatchdog(set, get)
      else clearStreamWatchdog()
    },
    onError: (code) => void handlePlaybackFailure(set, get, code === 'network' || code === 'unknown' ? 'auto' : 'failed'),
  })
  bindMediaSessionActions({
    play: () => void get().togglePlay(),
    pause: pausePlayback,
    next: () => void get().playNext(),
    prev: () => void get().playPrevious(),
    seek: (ms) => seek(ms),
  })
}

// Imported tracks can arrive without a duration; the decoder knows it once played.
function recordLearnedDuration(get: MusicGet, ms: number): void {
  const track = currentTrack(get())
  if (!track || track.durationMs > 0 || !Number.isFinite(ms) || ms < 1_000) return
  void get().patchTrack(track.id, { durationMs: Math.round(ms) })
}

export function currentTrack(state: MusicStoreState): MusicTrack | null {
  const id = state.queue[state.currentIndex]
  if (!id) return null
  return state.tracks.find((track) => track.id === id) ?? null
}

export async function playTrack(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  playFailures = 0
  set({ queue: [id], currentIndex: 0, durationMs: 0 })
  setProgressTime(0)
  await loadAndPlay(set, get)
}

export async function playCollection(set: MusicSet, get: MusicGet, ids: string[], startIndex = 0): Promise<void> {
  if (!ids.length) return
  playFailures = 0
  const index = Math.max(0, Math.min(startIndex, ids.length - 1))
  set({ queue: ids, currentIndex: index, durationMs: 0 })
  setProgressTime(0)
  await loadAndPlay(set, get)
}

export async function playQueueAt(set: MusicSet, get: MusicGet, index: number): Promise<void> {
  if (index < 0 || index >= get().queue.length) return
  set({ currentIndex: index, durationMs: 0 })
  setProgressTime(0)
  await loadAndPlay(set, get)
}

export async function togglePlay(set: MusicSet, get: MusicGet): Promise<void> {
  const audio = audioElement()
  if (!audio) return
  if (!currentTrack(get())) {
    await playFirstTrack(set, get)
    return
  }
  if (!audio.src) {
    await loadAndPlay(set, get)
    return
  }
  if (audio.paused) {
    set({ streamLoading: true })
    const outcome = await resumePlayback()
    set({ streamLoading: false, isPlaying: outcome === 'playing' })
    return
  }
  pausePlayback()
}

// The hub loads the library lazily, so the transport has to fetch it itself
// rather than dropping the click on an empty store.
async function playFirstTrack(set: MusicSet, get: MusicGet): Promise<void> {
  if (!get().tracks.length) await loadLibrary(set, get)
  const failure = get().loadError
  if (failure && !get().tracks.length) {
    toastMusicError(new Error(failure), 'music.load_failed')
    return
  }
  const first = visibleTracks(get())[0]
  if (!first) {
    toastMusicNotice('music.no_tracks')
    return
  }
  await playTrack(set, get, first.id)
}

export async function playNext(set: MusicSet, get: MusicGet): Promise<void> {
  const { queue, currentIndex, mode } = get()
  const next = computeNextIndex(currentIndex, queue.length, mode)
  if (next < 0) {
    pausePlayback()
    return
  }
  await playQueueAt(set, get, next)
}

export async function playPrevious(set: MusicSet, get: MusicGet): Promise<void> {
  const { queue, currentIndex, mode } = get()
  const previous = computePrevIndex(currentIndex, queue.length, mode)
  if (previous < 0) return
  await playQueueAt(set, get, previous)
}

export function seek(ms: number): void {
  seekTo(ms)
  setProgressTime(ms)
}

export function setPlaybackRate(set: MusicSet, get: MusicGet, rate: number): void {
  set({ playbackRate: rate })
  applyPlaybackRate(rate)
  persist(get)
}

export function setSleepTimer(set: MusicSet, get: MusicGet, minutes: number | null): void {
  clearSleepTimer(get)
  if (minutes === null || minutes <= 0) {
    set({ sleepEndsAt: null, sleepAfterCurrentTrack: false })
    return
  }
  const endsAt = Date.now() + minutes * 60_000
  set({ sleepEndsAt: endsAt, sleepAfterCurrentTrack: false })
  persist(get)
  armSleepTimer(set, get, endsAt)
}

// The two sleep modes are exclusive: the minute timer counts wall time, this
// one waits for the playing track to reach its end.
export function setSleepAfterCurrentTrack(set: MusicSet, get: MusicGet, enabled: boolean): void {
  if (!enabled) {
    set({ sleepAfterCurrentTrack: false })
    persist(get)
    return
  }
  clearSleepTimer(get)
  set({ sleepAfterCurrentTrack: true, sleepEndsAt: null })
  persist(get)
}

export function resumeSleepTimer(set: MusicSet, get: MusicGet): void {
  const endsAt = get().sleepEndsAt
  if (endsAt === null) return
  if (endsAt <= Date.now()) {
    set({ sleepEndsAt: null })
    persist(get)
    return
  }
  armSleepTimer(set, get, endsAt)
}

function armSleepTimer(set: MusicSet, get: MusicGet, endsAt: number): void {
  void endsAt
  sleepTimer = window.setInterval(() => {
    const ends = get().sleepEndsAt
    if (ends === null) return
    if (Date.now() < ends) return
    clearSleepTimer(get)
    set({ sleepEndsAt: null })
    persist(get)
    pausePlayback()
  }, 1000)
}

let sleepTimer: number | null = null

function clearSleepTimer(get: MusicGet): void {
  void get
  if (sleepTimer !== null) {
    window.clearInterval(sleepTimer)
    sleepTimer = null
  }
}

export function setImmersive(set: MusicSet, immersive: boolean): void {
  set({ immersive })
}

export function toggleFloatingCollapsed(set: MusicSet, get: MusicGet): void {
  set({ floatingCollapsed: !get().floatingCollapsed })
  persist(get)
}

export function setVolume(set: MusicSet, get: MusicGet, volume: number): void {
  const next = Math.min(1, Math.max(0, volume))
  set({ volume: next, muted: next > 0 ? false : get().muted })
  applyVolume(next, get().muted)
  persist(get)
}

export function toggleMute(set: MusicSet, get: MusicGet): void {
  const muted = !get().muted
  set({ muted })
  applyVolume(get().volume, muted)
  persist(get)
}

export function cycleMode(set: MusicSet, get: MusicGet): void {
  set({ mode: nextPlayMode(get().mode) })
  persist(get)
}

export function setEqEnabled(set: MusicSet, get: MusicGet, enabled: boolean): void {
  set({ eqEnabled: enabled })
  applyEqualizer(get())
  // Enabling during playback is a user gesture, the one moment a blocked audio graph may start.
  if (enabled) void ensureAudioGraph()
  persist(get)
}

export function setEqBand(set: MusicSet, get: MusicGet, band: MusicEqBand, db: number): void {
  const value = readEqDb(db)
  if (band === 'low') set({ eqLowDb: value })
  else if (band === 'mid') set({ eqMidDb: value })
  else set({ eqHighDb: value })
  applyEqualizer(get())
  persist(get)
}

export function setNormalizeEnabled(set: MusicSet, get: MusicGet, enabled: boolean): void {
  set({ normalizeEnabled: enabled })
  configureLoudnessNormalization(enabled)
  // Enabling during playback is a user gesture, the one moment a blocked audio graph may start.
  if (enabled) void ensureAudioGraph()
  persist(get)
}

function readEqualizer(state: Pick<MusicStoreState, 'eqEnabled' | 'eqLowDb' | 'eqMidDb' | 'eqHighDb'>): EqualizerSettings {
  return { enabled: state.eqEnabled, lowDb: state.eqLowDb, midDb: state.eqMidDb, highDb: state.eqHighDb }
}

function applyEqualizer(state: MusicStoreState): void {
  configureEqualizer(readEqualizer(state))
}

export function toggleFloating(set: MusicSet, get: MusicGet): void {
  set({ floatingVisible: !get().floatingVisible })
  persist(get)
}

export function setFloatingPosition(set: MusicSet, get: MusicGet, position: { x: number; y: number }): void {
  set({ floatingPosition: position })
  persist(get)
}

async function loadAndPlay(set: MusicSet, get: MusicGet): Promise<void> {
  const track = currentTrack(get())
  if (!track) return
  const resumeMs = Math.round(progressTimeMs())
  set({ streamLoading: true, durationMs: track.durationMs })
  streamFailedReported = false
  applyVolume(get().volume, get().muted)
  applyPlaybackRate(get().playbackRate)
  persist(get)
  const outcome = await startPlayback(track)
  publishMediaSession(track, outcome === 'playing')
  if (outcome !== 'playing') {
    await handlePlaybackFailure(set, get, 'auto')
    return
  }
  playFailures = 0
  set({ isPlaying: true })
  if (resumeMs > RESUME_THRESHOLD_MS) {
    seekTo(resumeMs)
    setProgressTime(resumeMs)
  }
  armStreamWatchdog(set, get)
  void api.music.countPlay(track.id).catch((error: unknown) => {
    console.warn('[inkstone] play count failed:', error)
  })
}

export async function handleEnded(set: MusicSet, get: MusicGet): Promise<void> {
  // Stopping after this track wins over repeat-one: a looping track would
  // otherwise never give the sleeper its cue.
  if (get().sleepAfterCurrentTrack) {
    set({ sleepAfterCurrentTrack: false })
    persist(get)
    pausePlayback()
    return
  }
  if (get().mode === 'repeat-one') {
    seekTo(0)
    await resumePlayback()
    return
  }
  await playNext(set, get)
}

// Both the media error event and the stall watchdog can fire for one attempt,
// and they race: one reporter keeps the user from getting two messages, and
// the loser of that race must not also trigger a second auto-advance.
function reportPlaybackFailure(set: MusicSet, get: MusicGet, kind: 'slow' | 'failed' | 'auto'): boolean {
  if (streamFailedReported) return false
  streamFailedReported = true
  clearStreamWatchdog()
  const audio = audioElement()
  const buffered = audio !== null && audio.readyState >= 3 && Number.isFinite(audio.duration)
  pausePlayback()
  set({ streamLoading: false, isPlaying: false })
  publishMediaSession(currentTrack(get()), false)
  if (kind === 'slow' || (kind === 'auto' && !buffered)) toastMusicNotice('music.playback_slow')
  else toastMusicError(null, 'music.action_failed')
  return true
}

// A broken file mid-playlist must not end the session, but an unbounded skip
// chain would burn the whole queue on a network outage, hence the breaker.
async function handlePlaybackFailure(set: MusicSet, get: MusicGet, kind: 'slow' | 'failed' | 'auto'): Promise<void> {
  if (!reportPlaybackFailure(set, get, kind)) return
  playFailures += 1
  if (playFailures >= MAX_CONSECUTIVE_PLAY_FAILURES) {
    toastMusicError(null, 'music.playback_repeated_failures')
    return
  }
  if (get().mode === 'repeat-one') return
  await playNext(set, get)
}

// A slow WebDAV object streams below realtime, so waiting for the first frame
// forever would look like a frozen player. Surface it and stop pretending.
function armStreamWatchdog(set: MusicSet, get: MusicGet): void {
  clearStreamWatchdog()
  streamWatchdog = window.setTimeout(() => {
    streamWatchdog = null
    if (!get().streamLoading) return
    void handlePlaybackFailure(set, get, 'slow')
  }, STREAM_START_TIMEOUT_MS)
}

function clearStreamWatchdog(): void {
  if (streamWatchdog === null) return
  window.clearTimeout(streamWatchdog)
  streamWatchdog = null
}

let streamWatchdog: number | null = null
let streamFailedReported = false
let playFailures = 0

function applyPlaybackRate(rate: number): void {
  const audio = audioElement()
  if (!audio) return
  audio.playbackRate = rate
  audio.preservesPitch = true
}

const PREFS_WRITE_DEBOUNCE_MS = 250

let prefsWriteTimer: number | null = null
let persistGet: MusicGet | null = null

// Volume drags and queue churn used to serialise and write localStorage per event.
function persist(get: MusicGet): void {
  persistGet = get
  if (prefsWriteTimer !== null) window.clearTimeout(prefsWriteTimer)
  prefsWriteTimer = window.setTimeout(() => {
    prefsWriteTimer = null
    writePreferences(get)
  }, PREFS_WRITE_DEBOUNCE_MS)
}

// A tab closed inside the debounce window must not silently lose the last change.
function flushPendingPreferences(): void {
  if (prefsWriteTimer === null || !persistGet) return
  window.clearTimeout(prefsWriteTimer)
  prefsWriteTimer = null
  writePreferences(persistGet)
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPendingPreferences)

function writePreferences(get: MusicGet): void {
  const state = get()
  savePreferences({
    volume: state.volume,
    muted: state.muted,
    mode: state.mode,
    sort: state.sort,
    sortDirection: state.sortDirection,
    viewMode: state.viewMode,
    sourceFilter: state.sourceFilter,
    floatingVisible: state.floatingVisible,
    floatingCollapsed: state.floatingCollapsed,
    floatingPosition: state.floatingPosition,
    sleepEndsAt: state.sleepEndsAt,
    sleepAfterCurrentTrack: state.sleepAfterCurrentTrack,
    playbackRate: state.playbackRate,
    searchHistory: state.searchHistory,
    eqEnabled: state.eqEnabled,
    eqLowDb: state.eqLowDb,
    eqMidDb: state.eqMidDb,
    eqHighDb: state.eqHighDb,
    normalizeEnabled: state.normalizeEnabled,
  })
}