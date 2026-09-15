/**
 * Bridges the whiteboard registry (pure view state) to the note store: a board's
 * operations are serialized into the fence it came from.
 *
 * The fence is resolved against the note's *current* text, not against the markup the
 * preview rendered from: the user may have typed since, and writing on top of a stale
 * snapshot would throw those edits away. When the fence no longer holds the body the
 * board was built from, nothing is written and the user is told, because silently
 * dropping either side would be worse.
 */
import { t } from '../../lib/i18n'
import { applyExcalidrawBodyAtFence, type ExcalidrawFenceRef, type ExcalidrawWriteResult, type ExcalidrawWriter } from '../../lib/markdown/excalidraw'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'

const CONFLICT_NOTICE_INTERVAL_MS = 4000

/** The note's text with the fence rewritten, or null when the fence moved out from under us. */
function patchNote(noteId: string | null, apply: (content: string) => string | null): ExcalidrawWriteResult {
  if (!noteId) return 'missing'
  const state = useNotes.getState()
  const current = state.contents[noteId]
  if (current === undefined) return 'missing'
  const next = apply(current)
  if (next === null) return 'conflict'
  if (next !== current) state.editContent(noteId, next)
  return 'written'
}

export function writeExcalidrawBody(noteId: string | null, ref: ExcalidrawFenceRef, nextBody: string): ExcalidrawWriteResult {
  return patchNote(noteId, (content) => applyExcalidrawBodyAtFence(content, ref, nextBody))
}

/**
 * Conflicts are reported at most once every few seconds: drawing emits changes
 * continuously and each one would otherwise queue the same toast.
 */
function conflictReporter(): (result: ExcalidrawWriteResult) => ExcalidrawWriteResult {
  let lastNoticeAt = 0
  return (result) => {
    if (result === 'conflict' && Date.now() - lastNoticeAt > CONFLICT_NOTICE_INTERVAL_MS) {
      lastNoticeAt = Date.now()
      useUi.getState().toast({ title: t('preview.excalidraw_source_moved'), tone: 'warning' })
    }
    return result
  }
}

/** The writer the registry hands a board's own operations to. */
export function createExcalidrawWriter(noteId: string | null): ExcalidrawWriter {
  const report = conflictReporter()
  return (ref, nextBody) => report(writeExcalidrawBody(noteId, ref, nextBody))
}
