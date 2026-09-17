import { serializeSlides } from './body'
import { outlineRoundTrips } from './outline'
import type { SlidesBlockEntry } from './entry'
import type { SlidesMode, SlidesWriteResult } from './types'

const WRITE_DEBOUNCE_MS = 500

export function scheduleSlidesWrite(entry: SlidesBlockEntry): void {
  if (!entry.write || !entry.ref || !entry.editable || !entry.data) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    flushSlidesEntry(entry)
  }, WRITE_DEBOUNCE_MS)
}

export function flushSlidesEntry(entry: SlidesBlockEntry): SlidesWriteResult | null {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  if (!entry.write || !entry.ref || !entry.dirty || !entry.data) return null
  entry.dirty = false
  const mode = resolveWriteMode(entry)
  const nextBody = serializeSlides(entry.data, mode)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}

/**
 * Which syntax the body is written back in. An outline body stays an outline for as long
 * as the document still fits it; an edit it cannot express (a shape, a moved element, an
 * imported asset) writes JSON from now on, so the note keeps holding the deck the editor
 * is showing. The mode is remembered rather than re-decided per write: the document is the
 * rich one from here on, and a retry after a failed write must not fall back to dropping it.
 */
function resolveWriteMode(entry: SlidesBlockEntry): SlidesMode {
  if (entry.mode !== 'outline' || !entry.data) return entry.mode
  if (outlineRoundTrips(entry.data)) return entry.mode
  entry.mode = 'json'
  entry.notice?.()
  return entry.mode
}
