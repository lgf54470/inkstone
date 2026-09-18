import { serializeKanban } from './body'
import type { KanbanBlockEntry } from './entry'
import type { KanbanWriteResult } from './types'

const WRITE_DEBOUNCE_MS = 500

export function scheduleKanbanWrite(entry: KanbanBlockEntry): void {
  if (!entry.write || !entry.ref || !entry.editable || !entry.data) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    flushKanbanEntry(entry)
  }, WRITE_DEBOUNCE_MS)
}

export function flushKanbanEntry(entry: KanbanBlockEntry): KanbanWriteResult | null {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  if (!entry.write || !entry.ref || !entry.dirty || !entry.data) return null
  entry.dirty = false
  // The outline format cannot store subtasks, files, views or the board title,
  // so the first UI write promotes the fence to JSON instead of dropping them.
  if (entry.mode === 'outline') entry.mode = 'json'
  const nextBody = serializeKanban(entry.data, entry.mode)
  if (nextBody === entry.source) return null
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
  }
  return result
}
