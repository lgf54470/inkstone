import { joinLines, splitLines } from '../../lib/markdown/fence-edit'
import {
  formatImageAttrs,
  mergeImageAttrs,
  parseCherryImageFlags,
  parseImageAttrGroup,
  type ImageAttrs,
} from '../../lib/markdown/renderer'

/**
 * Where a rendered image came from, as the image itself reports it: the line it sits on, its
 * number among the images of that line, and the src it was drawn with. The src is not decoration
 * — a line and an index are only as trustworthy as the note's text still being what the preview
 * rendered, and this is the third thing a write can check before it overwrites.
 */
export interface ImageRef {
  line: number
  index: number
  src: string
}

interface LocatedImage {
  line: number
  index: number
  /** Index of the `!`. */
  start: number
  /** One past the closing `)`. */
  end: number
  /** One past the trailing `{…}` group, or `end` when the image does not carry one. */
  groupEnd: number
  /** The destination text exactly as written between the parentheses, title included. */
  destination: string
  /** The destination with the title taken off, which is what the rendered image loads. */
  src: string
  /** The alt with the Cherry flags taken out, which is what the rendered image shows. */
  cleanAlt: string
  attrs: ImageAttrs
  /** A `{…}` stood there but did not parse; writing next to it would stack two groups. */
  groupUnknown: boolean
}

function closingBracket(text: string, from: number): number {
  let depth = 1
  for (let index = from; index < text.length; index++) {
    switch (text[index]) {
      case '\\':
        index += 1
        break
      case '[':
        depth += 1
        break
      case ']':
        if (--depth === 0) return index
        break
    }
  }
  return -1
}

function closingParen(text: string, from: number): number {
  let depth = 1
  let quote = ''
  for (let index = from; index < text.length; index++) {
    const char = text[index]!
    if (quote) {
      switch (char) {
        case '\\':
          index += 1
          break
        case quote:
          quote = ''
          break
      }
      continue
    }
    switch (char) {
      case '"':
      case "'":
        quote = char
        break
      case '\\':
        index += 1
        break
      case '(':
        depth += 1
        break
      case ')':
        if (--depth === 0) return index
        break
    }
  }
  return -1
}

function backtickRun(text: string, from: number): number {
  let end = from
  while (text[end] === '`') end++
  return end - from
}

function closingBacktickRun(text: string, from: number, run: number): number {
  for (let index = text.indexOf('`'.repeat(run), from); index !== -1; index = text.indexOf('`'.repeat(run), index + 1)) {
    if (backtickRun(text, index) === run) return index
  }
  return -1
}

/** Inline code spans of one line: an image written inside one is text the reader sees, not an image. */
function codeSpans(text: string): [number, number][] {
  const spans: [number, number][] = []
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '`') continue
    const run = backtickRun(text, index)
    const close = closingBacktickRun(text, index + run, run)
    if (close === -1) {
      index += run - 1
      continue
    }
    spans.push([index, close + run])
    index = close + run - 1
  }
  return spans
}

/** The destination is what precedes the title: `<…>` wins, else the run up to the first space. */
function destinationOf(inner: string): string {
  const text = inner.trim()
  const bracketed = /^<([^>]*)>$/.exec(text)
  if (bracketed) return bracketed[1]!
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    switch (char) {
      case '\\':
        index += 1
        break
      case '(':
        depth += 1
        break
      case ')':
        depth -= 1
        break
      default:
        if (depth === 0 && /\s/.test(char)) return text.slice(0, index)
    }
  }
  return text
}

