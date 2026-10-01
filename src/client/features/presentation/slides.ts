import { parseFrontMatter } from '@shared/markdown-utils'

const SLIDE_BREAK = /^ {0,3}-{3,}[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const LINE_PARTS = /(\r?\n)/
const SLIDE_LEVEL_KEY = 'slide-level'
const NOTE_OPEN = /^ {0,3}<!--[ \t]*(?:note|speaker):[ \t]*/i
const NOTE_END = '-->'
const LAYOUT_LINE = /^ {0,3}<!--[ \t]*layout[ \t]*:[ \t]*([a-z][a-z0-9_-]*)[ \t]*-->$/i

/** How a slide is laid out on the projector, as its source asks for it. */
export type SlideLayout = 'cover' | 'split'

// `two-columns` is the name the review gives the split layout, and an author who reaches for it
// means the same screen; a value nobody knows stays prose rather than silently becoming a switch.
const LAYOUT_VALUES: Record<string, SlideLayout> = { cover: 'cover', split: 'split', 'two-columns': 'split' }

interface FenceMarker {
  char: string
  length: number
}

interface Line {
  text: string
  offset: number
}

interface Boundary {
  line: number
  offset: number
  level: number
}

interface LineState {
  kind: 'fence' | 'divider' | 'heading' | 'text'
  level: number
  fence: FenceMarker | null
}

interface Deck {
  slides: string[]
  starts: number[]
  notes: string[]
}

interface NoteMark {
  line: number
  text: string
}

type NoteState = { kind: 'out' } | { kind: 'open'; line: number; parts: string[] }

function isClosingFence(match: RegExpExecArray | null, marker: FenceMarker): boolean {
  const mark = match?.[1]
  if (!mark || mark[0] !== marker.char || mark.length < marker.length) return false
  return match![2]!.trim() === ''
}

function classifyLine(text: string, fence: FenceMarker | null, prevBlank: boolean): LineState {
  const match = FENCE.exec(text)
  if (fence) return { kind: 'fence', level: 0, fence: isClosingFence(match, fence) ? null : fence }
  if (match) return { kind: 'fence', level: 0, fence: { char: match[1]![0]!, length: match[1]!.length } }
  if (SLIDE_BREAK.test(text) && prevBlank) return { kind: 'divider', level: 0, fence: null }
  const heading = ATX_HEADING.exec(text)
  if (heading) return { kind: 'heading', level: heading[1]!.length, fence: null }
  return { kind: 'text', level: 0, fence: null }
}

function trimBlankEdges(slide: string): string {
  return slide.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '')
}

function readLines(source: string): Line[] {
  const parts = source.split(LINE_PARTS)
  const lines: Line[] = []
  let offset = 0
  for (let index = 0; index < parts.length; index += 2) {
    const text = parts[index]!
    lines.push({ text, offset })
    offset += text.length + (parts[index + 1]?.length ?? 0)
  }
  return lines
}

function slideLevelOf(data: Record<string, unknown>): 1 | 2 | null {
  const value = data[SLIDE_LEVEL_KEY]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return parsed === 1 || parsed === 2 ? parsed : null
}

interface ReadNote {
  /** The line as the slide sees it; `null` means it belonged to a cue and is gone. */
  text: string | null
  state: NoteState
  note: NoteMark | null
}

function noteClosed(text: string, startLine: number, parts: string[]): ReadNote {
  const end = text.indexOf(NOTE_END)
  if (end < 0) {
    parts.push(text)
    return { text: null, state: { kind: 'open', line: startLine, parts }, note: null }
  }
  parts.push(text.slice(0, end))
  // Prose written after the closing marker stays in the slide: the line is not a private cue line,
  // and dropping it would eat what the author typed.
  const rest = text.slice(end + NOTE_END.length)
  return { text: rest === '' ? null : rest, state: { kind: 'out' }, note: { line: startLine, text: parts.join('\n').trim() } }
}

function readNoteLine(text: string, state: NoteState, index: number): ReadNote {
  if (state.kind === 'open') return noteClosed(text, state.line, state.parts)
  const opener = NOTE_OPEN.exec(text)
  if (!opener) return { text, state, note: null }
  return noteClosed(text.slice(opener[0].length), index, [])
}

