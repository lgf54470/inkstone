/**
 * Reading a block rule's source lines, and walking them without tripping over the code fences that
 * sit inside a container.
 *
 * Every `:::` family — details, tabs, columns, timeline — has to find its own end and split its own
 * body, and all of them fail the same way if they scan naively: a line inside a ```` ``` ```` fence is
 * text, not syntax, so `::: there` in a code sample must neither close a block nor start one. This is
 * the one place that rule lives.
 */

export type BlockLineState = {
  src: string
  bMarks: number[]
  tShift: number[]
  eMarks: number[]
}

type Fence = {
  char: string
  length: number
}

/** The line's text with its leading indentation removed, which is how a block rule reads its markers. */
export function blockLine(state: BlockLineState, line: number): string {
  const from = state.bMarks[line]! + state.tShift[line]!
  return state.src.slice(from, state.eMarks[line]!)
}

function advanceFence(fence: Fence | null, marker: string): Fence | null {
  if (!fence)
    return { char: marker[0]!, length: marker.length }
  if (marker[0] === fence.char && marker.length >= fence.length)
    return null
  return fence
}

/**
 * Visits each line in `[start, end)` that is not inside a code fence, stopping at the first line the
 * visitor claims. Returns that line, or -1 when the whole range was walked.
 */
export function walkNonFenceLines(state: BlockLineState, start: number, end: number, visit: (line: number, text: string) => boolean): number {
  let fence: Fence | null = null
  for (let line = start; line < end; line++) {
    const text = blockLine(state, line)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(text)
    if (fenceMatch) {
      fence = advanceFence(fence, fenceMatch[1]!)
      continue
    }
    if (fence)
      continue
    if (visit(line, text))
      return line
  }
  return -1
}

/**
 * The line that closes a `:::`-style block: the first run of colons at least as long as the opener
 * that carries nothing after it, tracking nesting so a container inside this one closes itself first.
 */
export function findColonFenceEnd(state: BlockLineState, start: number, end: number, markerLength: number): number {
  let depth = 1
  let result = -1
  walkNonFenceLines(state, start, end, (line, text) => {
    if (new RegExp(`^:{${markerLength},}(?:\\s+\\S|\\{\\S+\\})`).test(text)) {
      depth++
      return false
    }
    if (new RegExp(`^:{${markerLength},}\\s*$`).test(text) && --depth === 0) {
      result = line
      return true
    }
    return false
  })
  return result
}
