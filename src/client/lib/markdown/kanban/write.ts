import { serializeKanban } from './body'
import type { KanbanBlockEntry } from './entry'
import type { KanbanWriteResult } from './types'

const WRITE_DEBOUNCE_MS = 500

export function scheduleKanbanWrite(entry: KanbanBlockEntry, onSettled?: () => void): void {
  if (!entry.write || !entry.ref || !entry.editable || !entry.data) return
  entry.dirty = true
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    const result = flushKanbanEntry(entry)
    // The flush lands after the React commit that scheduled it, so the header's
    // unsaved badge only appears once the settle callback re-renders the root.
    if (result !== null) onSettled?.()
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
  if (nextBody === entry.source) {
    entry.unsaved = false
    return null
  }
  const result = entry.write(entry.ref, nextBody)
  if (result === 'written') {
    entry.source = nextBody
    entry.ref = { line: entry.ref.line, body: nextBody }
    entry.unsaved = false
  } else {
    entry.unsaved = true
  }
  return result
}

export function retryKanbanWrite(entry: KanbanBlockEntry): KanbanWriteResult | null {
  entry.dirty = true
  return flushKanbanEntry(entry)
}

export function discardKanbanWrite(entry: KanbanBlockEntry): void {
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
  entry.dirty = false
  entry.unsaved = false
}
