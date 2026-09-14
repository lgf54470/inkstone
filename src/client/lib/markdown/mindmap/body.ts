/**
 * DOM-free helpers behind the ```mindmap fence: format detection, EOL handling
 * and the fence surgery that two-way editing needs (the map's own writes, and the
 * header's palette control). The vendor-backed parse/serialize pair lives in ./vendor,
 * so this file (and its tests) can be imported without pulling mind-elixir into the
 * caller's chunk.
 */

import { withFenceAnnotation } from './theme'

export type MindmapMode = 'outline' | 'json'

/** Fence languages that render as a mind map block. */
export const MINDMAP_LANGUAGES = ['mindmap', 'mind-elixir'] as const

/** The body text of a mind map fence plus the line its opening fence sits on. */
export interface MindmapFence {
  /** 0-based line index of the opening fence, matching the renderer's `data-line`. */
  line: number
  /** Fence body, EOL-normalized to `\n`. */
  body: string
}

interface SplitContent {
  lines: string[]
  eol: string
  trailingNewline: boolean
}

interface FenceOpening {
  indent: string
  marker: string
  length: number
  info: string
}

function splitLines(content: string): SplitContent {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const trailingNewline = /\r?\n$/.test(content)
  const lines = content.split(/\r?\n/)
  if (trailingNewline && lines[lines.length - 1] === '') lines.pop()
  return { lines, eol, trailingNewline }
}

function joinLines(lines: string[], eol: string, trailingNewline: boolean): string {
  return `${lines.join(eol)}${trailingNewline && lines.length > 0 ? eol : ''}`
}

/** Fence bodies reach us from markdown-it (which keeps the document's EOLs) and from our own serializers (LF). */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/** JSON bodies start with `{`; everything else is read as the outline format. */
export function detectMindmapMode(body: string): MindmapMode {
  return body.trimStart().startsWith('{') ? 'json' : 'outline'
}

function parseFenceOpening(line: string): FenceOpening | null {
  const match = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\n]*)$/.exec(line)
  if (!match) return null
  const info = match[3]!
  const language = /^([A-Za-z0-9_-]+)/.exec(info.trim())?.[1]?.toLowerCase() ?? ''
  if (!(MINDMAP_LANGUAGES as readonly string[]).includes(language)) return null
  return { indent: match[1]!, marker: match[2]!.charAt(0), length: match[2]!.length, info }
}

function isClosingFence(line: string, marker: string, minLength: number): boolean {
  const match = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line)
  if (!match) return false
  return match[2]!.charAt(0) === marker && match[2]!.length >= minLength
}

/** Closing fence line for the block that opens at `line`, or -1 when the block runs to the end of the file. */
function findClosingLine(lines: string[], line: number, opening: FenceOpening): number {
  for (let index = line + 1; index < lines.length; index++) {
    if (isClosingFence(lines[index]!, opening.marker, opening.length)) return index
  }
  return -1
}

function fenceBody(lines: string[], line: number, closing: number): string {
  return normalizeEol(lines.slice(line + 1, closing === -1 ? lines.length : closing).join('\n'))
}

/** The run length a body line would need before it could close the surrounding fence. */
function widestBodyFenceRun(body: string, marker: string): number {
  let widest = 0
  for (const line of body.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
    if (match && match[1]!.charAt(0) === marker) widest = Math.max(widest, match[1]!.length)
  }
  return widest
}

function buildFenceLines(opening: FenceOpening, lines: string[], closing: number, nextBody: string): string[] {
  const length = Math.max(opening.length, widestBodyFenceRun(nextBody, opening.marker) + 1)
  const marker = opening.marker.repeat(length)
  const head = `${opening.indent}${marker}${opening.info}`
  const keepClosing = closing !== -1 && lines[closing]!.length >= length && isClosingFence(lines[closing]!, opening.marker, length)
  const tail = keepClosing ? lines[closing]! : `${opening.indent}${marker}`
  return [head, ...(nextBody.length > 0 ? nextBody.split('\n') : []), tail]
}

/**
 * What one action asks of a fence: a new body, a new `theme=` annotation, or both at
 * once. An omitted field is left exactly as the note has it, which is what keeps a
 * palette change from rewriting the body (and a body change from dropping the line's
 * other metadata).
 */
export interface MindmapFencePatch {
  body?: string
  /** The annotation to write; null removes it, omitted leaves it alone. */
  annotation?: string | null
}

