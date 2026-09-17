import { t } from '../../lib/i18n'
import {
  applySlidesBodyAtFence,
  type SlidesFenceRef,
  type SlidesWriteResult,
  type SlidesWriter,
} from '../../lib/markdown/slides'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'

const CONFLICT_NOTICE_INTERVAL_MS = 4000

function patchNote(noteId: string | null, apply: (content: string) => string | null): SlidesWriteResult {
  if (!noteId) return 'missing'
  const state = useNotes.getState()
  const current = state.contents[noteId]
  if (current === undefined) return 'missing'
  const next = apply(current)
  if (next === null) return 'conflict'
  if (next !== current) state.editContent(noteId, next)
  return 'written'
}

export function writeSlidesBody(
  noteId: string | null,
  ref: SlidesFenceRef,
  nextBody: string,
): SlidesWriteResult {
  return patchNote(noteId, (content) => applySlidesBodyAtFence(content, ref, nextBody))
}

function conflictReporter(): (result: SlidesWriteResult) => SlidesWriteResult {
  let lastNoticeAt = 0
  return (result) => {
    if (result === 'conflict' && Date.now() - lastNoticeAt > CONFLICT_NOTICE_INTERVAL_MS) {
      lastNoticeAt = Date.now()
      useUi.getState().toast({ title: t('preview.slides_source_moved'), tone: 'warning' })
    }
    return result
  }
}

export function createSlidesWriter(noteId: string | null): SlidesWriter {
  const report = conflictReporter()
  return (ref, nextBody) => report(writeSlidesBody(noteId, ref, nextBody))
}