function takeNote(note: NoteMark, dropped: boolean, kept: Line[]): NoteMark {
  if (!dropped || kept[note.line - 1]?.text.trim() !== '') return note
  kept.splice(note.line - 1, 1)
  return { line: note.line - 1, text: note.text }
}

function readSpeakerNotes(lines: Line[], bodyStart: number): { notes: NoteMark[]; lines: Line[] } {
  const notes: NoteMark[] = []
  const kept: Line[] = []
  let fence: FenceMarker | null = null
  let state: NoteState = { kind: 'out' }
  for (const line of lines) {
    if (line.offset < bodyStart) {
      kept.push(line)
      continue
    }
    if (state.kind === 'out') {
      const scan = classifyLine(line.text, fence, false)
      fence = scan.fence
      // A fenced block may demo the syntax itself, so nothing inside one is ever a cue.
      if (scan.kind === 'fence') {
        kept.push(line)
        continue
      }
    }
    const read = readNoteLine(line.text, state, kept.length)
    state = read.state
    if (read.text !== null) kept.push({ text: read.text, offset: line.offset })
    if (read.note) notes.push(takeNote(read.note, read.text === null, kept))
  }
  // A cue nobody closed stays private to the end of the note, the way the reader drops it anyway.
  if (state.kind === 'open') {
    notes.push(takeNote({ line: state.line, text: state.parts.join('\n').trim() }, true, kept))
  }
  return { notes, lines: kept }
}

function placeCues(marks: NoteMark[], bodyLine: number, lineCount: number): NoteMark[] {
  // A cue that swallows the tail leaves no line behind, and a blank trailing slide is dropped
  // along with its cues, so a cue sits on the last line the body still has and joins the slide above.
  const last = Math.max(bodyLine, lineCount - 1)
  return marks.map((mark) => ({ ...mark, line: Math.min(mark.line, last) }))
}

/** Where one slide's cue group ends: a separator belongs to no slide's text, but a cue typed on
 * its line was meant for the slide above it; a heading opens the slide it belongs to. */
function noteLimit(boundary: Boundary): number {
  return boundary.level === 0 ? boundary.line + 1 : boundary.line
}

function scanBoundaries(lines: Line[], bodyStart: number): { breaks: Boundary[]; headings: Boundary[] } {
  const breaks: Boundary[] = []
  const headings: Boundary[] = []
  let fence: FenceMarker | null = null
  let prevBlank = true
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (line.offset < bodyStart) continue
    const state = classifyLine(line.text, fence, prevBlank)
    fence = state.fence
    if (state.kind === 'divider') breaks.push({ line: index, offset: line.offset, level: 0 })
    else if (state.kind === 'heading') headings.push({ line: index, offset: line.offset, level: state.level })
    // A separator leaves nothing above it, so the next rule is blank-above even with no blank line
    // between the two — the same reading the deck gave before headings could divide it.
    prevBlank = state.kind === 'divider' || line.text.trim() === ''
  }
  return { breaks, headings }
}

function autoSlideLevel(headings: Boundary[]): 1 | 2 | null {
  const count = (level: number) => headings.filter((heading) => heading.level <= level).length
  if (count(1) >= 2) return 1
  return count(2) >= 2 ? 2 : null
}

function dividerBoundaries(lines: Line[], bodyStart: number, declaredLevel: 1 | 2 | null): Boundary[] {
  const { breaks, headings } = scanBoundaries(lines, bodyStart)
  if (breaks.length) return breaks
  const level = declaredLevel ?? autoSlideLevel(headings)
  if (level === null) return []
  return headings.filter((heading) => heading.level <= level)
}

function sliceSlide(lines: Line[], from: number, to: number): string {
  return trimBlankEdges(lines.slice(from, to).map((line) => line.text).join('\n'))
}

function joinNotes(marks: NoteMark[], from: number, to: number): string {
  return marks.filter((mark) => mark.line >= from && mark.line < to).map((mark) => mark.text).join('\n\n')
}

