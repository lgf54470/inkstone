import { serializeSlides } from './body'
import type { SlidesBlockEntry } from './entry'
import type { SlidesWriteResult } from './types'

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
  const nextBody = serializeSlides(entry.data, entry.mode)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}
