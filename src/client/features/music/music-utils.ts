import { ACCENTS } from '@shared/constants'
import type { MusicPlayMode, MusicTag } from '@shared/types'

const PLAY_MODES: MusicPlayMode[] = ['order', 'repeat-all', 'repeat-one', 'shuffle']

export function nextPlayMode(mode: MusicPlayMode): MusicPlayMode {
  const index = PLAY_MODES.indexOf(mode)
  return PLAY_MODES[(index + 1) % PLAY_MODES.length]!
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatTotalDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function computeNextIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  if (mode === 'repeat-one') return currentIndex
  if (mode === 'shuffle') return length > 1 ? randomOtherIndex(currentIndex, length) : currentIndex
  const next = currentIndex + 1
  if (next < length) return next
  return mode === 'repeat-all' ? 0 : -1
}

export function computePrevIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  if (mode === 'shuffle') return length > 1 ? randomOtherIndex(currentIndex, length) : currentIndex
  const prev = currentIndex - 1
  if (prev >= 0) return prev
  return mode === 'repeat-all' ? length - 1 : 0
}

function randomOtherIndex(currentIndex: number, length: number): number {
  const draw = Math.floor(Math.random() * (length - 1))
  return draw >= currentIndex ? draw + 1 : draw
}

export interface LyricLine {
  timeMs: number
  text: string
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLyric(lrc: string | null | undefined): LyricLine[] {
  if (!lrc) return []
  const out: LyricLine[] = []
  for (const rawLine of lrc.split(/\r?\n/)) {
    const text = rawLine.replace(LRC_TIME, '').trim()
    if (!text) continue
    LRC_TIME.lastIndex = 0
    let match = LRC_TIME.exec(rawLine)
    while (match) {
      out.push({ timeMs: lrcTimestamp(match[1]!, match[2]!, match[3]), text })
      match = LRC_TIME.exec(rawLine)
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs)
  return out
}

function lrcTimestamp(minutes: string, seconds: string, fraction: string | undefined): number {
  const ms = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms
}

export function activeLyricIndex(lines: LyricLine[], timeMs: number): number {
  if (!lines.length) return -1
  let low = 0
  let high = lines.length - 1
  let answer = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid]!.timeMs <= timeMs) {
      answer = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return answer
}

// Shift-click selects everything between the anchor row and the clicked row.
export function rangeIds(ordered: string[], fromId: string, toId: string): string[] {
  const to = ordered.indexOf(toId)
  if (to < 0) return []
  const from = ordered.indexOf(fromId)
  if (from < 0) return [ordered[to]!]
  return ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
}

// Uploads name a track after its file; the tag title wins when the file only adds the artist.
export function isArtistSuffixedTitle(current: string, title: string, artist: string): boolean {
  if (!title || current === title) return false
  if (!current.startsWith(title)) return false
  const suffix = current.slice(title.length).trimStart()
  if (!suffix.startsWith('-')) return false
  const tail = suffix.slice(1).trim()
  return tail.length > 0 && (!artist || tail === artist)
}

export function collectTagIds(tagId: string, tags: MusicTag[]): Set<string> {
  const ids = new Set<string>([tagId])
  let grew = true
  while (grew) {
    grew = false
    for (const tag of tags) {
      if (tag.parentId && ids.has(tag.parentId) && !ids.has(tag.id)) {
        ids.add(tag.id)
        grew = true
      }
    }
  }
  return ids
}

export const MUSIC_TAG_COLORS = ACCENTS.map((accent) => ({ name: accent.name, value: accent.swatch }))

export function tagColorValue(color: string | null | undefined, fallback = 'var(--text-quaternary)'): string {
  if (!color) return fallback
  const named = MUSIC_TAG_COLORS.find((entry) => entry.name === color)
  if (named) return named.value
  return /^(#|oklch\(|rgb\(|hsl\(|var\()/i.test(color) ? color : fallback
}

export interface FlatTag {
  tag: MusicTag
  depth: number
  hasChildren: boolean
}

export function flattenTags(tags: MusicTag[]): FlatTag[] {
  const children = new Map<string | null, MusicTag[]>()
  for (const tag of tags) {
    const parent = tag.parentId && tags.some((entry) => entry.id === tag.parentId) ? tag.parentId : null
    const bucket = children.get(parent)
    if (bucket) bucket.push(tag)
    else children.set(parent, [tag])
  }
  const out: FlatTag[] = []
  const walk = (parent: string | null, depth: number): void => {
    for (const tag of [...(children.get(parent) ?? [])].sort(compareTags)) {
      out.push({ tag, depth, hasChildren: (children.get(tag.id) ?? []).length > 0 })
      if (depth < 8) walk(tag.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function compareTags(a: MusicTag, b: MusicTag): number {
  return Number(b.isPinned) - Number(a.isPinned) || a.name.localeCompare(b.name)
}