function buildDeck(source: string): Deck {
  // A `---` with a non-blank line directly above is a setext heading rather than a
  // rule, so it must not split the deck; requiring a blank line (or deck start) keeps
  // slide boundaries identical to how the preview renders horizontal rules.
  const raw = readLines(source)
  const frontMatter = parseFrontMatter(source)
  const bodyStart = raw[frontMatter.lineOffset]?.offset ?? source.length
  const { notes: found, lines } = readSpeakerNotes(raw, bodyStart)
  const marks = placeCues(found, frontMatter.lineOffset, lines.length)
  const boundaries = dividerBoundaries(lines, bodyStart, slideLevelOf(frontMatter.data))
  const slides: string[] = []
  const notes: string[] = []
  const starts: number[] = [bodyStart]
  let from = frontMatter.lineOffset
  for (const boundary of boundaries) {
    slides.push(sliceSlide(lines, from, boundary.line))
    notes.push(joinNotes(marks, from, noteLimit(boundary)))
    // A separator only divides, so it belongs to no slide; a heading is the first line of
    // the slide it opens.
    from = boundary.level === 0 ? boundary.line + 1 : boundary.line
    // Where the deck starts counting this slide: a heading counts from its own line, since the
    // caret sitting on a title means that title, while a caret before a divider still reads as
    // the end of the slide above it.
    starts.push(boundary.level === 0 ? boundary.offset + 1 : boundary.offset)
  }
  slides.push(sliceSlide(lines, from, lines.length))
  // Run the last group past every remaining line, since the cue it holds may have dropped them all.
  notes.push(joinNotes(marks, from, Number.POSITIVE_INFINITY))
  // Edge separators (e.g. an unclosed front matter opener) would otherwise yield
  // blank first/last slides; blank slides between two breaks stay as written.
  while (slides.length > 1 && slides[0] === '') {
    slides.shift()
    notes.shift()
    starts.shift()
  }
  while (slides.length > 1 && slides[slides.length - 1] === '') {
    slides.pop()
    notes.pop()
    starts.pop()
  }
  return { slides, starts, notes }
}

export function splitIntoSlides(source: string): string[] {
  return buildDeck(source).slides
}

/** The deck with each slide's private cue, index-aligned with `splitIntoSlides()`. */
export function splitIntoSlidesWithNotes(source: string): { slides: string[]; notes: string[] } {
  const { slides, notes } = buildDeck(source)
  return { slides, notes }
}

function readLayoutLine(text: string): SlideLayout | undefined {
  const value = LAYOUT_LINE.exec(text)?.[1]?.toLowerCase()
  return value ? LAYOUT_VALUES[value] : undefined
}

/**
 * A slide's layout switch, lifted out of its source. The line itself must not reach the markup:
 * the projector reads the switch off the entry the slide renders to, and every surface that
 * renders that slide — the canvas, the slide list, the overview grid, the printed deck — then
 * draws the same layout without one of them being told about it.
 */
export function takeLayoutDirective(source: string): { body: string; layout: SlideLayout | undefined } {
  const lines = readLines(source)
  let fence: FenceMarker | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const scan = classifyLine(line.text, fence, false)
    fence = scan.fence
    // A fenced block may demo the syntax itself, so nothing inside one switches the layout.
    if (scan.kind === 'fence') continue
    const layout = readLayoutLine(line.text)
    if (!layout) continue
    // A switch takes its own line out of the slide, so the blank above it goes with it — leaving
    // it would open a hole where the switch was.
    const blank = index > 0 && lines[index - 1]!.text.trim() === '' ? index - 1 : -1
    const kept = lines.filter((_, at) => at !== index && at !== blank).map((item) => item.text)
    return { body: trimBlankEdges(kept.join('\n')), layout }
  }
  return { body: source, layout: undefined }
}

export function findSlideIndexByOffset(source: string, offset: number): number {
  if (offset <= 0) return 0
  const { slides, starts } = buildDeck(source)
  if (slides.length <= 1) return 0
  let index = 0
  while (index < starts.length - 1 && offset >= starts[index + 1]!) index++
  return index
}
