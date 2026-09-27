import { ACCENTS, LIMITS, type MusicProviderQuality } from '@shared/constants'
import { formatTimecode } from '../../lib/time'
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
// REF-7: the toolbar row needs about this much width to stay on one line; below it the
// low-frequency actions fold into the "more" menu. Measured on the row's own container,
// not on the viewport: the hub's centre column is ~760px even on a 1440px screen
// (hub 1240 − sidebar 224 − now playing 256), and a maximised hub gives it far more.
export const MUSIC_TOOLBAR_INLINE_MIN_WIDTH = 1040
// Only for environments without ResizeObserver (jsdom, SSR), where the viewport read is
// the sole width available; real browsers take the measured branch above.
export const MUSIC_TOOLBAR_VIEWPORT_FALLBACK = 1240
// FB-U2: below this measured width the row is a phone's centre column, where a fixed-width search
// box, two segmented rows and four labelled buttons wrapped into six lines. Measured on the running
// app (2026-09-27): 390px wide, header + toolbar 189px of an 844px screen, the toolbar alone 145px.
export const MUSIC_TOOLBAR_NARROW_MAX_WIDTH = 560
// FB-R3: what the list is worth at its smallest. The chrome folds before this is spent — the toolbar
// answers with its compact shape rather than a second row — and the browser gate reads this value
// back off the rendered element instead of repeating the number, so a floor that stops being drawn
// fails there rather than passing quietly.
export const MUSIC_CONTENT_MIN_HEIGHT = 160

// FB-U3: where the status bar's own controls join it, mirroring the classes on them in
// `music-status-bar.tsx` (`hidden md:flex` for the seek bar, `hidden lg:inline-flex` for the
// equalizer, `hidden xl:inline-flex` for the pin). The "more" entry answers for exactly the controls
// CSS has hidden at the width it is drawn at, so these two numbers and those two classes are one
// contract: the jsdom cases pin what the entry carries, the browser gate pins what CSS hides.
export const MUSIC_BAR_EQ_MIN_WIDTH = 1024
export const MUSIC_BAR_PIN_MIN_WIDTH = 1280

export interface MusicBarMore {
  pin: boolean
  eq: boolean
}

/**
 * What the status bar's "more" entry has to carry at a given width, or `null` when the bar already
 * draws everything itself — an entry onto an empty panel is worse than no entry at all.
 */
export function barMore({ eqInline, pinInline }: { eqInline: boolean; pinInline: boolean }): MusicBarMore | null {
  if (eqInline && pinInline) return null
  return { pin: !pinInline, eq: !eqInline }
}

// FB-R2: the two side columns are 224 + 256px of fixed width, so below this much hub there is
// nothing left for the list to live in. The number is read off the hub's own box rather than the
// viewport: the hub can be dragged narrow on a wide screen (and maximised on a small one), and the
// viewport never changes while it is — the columns used to keep squeezing the list in that case. It
// is deliberately the same number the immersive player folds at (MUSIC_NARROW_BREAKPOINT), so the
// surfaces fold together instead of each answering a breakpoint of its own.
export const MUSIC_HUB_COLUMNS_MIN_WIDTH = MUSIC_NARROW_BREAKPOINT

/**
 * Whether the hub's side columns fit the box the hub was given. `null` means nothing could be
 * measured (jsdom, SSR), where the viewport read is the only width there is — and there the answer
 * is the narrow one, because guessing a column that does not fit is how the list got crushed before.
 */
export function hubColumnsWide({ containerWidth, viewportWide }: {
  containerWidth: number | null
  viewportWide: boolean
}): boolean {
  const width = containerWidth ?? (viewportWide ? MUSIC_HUB_COLUMNS_MIN_WIDTH : 0)
  return width >= MUSIC_HUB_COLUMNS_MIN_WIDTH
}

// FB-U4: the table's artist / album / source columns need about this much room to be worth drawing.
// They used to answer a viewport query (`hidden xl:block`), which has nothing to do with the centre
// column they live in: at a 1440px screen that column is ~760px — the columns were drawn and the
// title was squeezed to fit them. The shared narrow breakpoint is deliberate: the hub folds its side
// columns at the same width, so a box that keeps the side columns still has a full row.
export const MUSIC_LIST_FULL_MIN_WIDTH = MUSIC_NARROW_BREAKPOINT

export type MusicListDensity = 'full' | 'compact'

// FB-R1: a narrow list is a phone's shape, and a phone browses covers rather than columns — but only
// until the reader says otherwise. The hub applies this while `viewModeChosen` is false; an explicit
// toggle (and a later resize) then leaves the choice alone.
export function defaultViewMode(density: MusicListDensity): 'list' | 'grid' {
  return density === 'compact' ? 'grid' : 'list'
}

/**
 * How much of a row the list can afford: the columns at `full`, or their own contents moved onto the
 * line under the title at `compact`. `null` is an unmeasurable environment (jsdom, and the paint
 * before the first ResizeObserver callback), where the viewport is the only width there is.
 */
