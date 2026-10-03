/**
 * Reading `:::` fences out of a note's raw text.
 *
 * The renderer does the same job over markdown-it's line index, but a settings toolbar edits the source
 * string itself and cannot go through the parser without re-rendering first. Both halves have to agree
 * on what counts as a fence, so the indent rule and the nesting walk live here and the tabs and panel
 * source editors share them instead of each keeping a private copy that can drift.
 */

// markdown-it strips up to three leading spaces from a block start (a fourth makes indented
// code), so colon fences nested in shallow lists render; the source edits match the same shape.
export function lineIndent(line: string): string {
  return /^ {0,3}/.exec(line)![0]
}

export function deindent(line: string): string {
  return line.slice(lineIndent(line).length)
}

const FENCE_LINE = /^(`{3,}|~{3,})/
export const COLON_OPEN = /^(:{3,})(?:\s+\S|\{\S+\})/
export const COLON_CLOSE = /^:{3,}\s*$/

export type OpenFence = { char: string; length: number } | null

/**
 * Whether a line is fenced out of the container syntax, and what fence state it leaves behind. A fence
 * marker line is never a colon marker, and neither is anything between an opening and a closing run.
 */
export function fenceAfter(text: string, fence: OpenFence): { fence: OpenFence; skipped: boolean } {
  const match = FENCE_LINE.exec(text)
  if (match) {
    if (!fence) return { fence: { char: match[1]![0]!, length: match[1]!.length }, skipped: true }
    const closes = match[1]![0] === fence.char && match[1]!.length >= fence.length
    return { fence: closes ? null : fence, skipped: true }
  }
  return { fence, skipped: fence !== null }
}

/** The line that closes a colon fence opened at `start`, tracking nesting and code fences. */
export function findColonClose(lines: string[], start: number, end: number, markerLength: number): number {
  let depth = 1
  let fence: OpenFence = null
  for (let i = start; i < end; i++) {
    const text = deindent(lines[i]!)
    const fenced = fenceAfter(text, fence)
    fence = fenced.fence
    if (fenced.skipped) continue
    if (new RegExp(`^:{${markerLength},}(?:\\s+\\S|\\{\\S+\\})`).test(text)) {
      depth++
      continue
    }
    if (new RegExp(`^:{${markerLength},}\\s*$`).test(text) && --depth === 0) {
      return i
    }
  }
  return -1
}

/**
 * The lines in `[start, close)` that a bare `::` separator could sit on — outside a code fence and
 * outside any container nested in the body, where such a line belongs to that inner block.
 */
export function bareColonMarks(lines: string[], start: number, close: number): number[] {
  const marks: number[] = []
  let colonDepth = 0
  let fence: OpenFence = null
  for (let line = start; line < close; line++) {
    const text = deindent(lines[line]!)
    const fenced = fenceAfter(text, fence)
    fence = fenced.fence
    if (fenced.skipped) continue
    if (COLON_OPEN.test(text)) {
      colonDepth++
      continue
    }
    if (COLON_CLOSE.test(text) && colonDepth > 0) {
      colonDepth--
      continue
    }
    if (colonDepth === 0 && /^::(?!:)[ \t]*$/.test(text)) marks.push(line)
  }
  return marks
}
