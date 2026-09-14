/**
 * Bridges the mind map registry (pure view state) to the note store: the map's
 * operations are serialized into the fence it came from.
 *
 * The fence is resolved against the note's *current* text, not against the
 * markup the preview rendered from: the user may have typed since, and writing
 * on top of a stale snapshot would throw those edits away. When the fence no
 * longer holds the body the map was built from, nothing is written and the user
 * is told, because silently dropping either side would be worse.
 */
import { applyBodyAtFence, type MindmapFenceRef, type MindmapWriteResult, type MindmapWriter } from '../../lib/markdown/mindmap'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'

const CONFLICT_NOTICE_INTERVAL_MS = 4000

export function writeMindmapBody(noteId: string | null, ref: MindmapFenceRef, nextBody: string): MindmapWriteResult {
  if (!noteId) return 'missing'
  const state = useNotes.getState()
  const current = state.contents[noteId]
  if (current === undefined) return 'missing'
  const next = applyBodyAtFence(current, ref, nextBody)
  if (next === null) return 'conflict'
  if (next !== current) state.editContent(noteId, next)
  return 'written'
}

/**
 * The writer handed to the registry. Conflicts are reported at most once every
 * few seconds: a drag emits operations continuously and each one would otherwise
 * queue the same toast.
 */
export function createMindmapWriter(noteId: string | null): MindmapWriter {
  let lastNoticeAt = 0
  return (ref, nextBody) => {
    const result = writeMindmapBody(noteId, ref, nextBody)
    if (result === 'conflict' && Date.now() - lastNoticeAt > CONFLICT_NOTICE_INTERVAL_MS) {
      lastNoticeAt = Date.now()
      useUi.getState().toast({ title: t('preview.mindmap_source_moved'), tone: 'warning' })
    }
    return result
  }
}
