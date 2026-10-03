import { infoFlag, infoOption, infoTokens } from './info-string'
import { normalizeCalloutType } from './obsidian'

/**
 * The header vocabulary shared by the `:::` panel family.
 *
 * A panel states everything about itself on its header line — the kind, then a few keywords — because
 * the header is the one line a settings toolbar can rewrite without touching the block's content. So
 * reading and writing it live here as a pair, and the block rule only splits bodies.
 *
 * The keyword set is deliberately closed: an unrecognised `::: whatever` is not claimed, so it keeps
 * rendering as the plain text it always did rather than silently becoming a container.
 */

export type AlignValue = 'left' | 'center' | 'right' | 'justify'
export type ColsGap = 'narrow' | 'normal' | 'wide'

const ALIGN_WORDS: Record<string, AlignValue> = {
  left: 'left',
  l: 'left',
  center: 'center',
  c: 'center',
  right: 'right',
  r: 'right',
  justify: 'justify',
  j: 'justify',
}

// The fence accepts the same callout vocabulary as `> [!…]`, plus the single-letter spellings the
// panel syntax has historically used. `primary` is the plain, uncoloured variant of `note`.
const CALLOUT_SHORTHAND: Record<string, string> = {
  p: 'primary',
  i: 'info',
  w: 'warning',
  d: 'danger',
  s: 'success',
}

const CALLOUT_WORDS = new Set([
  ...Object.keys(CALLOUT_SHORTHAND),
  'note', 'primary', 'abstract', 'tldr', 'summary', 'info', 'todo', 'tip', 'hint', 'important',
  'success', 'check', 'done', 'question', 'help', 'faq', 'warning', 'caution', 'attention',
  'failure', 'fail', 'missing', 'danger', 'error', 'bug', 'example', 'quote', 'cite',
])

const GAP_WORDS: Record<string, ColsGap> = {
  narrow: 'narrow',
  tight: 'narrow',
  normal: 'normal',
  cozy: 'normal',
  wide: 'wide',
  loose: 'wide',
}

// A column track is a plain fraction or percentage. Anything else is left alone, so a typo can never
// reach the stylesheet as a CSS value — the enhancer that writes the custom property re-checks it.
const TRACK_PATTERN = /^\d{1,2}(?:\.\d{1,2})?(?:fr|%)$/
export const MAX_PANEL_COLUMNS = 6

export interface ColsOptions {
  /** Explicit track sizes, already validated; `null` lets the column count pick equal tracks. */
  tracks: string | null
  /** A stated column count, which pads or merges the `::` separators to match. */
  fixedCount: number | null
  gap: ColsGap
  divider: boolean
  align: AlignValue | null
}

export const COLS_OPTION_DEFAULTS: ColsOptions = { tracks: null, fixedCount: null, gap: 'normal', divider: false, align: null }

export interface CalloutHeader {
  type: string
  title: string
  fold: '' | '+' | '-'
}

export interface PanelHeaderMatch {
  /** How many colons opened the block, which is how many must close it. */
  markerLength: number
  header: PanelHeader
  /** The header's remainder, which is where a tabs block reads its own options. */
  info: string
}

export type PanelHeader =
  | { kind: 'align'; align: AlignValue }
  | { kind: 'tabs' }
  | { kind: 'cols'; cols: ColsOptions }
  | { kind: 'timeline' }
  | { kind: 'callout'; callout: CalloutHeader }

/**
 * The kind word with an attached fold marker (`tip-`), which is how the callout family has always
 * spelled "starts collapsed". The marker is part of the word, not a separate token.
 */
function splitFold(word: string): { word: string; fold: '' | '+' | '-' } {
  const fold = word.endsWith('-') ? '-' : word.endsWith('+') ? '+' : ''
  return fold ? { word: word.slice(0, -1).toLowerCase(), fold } : { word: word.toLowerCase(), fold: '' }
}

function parseCallout(word: string, fold: '' | '+' | '-', rest: string): PanelHeader {
  const expanded = CALLOUT_SHORTHAND[word] ?? word
  const type = normalizeCalloutType(expanded === 'primary' ? 'note' : expanded)
  return { kind: 'callout', callout: { type, title: rest.trim(), fold } }
}

function parseTrackTokens(tokens: string[]): string | null {
  if (tokens.length < 2 || tokens.length > MAX_PANEL_COLUMNS) return null
  return tokens.every((token) => TRACK_PATTERN.test(token)) ? tokens.join(' ') : null
}

