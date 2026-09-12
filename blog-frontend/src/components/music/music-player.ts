import { useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import type { BlogMusicTag, BlogMusicTrack } from '../../lib/types'

export type MusicStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

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
  centerOpen: false,
  expanded: false,
  query: '',
  tagId: null,
}

const listeners = new Set<() => void>()
let audioElement: HTMLAudioElement | null = null

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
  element.addEventListener('timeupdate', () => setMusicState({ timeMs: element.currentTime * 1000 }))
  element.addEventListener('durationchange', () => {
    if (Number.isFinite(element.duration)) setMusicState({ durationMs: element.duration * 1000 })
  })
  element.addEventListener('play', () => setMusicState({ playing: true }))
  element.addEventListener('pause', () => setMusicState({ playing: false }))
  element.addEventListener('ended', () => playNext())
  audioElement = element
  return element
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

export function stepIndex(length: number, current: number, delta: number): number {
  if (length <= 0) return -1
  if (current < 0) return delta >= 0 ? 0 : length - 1
  return (current + delta + length) % length
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
  const nextId = snapshot.queue[stepIndex(snapshot.queue.length, snapshot.queue.indexOf(snapshot.currentId ?? ''), 1)]
  if (nextId) playTrack(nextId)
}

export function playPrevious(): void {
  const previousId = snapshot.queue[stepIndex(snapshot.queue.length, snapshot.queue.indexOf(snapshot.currentId ?? ''), -1)]
  if (previousId) playTrack(previousId)
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