function readImage(text: string, start: number): Omit<LocatedImage, 'line' | 'index'> | null {
  if (text[start] !== '!' || text[start + 1] !== '[') return null
  const labelEnd = closingBracket(text, start + 2)
  if (labelEnd === -1) return null
  let cursor = labelEnd + 1
  while (text[cursor] === ' ' || text[cursor] === '\t') cursor++
  if (text[cursor] !== '(') return null
  const destinationStart = cursor + 1
  const destinationEnd = closingParen(text, destinationStart)
  if (destinationEnd === -1) return null
  const end = destinationEnd + 1
  const destination = text.slice(destinationStart, destinationEnd)
  const group = /^[ \t]*(\{[^{}]*\})/.exec(text.slice(end))
  const parsed = group ? parseImageAttrGroup(group[1]!) : null
  const flags = parseCherryImageFlags(text.slice(start + 2, labelEnd))
  return {
    start,
    end,
    groupEnd: end + (group?.[0]!.length ?? 0),
    destination,
    src: destinationOf(destination),
    cleanAlt: flags.alt,
    attrs: mergeImageAttrs(flags.attrs, parsed?.attrs ?? {}),
    groupUnknown: group !== null && (parsed === null || parsed.unknown.length > 0),
  }
}

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Every image the note actually draws. Code is walked over, not searched: an image written inside
 * a fence or an indented block is text the reader sees, and matching it by src would hand a
 * rendered image's edit to the wrong copy of itself.
 */
function collectImages(lines: string[]): LocatedImage[] {
  const found: LocatedImage[] = []
  let fence: { char: string; length: number } | null = null
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line]!
    const marker = FENCE_LINE.exec(text)?.[1]
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (marker) {
      fence = { char: marker[0]!, length: marker.length }
      continue
    }
    if (/^ {4,}/.test(text)) continue
    found.push(...locateLineImages(text, line))
  }
  return found
}

function locateLineImages(text: string, line: number): LocatedImage[] {
  const spans = codeSpans(text)
  const found: LocatedImage[] = []
  let position = 0
  while (position < text.length) {
    const span = spans.find(([start, end]) => position >= start && position < end)
    if (span) {
      position = span[1]
      continue
    }
    const image = readImage(text, position)
    if (!image) {
      position++
      continue
    }
    found.push({ ...image, line, index: found.length })
    position = image.groupEnd
  }
  return found
}

function unescapeDestination(text: string): string {
  return text.replace(/^<|>$/g, '').replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
}

function srcMatches(destination: string, src: string): boolean {
  const raw = destination.trim()
  if (raw === src || unescapeDestination(raw) === src) return true
  try {
    return decodeURIComponent(src) === unescapeDestination(raw)
  } catch {
    return false
  }
}

/**
 * The image the rendered node came from. The recorded line and number are tried first; when the
 * paragraph moved the only fallback is a src that appears exactly once in the note. Anything else
 * is a guess, and guessing would rewrite whichever image the user typed since the last render.
 */
function pickImage(images: LocatedImage[], ref: ImageRef): LocatedImage | null {
  const exact = images.find((image) =>
    image.line === ref.line && image.index === ref.index && srcMatches(image.src, ref.src))
  if (exact) return exact
  const bySrc = images.filter((image) => srcMatches(image.src, ref.src))
  return bySrc.length === 1 ? bySrc[0]! : null
}

/**
 * Rewrites one image's attributes in the note, keeping every other byte — including the note's
 * line endings — exactly as it was. The alt is written back without the Cherry flags it may have
 * carried, so the source and the rendered caption agree after a single edit, and one undo takes
 * both halves of the change back together.
 */
export function updateImageAttrsAtSource(
  content: string,
  ref: ImageRef,
  updater: (attrs: ImageAttrs) => ImageAttrs,
): string | null {
  const { lines, eol, trailingNewline } = splitLines(content)
  const target = pickImage(collectImages(lines), ref)
  if (!target) return null
  if (target.groupUnknown) return null
  const text = lines[target.line]!
  const group = formatImageAttrs(updater(target.attrs))
  lines[target.line] = `${text.slice(0, target.start)}![${target.cleanAlt}](${target.destination})${group}${text.slice(target.groupEnd)}`
  return joinLines(lines, eol, trailingNewline)
}

/** The identity the rendered `<img>` carries, or null when it never came from a note line. */
export function imageRefOf(node: HTMLElement): ImageRef | null {
  const line = Number(node.dataset.imageLine)
  const index = Number(node.dataset.imageIndex)
  const src = node.getAttribute('src') ?? ''
  if (!Number.isInteger(line) || line < 0 || !Number.isInteger(index) || index < 0 || !src) return null
  return { line, index, src }
}