function parseCols(word: string, rest: string): PanelHeader {
  const legacyCount = /^([2-6])cols$/.exec(word)
  const options: ColsOptions = { ...COLS_OPTION_DEFAULTS, fixedCount: legacyCount ? Number(legacyCount[1]) : null }
  const tokens = infoTokens(rest)
  const tracks: string[] = []
  for (const token of tokens) {
    const option = infoOption(token)
    const flag = infoFlag(token)
    if (TRACK_PATTERN.test(flag)) {
      tracks.push(flag)
      continue
    }
    const align = ALIGN_WORDS[option?.key === 'align' ? option.value.toLowerCase() : flag]
    if (align) {
      options.align = align
      continue
    }
    const gap = GAP_WORDS[option?.key === 'gap' ? option.value.toLowerCase() : flag]
    if (gap) {
      options.gap = gap
      continue
    }
    if (flag === 'divider') {
      options.divider = true
      continue
    }
    if (option?.key === 'cols' && /^\d{1,2}$/.test(option.value)) {
      const count = Number(option.value)
      if (count >= 1 && count <= MAX_PANEL_COLUMNS) options.fixedCount = count
      continue
    }
    if (/^\d{1,2}$/.test(flag)) {
      const count = Number(flag)
      if (count >= 1 && count <= MAX_PANEL_COLUMNS) options.fixedCount = count
    }
  }
  options.tracks = parseTrackTokens(tracks)
  return { kind: 'cols', cols: options }
}

function resolvePanelHeader(keyword: string, rest: string): PanelHeader | null {
  const { word, fold } = splitFold(keyword)
  const align = ALIGN_WORDS[word]
  if (align) return { kind: 'align', align }
  if (word === 'tabs' || word === 't') return { kind: 'tabs' }
  if (word === 'timeline') return { kind: 'timeline' }
  if (word === 'cols' || /^[2-6]cols$/.test(word)) return parseCols(word, rest)
  if (CALLOUT_WORDS.has(word)) return parseCallout(word, fold, rest)
  return null
}

/**
 * The header line's colon count, kind and options — or null when the word is not one this family
 * claims, which leaves the line rendering as the plain text it always did.
 */
export function matchPanelHeader(source: string): PanelHeaderMatch | null {
  const match = /^(:{3,})[ \t]+([^\s{][^\n]*?)[ \t]*$/.exec(source)
  if (!match) return null
  const info = match[2]!
  const keyword = infoTokens(info)[0] ?? ''
  const rest = info.slice(keyword.length).trim()
  const header = resolvePanelHeader(keyword, rest)
  return header ? { markerLength: match[1]!.length, header, info: rest } : null
}

/** The tokens after the kind word, in the order the settings panel offers them; defaults are dropped. */
export function formatColsOptions(options: ColsOptions): string {
  const parts: string[] = []
  if (options.tracks) parts.push(options.tracks)
  else if (options.fixedCount && options.fixedCount !== 1) parts.push(String(options.fixedCount))
  if (options.gap !== COLS_OPTION_DEFAULTS.gap) parts.push(`gap=${options.gap}`)
  if (options.divider) parts.push('divider')
  if (options.align) parts.push(options.align)
  return parts.join(' ')
}

/** The header line for a column block, given the separator count it currently holds. */
export function formatColsHeader(options: ColsOptions, markerLength: number): string {
  const suffix = formatColsOptions(options)
  return suffix ? `${':'.repeat(markerLength)} cols ${suffix}` : `${':'.repeat(markerLength)} cols`
}

export type TimelineStatus = 'todo' | 'doing' | 'done' | 'milestone' | 'error'

const TIMELINE_STATUS_WORDS: Record<string, TimelineStatus> = {
  todo: 'todo',
  '': 'todo',
  doing: 'doing',
  '…': 'doing',
  '~': 'doing',
  wip: 'doing',
  done: 'done',
  '✓': 'done',
  x: 'done',
  milestone: 'milestone',
  '★': 'milestone',
  '*': 'milestone',
  error: 'error',
  err: 'error',
  '✗': 'error',
  '×': 'error',
  '!': 'error',
}

export interface TimelineItem {
  status: TimelineStatus
  /** The leading date-ish word, kept as written; empty when the node has none. */
  time: string
  title: string
}

/**
 * One node's first line: `[status] time title`. The time only counts as one when it starts with a
 * digit or a version prefix, so `:: 2024-01-15 Kickoff` splits but `:: Chapter one recap` keeps the
 * whole line as its title.
 */
export function parseTimelineItem(head: string): TimelineItem {
  const line = head.trim()
  const statusMatch = /^\[([^\]]*)\][ \t]*/.exec(line)
  const status = statusMatch ? TIMELINE_STATUS_WORDS[statusMatch[1]!.trim().toLowerCase()] ?? 'todo' : 'todo'
  const rest = statusMatch ? line.slice(statusMatch[0].length) : line
  const timeMatch = /^(\S+)(?:[ \t]+([\s\S]*))?$/.exec(rest.trim())
  const candidate = timeMatch?.[1] ?? ''
  const isTime = /^[\d]/.test(candidate) || /^v\d/i.test(candidate)
  return {
    status,
    time: isTime ? candidate : '',
    title: (isTime ? timeMatch?.[2] ?? '' : rest).trim(),
  }
}

/** The node line a toolbar writes back, keeping the status marker only when it says something. */
export function formatTimelineItem(item: TimelineItem, marker: string): string {
  const status = item.status === 'todo' ? '' : `[${item.status}] `
  const time = item.time ? `${item.time} ` : ''
  return `${marker} ${status}${time}${item.title}`
}