export function listDensity({ containerWidth, viewportWide }: {
  containerWidth: number | null
  viewportWide: boolean
}): MusicListDensity {
  const width = containerWidth ?? (viewportWide ? MUSIC_LIST_FULL_MIN_WIDTH : 0)
  return width >= MUSIC_LIST_FULL_MIN_WIDTH ? 'full' : 'compact'
}

export interface MusicToolbarShape {
  /** Low-frequency actions live in the "more" menu rather than inline. */
  folded: boolean
  /** The two filters become dropdowns and the primary flows drop their labels. */
  compact: boolean
  /** The search box takes a row of its own. */
  stacked: boolean
}

// FB-U2 / FB-R3: one decision answers both squeezes, so the width answer and the height answer cannot
// disagree about how much of the row folds. The two are read separately because they are about
// different things: stacking is the answer to a narrow container (its controls cannot share a row —
// measured, at 390px the controls wrapped into three more lines, and stacking them is what turns that
// into two), while compacting is the answer to either squeeze, since a short viewport cannot afford
// the labels and the segmented rows that a narrow one cannot fit. Not stacking a narrow-and-short
// container is what the first draft did, and it wrapped into four lines — the height answer spending
// the height it was there to save.
export function toolbarShape({ containerWidth, viewportWide, shortViewport }: {
  containerWidth: number | null
  viewportWide: boolean
  shortViewport: boolean
}): MusicToolbarShape {
  // REF-7: the measured container decides, and an unmeasurable environment (jsdom) is read as the
  // narrow answer rather than a wide one — guessing a row that fits is how the fold went wrong before.
  const width = containerWidth ?? (viewportWide ? MUSIC_TOOLBAR_INLINE_MIN_WIDTH : MUSIC_TOOLBAR_NARROW_MAX_WIDTH - 1)
  const narrow = width < MUSIC_TOOLBAR_NARROW_MAX_WIDTH
  const compact = shortViewport || narrow
  return {
    folded: compact || width < MUSIC_TOOLBAR_INLINE_MIN_WIDTH,
    compact,
    stacked: narrow,
  }
}

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

// Shuffle does not step the queue directly — it walks the play order held by the
// store (music-shuffle.ts), so only the sequential modes answer here.
export function computeNextIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  if (mode === 'repeat-one') return currentIndex
  const next = currentIndex + 1
  if (next < length) return next
  return mode === 'repeat-all' ? 0 : -1
}

export function computePrevIndex(currentIndex: number, length: number, mode: MusicPlayMode): number {
  if (length <= 0) return -1
  const prev = currentIndex - 1
  if (prev >= 0) return prev
  return mode === 'repeat-all' ? length - 1 : 0
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
  // FEA-C3: the near-timestamp follower line a translation file adds; it scrolls,
  // highlights and seeks together with its main line.
  translation?: string
}

// A translation line lands within a beat of its source line — same timestamp in
// the common case, small jitter in hand-made files. Anything further apart is
// its own line, not a translation.
const TRANSLATION_MERGE_MS = 500

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
  return mergeTranslations(out)
}

// Greedy single pass: each line absorbs at most one near follower as its
// translation; identical repeats are absorbed silently (a held line, not a
// translation of itself).
function mergeTranslations(sorted: LyricLine[]): LyricLine[] {
  const merged: LyricLine[] = []
  for (const line of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && line.timeMs - previous.timeMs <= TRANSLATION_MERGE_MS && previous.translation === undefined) {
      if (line.text !== previous.text) previous.translation = line.text
      continue
    }
    merged.push(line)
  }
  return merged
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

// The lyric calibration reads as a signed shift: how far the lyrics sit from the audio.
export function formatLyricOffset(offsetMs: number): string {
  const seconds = offsetMs / 1000
  const sign = seconds > 0 ? '+' : ''
  return `${sign}${seconds}s`
}

// The sidebar badge for "recently played": a walk over the library, so callers
// memoize it on `tracks` rather than running it per store notification.
export function recentlyPlayedCount(tracks: readonly Pick<MusicTrack, 'lastPlayedAt'>[]): number {
  let count = 0
  for (const track of tracks) {
    if (track.lastPlayedAt !== null) count += 1
  }
  return count
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

// The playlist's own cover (FEA-D2) wins; otherwise the derived first item (in the
// user's manual order) whose track carries a cover. Coverless library → no cover.
export function playlistCoverUrl(playlist: MusicPlaylistDetail, tracks: MusicTrack[]): string | null {
  if (playlist.coverUrl) return playlist.coverUrl
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

// FB-F5: several online catalogues never report a length, and a numeric cell that draws 00:00 is
// stating something the catalogue did not. An unknown duration is a dash — the wide text surfaces
// name it in words, and the narrow cells carry the words in their accessible name.
export function durationCellText(durationMs: number): string {
  return durationMs > 0 ? formatTimecode(durationMs) : '—'
}

// FB-F7: the tier is a property of the resolver, not of the track — an uploaded file plays at
// whatever it was encoded with. Only reference rows ask the proxy for one, so the stream URL
// carries the parameter exactly for them.
export function providerStreamQuality(track: MusicTrack, providerQuality: MusicProviderQuality): MusicProviderQuality | undefined {
  return track.source === 'provider' ? providerQuality : undefined
}
