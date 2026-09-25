import { ACCENTS, LIMITS } from '@shared/constants'
import type { MessageKey } from '../../lib/i18n'
import type { MusicPlaylistDetail, MusicPlayMode, MusicTag, MusicTrack } from '@shared/types'

const PLAY_MODES: MusicPlayMode[] = ['order', 'repeat-all', 'repeat-one', 'shuffle']

// Per-track network bursts (bulk upload/download/import/scan) stay pipelined but bounded:
// enough to overlap latency, low enough to avoid hammering the worker or the browser's per-host cap.
export const TRACK_IO_CONCURRENCY = 4

// Cover matching asks a public catalogue once per coverless track. Those calls are fast but
// plentiful, so they overlap through a small pool instead of waiting for each other in turn.
export const COVER_LOOKUP_CONCURRENCY = 4

// Below this viewport width the music surfaces' fixed-width side columns squeeze the main area
// toward zero, so they fold (UI-14): the hub into drawers, the immersive player into a stack.
export const MUSIC_NARROW_BREAKPOINT = 900

// Three silences look alike but are not: nothing is playing, the words are still on their
// way, and the file really carries none. Every lyrics pane answers with the same one.
export function lyricsEmptyKey(playing: boolean, pending: boolean): MessageKey {
  if (!playing) return 'music.nothing_playing'
  return pending ? 'music.lyrics_loading' : 'music.no_lyrics'
}

export function lyricsPending(track: Pick<MusicTrack, 'hasLyric' | 'lyric'> | null | undefined): boolean {
  return Boolean(track && track.hasLyric && track.lyric === null)
}

export function nextPlayMode(mode: MusicPlayMode): MusicPlayMode {
  const index = PLAY_MODES.indexOf(mode)
  return PLAY_MODES[(index + 1) % PLAY_MODES.length]!
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

// The transport nudge buttons and the seek hotkeys move by the same amount.
export const SEEK_STEP_MS = 10_000

export function seekTargetMs(currentMs: number, durationMs: number, deltaMs: number): number {
  const target = currentMs + deltaMs
  return Math.max(0, durationMs > 0 ? Math.min(target, durationMs) : target)
}

// Mirrors the worker's resolver so folder picks (which carry cover art, cue sheets and
// other noise) only queue files the server will accept, and nothing wastes a round trip
// it would reject. Empty files count as unsupported rather than vanishing.
const UPLOAD_EXTENSIONS = new Set(['mp3', 'm4a', 'mp4', 'flac', 'wav', 'wave', 'ogg', 'oga', 'opus', 'aac', 'webm', 'mov', 'm4v'])

// The file choosers promise the very containers the pre-check accepts, derived from that set so
// the two cannot drift. `audio/*,video/*` looked friendlier but offered kinds the upload skipped.
export const UPLOAD_ACCEPT = [...UPLOAD_EXTENSIONS].map((extension) => '.' + extension).join(',')

export interface UploadPartition {
  accepted: File[]
  unsupported: number
  tooLarge: number
}

export function partitionUploadableFiles(files: File[]): UploadPartition {
  const accepted: File[] = []
  let unsupported = 0
  let tooLarge = 0
  for (const file of files) {
    const dot = file.name.lastIndexOf('.')
    const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
    if (!UPLOAD_EXTENSIONS.has(extension) || file.size === 0) unsupported += 1
    else if (file.size > LIMITS.musicTrackMaxBytes) tooLarge += 1
    else accepted.push(file)
  }
  return { accepted, unsupported, tooLarge }
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

// A playlist's cover is derived, not stored: the first item (in the user's manual
// order) whose track carries a cover. Empty playlist or coverless library → no cover.
export function playlistCoverUrl(playlist: MusicPlaylistDetail, tracks: MusicTrack[]): string | null {
  const byId = new Map(tracks.map((track) => [track.id, track]))
  for (const item of playlist.items) {
    const cover = byId.get(item.trackId)?.coverUrl
    if (cover) return cover
  }
  return null
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
const CONTENT_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

export function downloadFileName(track: MusicTrack): string {
  const base = [track.artist.trim(), track.title.trim()].filter(Boolean).join(' - ')
  const safe = base.replace(/[\\/:*?"<>|]/g, '_').trim() || 'track'
  return safe + extensionFor(track)
}

function extensionFor(track: MusicTrack): string {
  return '.' + (track.format ?? CONTENT_EXTENSIONS[track.mime] ?? 'mp3')
}
