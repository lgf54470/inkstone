/**
 * Keeping the note in step with a live board: the debounce that turns a burst of
 * drawing into a single write, and the write itself.
 *
 * The fence is resolved against the note's *current* text by the writer the surface
 * hands over (see features/preview/excalidraw-sync): when it no longer holds the body
 * the board was built from, the writer reports a conflict and the note is left alone,
 * because writing would drop whatever the user typed since.
 */
import type { ExcalidrawBlockEntry } from './entry'
import type { ExcalidrawWriteResult } from './types'

/** Drawing emits a change per pointer move; the note gets one write per pause. */
const WRITE_DEBOUNCE_MS = 600

export function scheduleWrite(entry: ExcalidrawBlockEntry): void {
  if (!entry.handle || !entry.write || !entry.ref || !entry.editable) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    flushEntry(entry)
  }, WRITE_DEBOUNCE_MS)
}

/** Writes the board's current scene into the note, if it is both dirty and still its own. */
export function flushEntry(entry: ExcalidrawBlockEntry): ExcalidrawWriteResult | null {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  if (!entry.handle || !entry.vendor || !entry.write || !entry.ref || !entry.dirty) return null
  entry.dirty = false
  const scene = entry.handle.getScene()
  const nextBody = entry.vendor.serialize(scene)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written') {
    entry.source = nextBody
    entry.scene = scene
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}
