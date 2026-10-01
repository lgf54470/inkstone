import { parseFrontMatter } from '@shared/markdown-utils'

const SLIDE_BREAK = /^ {0,3}-{3,}[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/
const LINE_PARTS = /(\r?\n)/
const SLIDE_LEVEL_KEY = 'slide-level'

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
}

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

function buildDeck(source: string): Deck {
  // A `---` with a non-blank line directly above is a setext heading rather than a
  // rule, so it must not split the deck; requiring a blank line (or deck start) keeps
  // slide boundaries identical to how the preview renders horizontal rules.
  const lines = readLines(source)
  const frontMatter = parseFrontMatter(source)
  const bodyStart = lines[frontMatter.lineOffset]?.offset ?? source.length
  const boundaries = dividerBoundaries(lines, bodyStart, slideLevelOf(frontMatter.data))
  const slides: string[] = []
  const starts: number[] = [bodyStart]
  let from = frontMatter.lineOffset
  for (const boundary of boundaries) {
    slides.push(sliceSlide(lines, from, boundary.line))
    // A separator only divides, so it belongs to no slide; a heading is the first line of
    // the slide it opens.
    from = boundary.level === 0 ? boundary.line + 1 : boundary.line
    // Where the deck starts counting this slide: a heading counts from its own line, since the
    // caret sitting on a title means that title, while a caret before a divider still reads as
    // the end of the slide above it.
    starts.push(boundary.level === 0 ? boundary.offset + 1 : boundary.offset)
  }
  slides.push(sliceSlide(lines, from, lines.length))
  // Edge separators (e.g. an unclosed front matter opener) would otherwise yield
  // blank first/last slides; blank slides between two breaks stay as written.
  while (slides.length > 1 && slides[0] === '') {
    slides.shift()
    starts.shift()
  }
  while (slides.length > 1 && slides[slides.length - 1] === '') {
    slides.pop()
    starts.pop()
  }
  return { slides, starts }
}

export function splitIntoSlides(source: string): string[] {
  return buildDeck(source).slides
}

export function findSlideIndexByOffset(source: string, offset: number): number {
  if (offset <= 0) return 0
  const { slides, starts } = buildDeck(source)
  if (slides.length <= 1) return 0
  let index = 0
  while (index < starts.length - 1 && offset >= starts[index + 1]!) index++
  return index
}
