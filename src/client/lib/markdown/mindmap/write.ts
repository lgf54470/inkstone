/**
 * Keeping the note in step with a live map: the debounce that turns an operation
 * burst into a single write, the serialization, and the explicit body write the
 * block's own actions (a format conversion) make.
 *
 * The fence is resolved against the note's *current* text by the writer the
 * surface hands over (see features/preview/mindmap-sync): when it no longer holds
 * the body the map was built from, the writer reports a conflict and the note is
 * left alone, because writing would drop whatever the user typed since.
 */
import { detectMindmapMode, type MindmapMode } from './body'
import type { MindmapBlockEntry } from './entry'
import type { MindmapWriteResult } from './types'

/** Operations are coalesced: dragging a node fires many, the note gets one write. */
const WRITE_DEBOUNCE_MS = 400

export function scheduleWrite(entry: MindmapBlockEntry): void {
  if (!entry.handle || !entry.write || !entry.ref) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    flushEntry(entry)
  }, WRITE_DEBOUNCE_MS)
}

/** Writes the map's current body into the note, if it is both dirty and still its own. */
export function flushEntry(entry: MindmapBlockEntry): MindmapWriteResult | null {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  if (!entry.handle || !entry.vendor || !entry.write || !entry.ref || !entry.dirty) return null
  entry.dirty = false
  const nextBody = entry.vendor.serialize(entry.handle.getData(), entry.mode, entry.extra)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written' || result === 'moved') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}

/** The current body text for a block, in the given mode (used by copy/convert actions). */
export function serializeEntryAs(entry: MindmapBlockEntry, mode: MindmapMode): string | null {
  if (!entry.handle || !entry.vendor) return null
  return entry.vendor.serialize(entry.handle.getData(), mode, mode === 'json' ? entry.extra : {})
}

export function serializeEntry(entry: MindmapBlockEntry): string | null {
  return serializeEntryAs(entry, entry.mode)
}

/** Writes an explicit body (a format conversion), bypassing the operation debounce. */
export function applyEntryBody(entry: MindmapBlockEntry, nextBody: string): MindmapWriteResult {
  if (!entry.write || !entry.ref) return 'missing'
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written' || result === 'moved') {
    entry.source = nextBody
    entry.mode = detectMindmapMode(nextBody)
    entry.extra = {}
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}
