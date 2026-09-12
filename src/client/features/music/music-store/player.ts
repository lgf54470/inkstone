import type { MusicTrack } from '@shared/types'
import { api } from '../../../lib/api'
import { toastMusicError, toastMusicNotice } from '../music-feedback'
import { computeNextIndex, computePrevIndex, nextPlayMode } from '../music-utils'
import {
  applyVolume, audioElement, bindMediaSessionActions, configureAudio, pausePlayback,
  publishMediaSession, resumePlayback, seekTo, startPlayback,
} from '../audio-engine'
import { loadLibrary, visibleTracks } from './library-load'
import { pushRecent, savePreferences } from './state'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

const STREAM_START_TIMEOUT_MS = 20_000
const RESUME_THRESHOLD_MS = 1_000

export function connectAudio(set: MusicSet, get: MusicGet): void {
  configureAudio({
    onTime: (ms) => set({ currentTimeMs: ms }),
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
    onError: (code) => reportPlaybackFailure(set, get, code === 'network' || code === 'unknown' ? 'auto' : 'failed'),
  })
  bindMediaSessionActions({
    play: () => void get().togglePlay(),
    pause: pausePlayback,
    next: () => void get().playNext(),
    prev: () => void get().playPrevious(),
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
  set({ queue: [id], currentIndex: 0, currentTimeMs: 0, durationMs: 0 })
  await loadAndPlay(set, get)
}

export async function playCollection(set: MusicSet, get: MusicGet, ids: string[], startIndex = 0): Promise<void> {
  if (!ids.length) return
  const index = Math.max(0, Math.min(startIndex, ids.length - 1))
  set({ queue: ids, currentIndex: index, currentTimeMs: 0, durationMs: 0 })
  await loadAndPlay(set, get)
}

export async function playQueueAt(set: MusicSet, get: MusicGet, index: number): Promise<void> {
  if (index < 0 || index >= get().queue.length) return
  set({ currentIndex: index, currentTimeMs: 0, durationMs: 0 })
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
  if (!get().tracks.length) await loadLibrary(set)
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

export function seek(set: MusicSet, ms: number): void {
  seekTo(ms)
  set({ currentTimeMs: ms })
}

export function setPlaybackRate(set: MusicSet, get: MusicGet, rate: number): void {
  set({ playbackRate: rate })
  applyPlaybackRate(rate)
  persist(get)
}

export function setSleepTimer(set: MusicSet, get: MusicGet, minutes: number | null): void {
  clearSleepTimer(get)
  if (minutes === null || minutes <= 0) {
    set({ sleepEndsAt: null })
    return
  }
  const endsAt = Date.now() + minutes * 60_000
  set({ sleepEndsAt: endsAt })
  persist(get)
  armSleepTimer(set, get, endsAt)
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

export function addToQueue(set: MusicSet, get: MusicGet, id: string, next = false): void {
  const { queue, currentIndex } = get()
  if (!queue.length) {
    set({ queue: [id], currentIndex: 0 })
    return
  }
  const deduped = queue.filter((entry) => entry !== id)
  if (next) {
    deduped.splice(Math.min(currentIndex + 1, deduped.length), 0, id)
    set({ queue: deduped })
    return
  }
  set({ queue: [...deduped, id] })
}

export function removeFromQueue(set: MusicSet, get: MusicGet, index: number): void {
  const { queue, currentIndex } = get()
  if (index < 0 || index >= queue.length) return
  const nextQueue = queue.filter((_entry, position) => position !== index)
  const nextIndex = index < currentIndex ? currentIndex - 1 : currentIndex
  set({ queue: nextQueue, currentIndex: Math.max(0, Math.min(nextIndex, nextQueue.length - 1)) })
}

export function clearQueue(set: MusicSet): void {
  pausePlayback()
  set({ queue: [], currentIndex: 0, isPlaying: false, currentTimeMs: 0, durationMs: 0 })
  publishMediaSession(null, false)
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
  const resumeMs = Math.round(get().currentTimeMs)
  set({ streamLoading: true, durationMs: track.durationMs })
  streamFailedReported = false
  applyVolume(get().volume, get().muted)
  applyPlaybackRate(get().playbackRate)
  set({ recentIds: pushRecent(get().recentIds, track.id) })
  persist(get)
  const outcome = await startPlayback(track)
  publishMediaSession(track, outcome === 'playing')
  if (outcome !== 'playing') {
    reportPlaybackFailure(set, get, 'auto')
    return
  }
  set({ isPlaying: true })
  if (resumeMs > RESUME_THRESHOLD_MS) {
    seekTo(resumeMs)
    set({ currentTimeMs: resumeMs })
  }
  armStreamWatchdog(set, get)
  void api.music.countPlay(track.id).catch((error: unknown) => {
    console.warn('[inkstone] play count failed:', error)
  })
}

async function handleEnded(set: MusicSet, get: MusicGet): Promise<void> {
  if (get().mode === 'repeat-one') {
    seekTo(0)
    await resumePlayback()
    return
  }
  await playNext(set, get)
}

// Both the media error event and the stall watchdog can fire for one attempt,
// and they race: one reporter keeps the user from getting two messages.
function reportPlaybackFailure(set: MusicSet, get: MusicGet, kind: 'slow' | 'failed' | 'auto'): void {
  if (streamFailedReported) return
  streamFailedReported = true
  clearStreamWatchdog()
  const audio = audioElement()
  const buffered = audio !== null && audio.readyState >= 3 && Number.isFinite(audio.duration)
  pausePlayback()
  set({ streamLoading: false, isPlaying: false })
  publishMediaSession(currentTrack(get()), false)
  if (kind === 'slow' || (kind === 'auto' && !buffered)) toastMusicNotice('music.playback_slow')
  else toastMusicError(null, 'music.action_failed')
}

// A slow WebDAV object streams below realtime, so waiting for the first frame
// forever would look like a frozen player. Surface it and stop pretending.
function armStreamWatchdog(set: MusicSet, get: MusicGet): void {
  clearStreamWatchdog()
  streamWatchdog = window.setTimeout(() => {
    streamWatchdog = null
    if (!get().streamLoading) return
    reportPlaybackFailure(set, get, 'slow')
  }, STREAM_START_TIMEOUT_MS)
}

function clearStreamWatchdog(): void {
  if (streamWatchdog === null) return
  window.clearTimeout(streamWatchdog)
  streamWatchdog = null
}

let streamWatchdog: number | null = null
let streamFailedReported = false

function applyPlaybackRate(rate: number): void {
  const audio = audioElement()
  if (!audio) return
  audio.playbackRate = rate
  audio.preservesPitch = true
}

function persist(get: MusicGet): void {
  const state = get()
  savePreferences({
    volume: state.volume,
    muted: state.muted,
    mode: state.mode,
    sort: state.sort,
    viewMode: state.viewMode,
    sourceFilter: state.sourceFilter,
    floatingVisible: state.floatingVisible,
    floatingCollapsed: state.floatingCollapsed,
    floatingPosition: state.floatingPosition,
    sleepEndsAt: state.sleepEndsAt,
    playbackRate: state.playbackRate,
    searchHistory: state.searchHistory,
    recentIds: state.recentIds,
  })
}