import { useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import type { BlogMusicTag, BlogMusicTrack } from '../../lib/types'

export type MusicStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

/** 播放模式与笔记应用保持一致，博客前台只在本地记住，不做持久化 */
export type MusicPlayMode = 'order' | 'repeat-all' | 'repeat-one' | 'shuffle'

export const MUSIC_PLAY_MODES: MusicPlayMode[] = ['order', 'repeat-all', 'repeat-one', 'shuffle']
export const MUSIC_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]
export const SEEK_STEP_MS = 10_000

export interface MusicPlayerSnapshot {
  status: MusicStatus
  tracks: BlogMusicTrack[]
  tags: BlogMusicTag[]
  currentId: string | null
  playing: boolean
  timeMs: number
  durationMs: number
  volume: number
  muted: boolean
  queue: string[]
  mode: MusicPlayMode
  rate: number
  floatPosition: { x: number; y: number } | null
  centerOpen: boolean
  expanded: boolean
  query: string
  tagId: string | null
}

const INITIAL_VOLUME = 0.8

let snapshot: MusicPlayerSnapshot = {
  status: 'idle',
  tracks: [],
  tags: [],
  currentId: null,
  playing: false,
  timeMs: 0,
  durationMs: 0,
  volume: INITIAL_VOLUME,
  muted: false,
  queue: [],
  mode: 'order',
  rate: 1,
  floatPosition: null,
  centerOpen: false,
  expanded: false,
  query: '',
  tagId: null,
}

const listeners = new Set<() => void>()
let audioElement: HTMLAudioElement | null = null
const ANALYSER_FFT_SIZE = 256
const ANALYSER_SMOOTHING = 0.82
let analyserContext: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let corsBlocked = false

/** 单例 store + 单个 audio 元素：博客前台只需要一条播放通道，无需引入状态库 */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function musicSnapshot(): MusicPlayerSnapshot {
  return snapshot
}

export function useMusicPlayer(): MusicPlayerSnapshot {
  return useSyncExternalStore(subscribeMusic, musicSnapshot, musicSnapshot)
}

function setMusicState(patch: Partial<MusicPlayerSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof Audio !== 'function') return null
  if (audioElement) return audioElement
  const element = new Audio()
  element.preload = 'metadata'
  element.volume = snapshot.volume
  element.playbackRate = snapshot.rate
  // 频谱分析要求跨域媒体带上 CORS 头，公开音乐接口对博客来源已放开
  element.crossOrigin = 'anonymous'
  // 保活到文档里，Safari 与媒体键只有在挂载的媒体元素上才稳定工作
  element.hidden = true
  if (typeof document !== 'undefined') document.body.appendChild(element)
  element.addEventListener('timeupdate', () => setMusicState({ timeMs: element.currentTime * 1000 }))
  element.addEventListener('durationchange', () => {
    if (Number.isFinite(element.duration)) setMusicState({ durationMs: element.duration * 1000 })
  })
  element.addEventListener('play', () => setMusicState({ playing: true }))
  element.addEventListener('pause', () => setMusicState({ playing: false }))
  element.addEventListener('ended', handleTrackEnded)
  element.addEventListener('error', () => handleMediaError(element))
  audioElement = element
  return element
}

// 旧版接口的音频响应没有 CORS 头，带 crossOrigin 会整段加载失败：降级为普通加载并放弃频谱
function handleMediaError(element: HTMLAudioElement): void {
  if (element.crossOrigin !== 'anonymous') return
  corsBlocked = true
  element.removeAttribute('crossorigin')
  const source = element.src
  if (!source) return
  element.src = source
  void element.play().catch(() => setMusicState({ playing: false }))
}

// 单曲循环在音频元素上重播，其余模式交给队列推进
function handleTrackEnded(): void {
  if (snapshot.mode === 'repeat-one') {
    replayCurrentTrack()
    return
  }
  playNext()
}

function replayCurrentTrack(): void {
  const element = ensureAudio()
  if (!element) return
  element.currentTime = 0
  setMusicState({ timeMs: 0 })
  void element.play().catch(() => setMusicState({ playing: false }))
}

export async function loadMusicLibrary(force = false): Promise<void> {
  if (!force && (snapshot.status === 'loading' || snapshot.status === 'ready')) return
  setMusicState({ status: 'loading' })
  const library = await api.getMusicLibrary()
  setMusicState({
    status: library.enabled && library.tracks.length > 0 ? 'ready' : 'unavailable',
    tracks: library.enabled ? library.tracks : [],
    tags: library.enabled ? library.tags : [],
  })
}

export function filterTracks(tracks: BlogMusicTrack[], query: string, tagId: string | null): BlogMusicTrack[] {
  const needle = query.trim().toLowerCase()
  return tracks.filter((track) => {
    if (tagId && !track.tagIds.includes(tagId)) return false
    if (!needle) return true
    return [track.title, track.artist, track.album].some((field) => field.toLowerCase().includes(needle))
  })
}

export function nextPlayMode(mode: MusicPlayMode): MusicPlayMode {
  return MUSIC_PLAY_MODES[(MUSIC_PLAY_MODES.indexOf(mode) + 1) % MUSIC_PLAY_MODES.length] ?? 'order'
}

export function nextPlaybackRate(rate: number): number {
  const index = MUSIC_PLAYBACK_RATES.indexOf(rate)
  return MUSIC_PLAYBACK_RATES[(index + 1) % MUSIC_PLAYBACK_RATES.length] ?? 1
}