/** A fence the note still holds the expected body in, with its closing line resolved. */
interface FenceLocation {
  line: number
  closing: number
  opening: FenceOpening
}

/**
 * Where the fence is *now*. The recorded line is tried first; when the fence moved
 * (someone edited above it) the single fence whose body still matches `target.body`
 * is the one. Returns null when neither holds — guessing would overwrite whatever the
 * user typed since the map was rendered, so every caller must then decline to write.
 */
function locateFence(lines: string[], target: MindmapFence): FenceLocation | null {
  const expectedBody = normalizeEol(target.body)
  const matchAt = (line: number): FenceLocation | null => {
    const opening = parseFenceOpening(lines[line] ?? '')
    if (!opening) return null
    const closing = findClosingLine(lines, line, opening)
    return fenceBody(lines, line, closing) === expectedBody ? { line, closing, opening } : null
  }
  const direct = matchAt(target.line)
  if (direct) return direct
  const moved: number[] = []
  for (let index = 0; index < lines.length; index++) {
    if (matchAt(index)) moved.push(index)
  }
  return moved.length === 1 ? matchAt(moved[0]!) : null
}

/** The lines a text block contributes; an empty text contributes none. */
function textLines(text: string): string[] {
  const body = normalizeEol(text).replace(/\n+$/, '')
  return body.length > 0 ? body.split('\n') : []
}

/**
 * The block's line span in the note: the opening fence through its closing line,
 * or through the end of the file when the fence is left open. An editor caller
 * maps these to character positions to replace the block in one transaction.
 */
export interface MindmapFenceRange {
  /** 0-based line of the opening fence. */
  start: number
  /** 0-based line one past the block. */
  end: number
}

export function mindmapFenceRange(content: string, target: MindmapFence): MindmapFenceRange | null {
  const { lines } = splitLines(content)
  const at = locateFence(lines, target)
  if (!at) return null
  return { start: at.line, end: at.closing === -1 ? lines.length : at.closing + 1 }
}

/**
 * Rewrites the whole block as plain text — the fence, its body and its closing
 * line all go. Used when a mind map becomes a Markdown outline.
 */
export function replaceFenceWithText(content: string, target: MindmapFence, text: string): string | null {
  const { lines, eol, trailingNewline } = splitLines(content)
  const at = locateFence(lines, target)
  if (!at) return null
  const end = at.closing === -1 ? lines.length : at.closing + 1
  const next = [...lines.slice(0, at.line), ...textLines(text), ...lines.slice(end)]
  return joinLines(next, eol, trailingNewline)
}

/** Inserts text on its own lines right after the block, leaving the fence alone. */
export function insertTextAfterFence(content: string, target: MindmapFence, text: string): string | null {
  const { lines, eol, trailingNewline } = splitLines(content)
  const at = locateFence(lines, target)
  if (!at) return null
  const end = at.closing === -1 ? lines.length : at.closing + 1
  const next = [...lines.slice(0, end), ...textLines(text), ...lines.slice(end)]
  return joinLines(next, eol, trailingNewline)
}

/**
 * Rewrites one mind map fence, keeping the note's EOL style and every line outside the
 * block byte-identical. A fence is widened when the new body contains a line that would
 * otherwise close it early. Returns null when the fence is no longer where the map last
 * saw it, for the reason given in {@link locateFence}.
 */
export function applyFencePatchAtSource(content: string, target: MindmapFence, patch: MindmapFencePatch): string | null {
  const { lines, eol, trailingNewline } = splitLines(content)
  const at = locateFence(lines, target)
  if (!at) return null
  const info = patch.annotation === undefined ? at.opening.info : withFenceAnnotation(at.opening.info, patch.annotation)
  const body = patch.body === undefined ? normalizeEol(target.body) : normalizeEol(patch.body)
  const replaced = buildFenceLines({ ...at.opening, info }, lines, at.closing, body)
  const next = at.closing === -1
    ? [...lines.slice(0, at.line), ...replaced]
    : [...lines.slice(0, at.line), ...replaced, ...lines.slice(at.closing + 1)]
  return joinLines(next, eol, trailingNewline)
}

/** The body-only case of {@link applyFencePatchAtSource}, for the map's own writes. */
export function applyBodyAtFence(content: string, target: MindmapFence, nextBody: string): string | null {
  return applyFencePatchAtSource(content, target, { body: nextBody })
}
