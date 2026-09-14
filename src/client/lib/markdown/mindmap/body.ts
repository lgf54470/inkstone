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

/** Rewrites the fence that opens at `line` when its body still equals `expectedBody`. */
function replaceFenceAt(lines: string[], line: number, expectedBody: string, patch: MindmapFencePatch): string[] | null {
  const opening = parseFenceOpening(lines[line] ?? '')
  if (!opening) return null
  const closing = findClosingLine(lines, line, opening)
  if (fenceBody(lines, line, closing) !== expectedBody) return null
  const info = patch.annotation === undefined ? opening.info : withFenceAnnotation(opening.info, patch.annotation)
  const body = patch.body === undefined ? expectedBody : normalizeEol(patch.body)
  const replaced = buildFenceLines({ ...opening, info }, lines, closing, body)
  return closing === -1
    ? [...lines.slice(0, line), ...replaced]
    : [...lines.slice(0, line), ...replaced, ...lines.slice(closing + 1)]
}

/**
 * Rewrites one mind map fence, keeping the note's EOL style and every line outside the
 * block byte-identical. The recorded line is used first; when the fence moved (someone
 * edited above it) the single fence whose body still matches `target.body` is rewritten
 * instead. A fence is widened when the new body contains a line that would otherwise
 * close it early. Returns null when neither location holds that body — guessing would
 * overwrite whatever the user typed since the map was rendered, so the caller must not
 * write.
 */
export function applyFencePatchAtSource(content: string, target: MindmapFence, patch: MindmapFencePatch): string | null {
  const { lines, eol, trailingNewline } = splitLines(content)
  const expectedBody = normalizeEol(target.body)
  const direct = replaceFenceAt(lines, target.line, expectedBody, patch)
  if (direct) return joinLines(direct, eol, trailingNewline)
  const matches: number[] = []
  for (let index = 0; index < lines.length; index++) {
    if (replaceFenceAt(lines, index, expectedBody, patch)) matches.push(index)
  }
  if (matches.length !== 1) return null
  const moved = replaceFenceAt(lines, matches[0]!, expectedBody, patch)
  return moved ? joinLines(moved, eol, trailingNewline) : null
}

/** The body-only case of {@link applyFencePatchAtSource}, for the map's own writes. */
export function applyBodyAtFence(content: string, target: MindmapFence, nextBody: string): string | null {
  return applyFencePatchAtSource(content, target, { body: nextBody })
}