export function computeNextQueueIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  if (mode === 'repeat-one') return currentIndex
  if (mode === 'shuffle') return randomOtherIndex(currentIndex, length)
  const next = currentIndex + 1
  if (next < length) return next
  return mode === 'repeat-all' ? 0 : -1
}

export function computePrevQueueIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  if (mode === 'shuffle') return randomOtherIndex(currentIndex, length)
  const prev = currentIndex - 1
  if (prev >= 0) return prev
  return mode === 'repeat-all' ? length - 1 : 0
}

function randomOtherIndex(currentIndex: number, length: number): number {
  if (length <= 1) return Math.max(0, currentIndex)
  const draw = Math.floor(Math.random() * (length - 1))
  return draw >= currentIndex ? draw + 1 : draw
}

export function formatMusicTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const seconds = Math.floor(ms / 1000)
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}

export function currentMusicTrack(state: MusicPlayerSnapshot = snapshot): BlogMusicTrack | null {
  return state.tracks.find((track) => track.id === state.currentId) ?? null
}

// 队列跟随当前筛选结果，保证「下一首」符合用户当下看到的列表
function visibleQueue(id: string): string[] {
  const visible = filterTracks(snapshot.tracks, snapshot.query, snapshot.tagId).map((track) => track.id)
  return visible.includes(id) ? visible : [id]
}

export function playTrack(id: string): void {
  const track = snapshot.tracks.find((entry) => entry.id === id)
  const element = track ? ensureAudio() : null
  if (!track) return
  setMusicState({ currentId: id, queue: visibleQueue(id), timeMs: 0, durationMs: track.durationMs, playing: Boolean(element) })
  if (!element) return
  if (!element.src.endsWith(track.streamUrl)) element.src = track.streamUrl
  void element.play().catch(() => setMusicState({ playing: false }))
}

export function togglePlay(): void {
  const element = ensureAudio()
  if (!element) return
  if (!snapshot.currentId) {
    const first = filterTracks(snapshot.tracks, snapshot.query, snapshot.tagId)[0]
    if (first) playTrack(first.id)
    return
  }
  if (element.paused) void element.play().catch(() => setMusicState({ playing: false }))
  else element.pause()
}

export function playNext(): void {
  playQueueOffset(1)
}

export function playPrevious(): void {
  playQueueOffset(-1)
}

function playQueueOffset(delta: 1 | -1): void {
  const length = snapshot.queue.length
  const current = snapshot.queue.indexOf(snapshot.currentId ?? '')
  const index = delta === 1
    ? computeNextQueueIndex(current, length, snapshot.mode)
    : computePrevQueueIndex(current, length, snapshot.mode)
  const id = index >= 0 ? snapshot.queue[index] : undefined
  if (id) playTrack(id)
}

export function seekTo(ms: number): void {
  const element = ensureAudio()
  if (!element) return
  element.currentTime = Math.max(0, ms / 1000)
  setMusicState({ timeMs: Math.max(0, ms) })
}

export function setVolume(value: number): void {
  const volume = Math.min(1, Math.max(0, value))
  const element = ensureAudio()
  if (element) {
    element.volume = volume
    element.muted = volume === 0
  }
  setMusicState({ volume, muted: volume === 0 })
}

export function toggleMute(): void {
  const muted = !snapshot.muted
  const element = ensureAudio()
  if (element) element.muted = muted
  setMusicState({ muted })
}

export function cycleMusicMode(): void {
  setMusicState({ mode: nextPlayMode(snapshot.mode) })
}

export function nudgeMusicSeek(deltaMs: number): void {
  const target = snapshot.timeMs + deltaMs
  seekTo(snapshot.durationMs > 0 ? Math.min(Math.max(0, target), snapshot.durationMs) : Math.max(0, target))
}

export function setMusicRate(rate: number): void {
  const element = ensureAudio()
  if (element) {
    element.playbackRate = rate
    element.preservesPitch = true
  }
  setMusicState({ rate })
}

export function setFloatPosition(position: { x: number; y: number } | null): void {
  setMusicState({ floatPosition: position })
}

// 媒体元素只能接入音频图一次；上下文未运行时返回 null，组件在下次播放时重试
export async function ensureMusicAnalyser(): Promise<AnalyserNode | null> {
  const element = ensureAudio()
  if (!element || corsBlocked || typeof AudioContext !== 'function') return null
  const context = analyserContext ?? new AudioContext()
  analyserContext = context
  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch {
      return null
    }
  }
  if (context.state !== 'running') return null
  if (analyserNode) return analyserNode
  const node = context.createAnalyser()
  node.fftSize = ANALYSER_FFT_SIZE
  node.smoothingTimeConstant = ANALYSER_SMOOTHING
  context.createMediaElementSource(element).connect(node)
  node.connect(context.destination)
  analyserNode = node
  return node
}

export function setMusicQuery(query: string): void {
  setMusicState({ query })
}

export function setMusicTag(tagId: string | null): void {
  setMusicState({ tagId })
}

export function openMusicCenter(): void {
  setMusicState({ centerOpen: true, expanded: false })
}

export function closeMusicCenter(): void {
  setMusicState({ centerOpen: false })
}

export function togglePlayerExpanded(): void {
  setMusicState({ expanded: !snapshot.expanded })
}

export function playAllVisible(): void {
  const first = filterTracks(snapshot.tracks, snapshot.query, snapshot.tagId)[0]
  if (first) playTrack(first.id)
}
