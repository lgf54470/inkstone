import { useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import { mediaKindOfMime, type MediaKind } from '../../lib/music-media'
import type { BlogMusicLibrary, BlogMusicTag, BlogMusicTrack } from '../../lib/types'

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
// 每种媒体各留一只元素：库里既有纯音频轨也有片段，切换类型时释放另一只而不是重建
const elementsByKind = new Map<MediaKind, HTMLMediaElement>()
let mediaElement: HTMLMediaElement | null = null
let stageHost: HTMLElement | null = null
const ANALYSER_FFT_SIZE = 256
const ANALYSER_SMOOTHING = 0.82
let analyserContext: AudioContext | null = null
// 一只媒体元素只能接入音频图一次，所以频谱节点按元素缓存，不能全局共用一只
const analysers = new WeakMap<HTMLMediaElement, AnalyserNode>()
let corsBlocked = false
// 初始队列来自笔记应用；用户从队列之外点歌后，队列改回跟随当前筛选结果
let queueSeeded = false

/** 单例 store + 每类一只媒体元素：博客前台只需要一条播放通道，无需引入状态库 */
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

function activeMedia(): HTMLMediaElement | null {
  return ensureMedia(currentMusicTrack())
}

// 存储的 mime 决定用哪种元素承载：音频元素会直接拒绝带视频轨的容器，画面也只有真 <video> 才有
function ensureMedia(track: BlogMusicTrack | null): HTMLMediaElement | null {
  const kind = mediaKindOfMime(track?.mime)
  const existing = elementsByKind.get(kind)
  const element = existing ?? createMediaElement(kind)
  if (!element) return null
  const previous = mediaElement
  // 先交接活动元素再退休旧元素：旧元素自己的 pause 事件因此不会再改播放状态
  mediaElement = element
  if (previous && previous !== element) retireMedia(previous)
  placeOnStage(element)
  return element
}

function createMediaElement(kind: MediaKind): HTMLMediaElement | null {
  // Astro 预渲染与测试环境里不一定有这些构造器，缺谁就说谁承载不了
  if (kind === 'audio' && typeof Audio !== 'function') return null
  if (kind === 'video' && typeof document === 'undefined') return null
  const element = kind === 'video' ? createVideoElement() : new Audio()
  element.preload = 'metadata'
  element.volume = snapshot.volume
  element.playbackRate = snapshot.rate
  // 频谱分析要求跨域媒体带上 CORS 头，公开音乐接口对博客来源已放开
  element.crossOrigin = 'anonymous'
  // 保活到文档里，Safari 与媒体键只有在挂载的媒体元素上才稳定工作
  element.hidden = true
  if (typeof document !== 'undefined') document.body.appendChild(element)
  wireMediaEvents(element)
  elementsByKind.set(kind, element)
  return element
}

// 卡片自带传输控件，画面只需要被看见；playsInline 让移动端内联播放而不是跳到系统全屏播放器
function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video')
  video.playsInline = true
  return video
}

function retireMedia(media: HTMLMediaElement): void {
  media.pause()
  media.removeAttribute('src')
  media.load()
  // 退休的元素可能还留在某个舞台盒子里，那个容器随组件卸载会把它一起带出文档
  if (typeof document !== 'undefined') document.body.appendChild(media)
  media.hidden = true
}

// 画面住在展开卡片借出的盒子里；音频永不上台
function placeOnStage(media: HTMLMediaElement): void {
  if (typeof document === 'undefined') return
  const host = media instanceof HTMLVideoElement ? stageHost : null
  const target = host ?? document.body
  if (media.parentElement !== target) target.appendChild(media)
  media.hidden = target === document.body
}

/** 展开的卡片把封面位借给画面；同一时刻只有一个悬浮播放器，所以一只盒子即可 */
export function claimVideoStage(host: HTMLElement): () => void {
  stageHost = host
  if (mediaElement) placeOnStage(mediaElement)
  return () => {
    stageHost = null
    if (mediaElement) placeOnStage(mediaElement)
  }
}

function wireMediaEvents(element: HTMLMediaElement): void {
  // 每个监听都要求「自己仍是活动元素」：退休元素的 timeupdate 与 pause 不得移动快照
  const onActive = (type: string, handle: () => void): void => {
    element.addEventListener(type, () => {
      if (element === mediaElement) handle()
    })
  }
  onActive('timeupdate', () => setMusicState({ timeMs: element.currentTime * 1000 }))
  onActive('durationchange', () => {
    if (Number.isFinite(element.duration)) setMusicState({ durationMs: element.duration * 1000 })
  })
  onActive('play', () => setMusicState({ playing: true }))
  onActive('pause', () => setMusicState({ playing: false }))
  onActive('ended', handleTrackEnded)
  onActive('error', () => handleMediaError(element))
}

// 旧版接口的音频响应没有 CORS 头，带 crossOrigin 会整段加载失败：降级为普通加载并放弃频谱
function handleMediaError(element: HTMLMediaElement): void {
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
  const element = activeMedia()
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
    // 应用内队列作为博客的初始播放列表，本机已经选过曲时保持本地状态
    ...(snapshot.currentId ? {} : seedFromAppQueue(library)),
  })
}

/** 把笔记应用的播放队列投影成本地初始状态，已删除的曲目 id 直接丢弃 */
function seedFromAppQueue(library: BlogMusicLibrary): Partial<MusicPlayerSnapshot> {
  const known = new Set(library.tracks.map((track) => track.id))
  const queue = library.queue.ids.filter((id) => known.has(id))
  const currentId = library.queue.currentId && queue.includes(library.queue.currentId) ? library.queue.currentId : null
  const track = currentId ? library.tracks.find((entry) => entry.id === currentId) : undefined
  queueSeeded = queue.length > 0
  return { queue, currentId, timeMs: 0, durationMs: track?.durationMs ?? 0 }
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
  const element = track ? ensureMedia(track) : null
  if (!track) return
  // 应用队列仍在时点歌保留其顺序，否则按当前筛选结果重建
  const keepSeeded = queueSeeded && snapshot.queue.includes(id)
  if (!keepSeeded) queueSeeded = false
  const queue = keepSeeded ? snapshot.queue : visibleQueue(id)
  setMusicState({ currentId: id, queue, timeMs: 0, durationMs: track.durationMs, playing: Boolean(element) })
  if (!element) return
  if (!element.src.endsWith(track.streamUrl)) element.src = track.streamUrl
  void element.play().catch(() => setMusicState({ playing: false }))
}

export function togglePlay(): void {
  const element = activeMedia()
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
  const element = activeMedia()
  if (!element) return
  element.currentTime = Math.max(0, ms / 1000)
  setMusicState({ timeMs: Math.max(0, ms) })
}

export function setVolume(value: number): void {
  const volume = Math.min(1, Math.max(0, value))
  const element = activeMedia()
  if (element) {
    element.volume = volume
    element.muted = volume === 0
  }
  setMusicState({ volume, muted: volume === 0 })
}

export function toggleMute(): void {
  const muted = !snapshot.muted
  const element = activeMedia()
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
  const element = activeMedia()
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
  const element = activeMedia()
  if (!element || corsBlocked || typeof AudioContext !== 'function') return null
  const cached = analysers.get(element)
  if (cached) return cached
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
  const node = context.createAnalyser()
  node.fftSize = ANALYSER_FFT_SIZE
  node.smoothingTimeConstant = ANALYSER_SMOOTHING
  context.createMediaElementSource(element).connect(node)
  node.connect(context.destination)
  analysers.set(element, node)
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
