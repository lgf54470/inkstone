import { useRef, useState } from 'react'
import { errorMessage } from '../../../lib/errors'
import { exportNoteAsHtml, exportNoteAsMarkdown, exportNoteAsPdf } from '../../../lib/export-note'
import { confirm } from '../../../components/overlay'
import { useUi } from '../../../store/ui'
import { useNotes } from '../../../store/notes'
import { usePinnedWindows } from '../../../store/pinned-windows'
import { getVisibleViewport } from '../../../lib/viewport'
import { pinnedWindowSize } from '../../../lib/pinned-window-size'
import { t } from '../../../lib/i18n'
import type { NoteSummary } from '@shared/types'
import type { NoteRowState } from './note-row-state'

const FLOAT_WINDOW_MARGIN = 8

export function openNoteFloatingWindow(note: NoteSummary, rowRect?: DOMRect | null): void {
  const pinned = usePinnedWindows.getState()
  if (pinned.focusPinnedByNote(note.id)) return
  const viewport = getVisibleViewport()
  const { width, height } = pinnedWindowSize()
  const maxX = viewport.right - width - FLOAT_WINDOW_MARGIN
  const x = Math.max(viewport.left, Math.min(rowRect?.left ?? maxX, maxX))
  const y = rowRect?.top ?? viewport.top + FLOAT_WINDOW_MARGIN
  pinned.pin(
    {
      anchor: document.createElement('span'),
      title: note.title,
      noteId: note.id,
      missing: false,
      headline: note.title,
    },
    new DOMRect(x, y, width, height),
  )
}

export function useNoteRowMoveActions(state: NoteRowState) {
  const { note, folders, toast, selectedIds, moveNotes } = state
  const handleSelectFolder = (folderId: string | null) => {
    const targetIds = selectedIds.includes(note.id) ? selectedIds : [note.id]
    void moveNotes(targetIds, folderId)
    if (folderId) {
      const folder = folders.find((f) => f.id === folderId)
      if (folder) {
        toast({
          title: t('notes.move_to_value0', { value0: folder.name }),
          tone: 'success',
        })
      }
    }
  }
  const handleManageFolders = () => {
    useUi.getState().openPanel('folders')
  }
  return { handleSelectFolder, handleManageFolders }
}

export function useNoteRowPurge(state: NoteRowState) {
  const { note, purgeNote } = state
  const purgeRef = useRef(false)
  const [isPurging, setIsPurging] = useState(false)
  const purge = async () => {
    if (purgeRef.current)
      return
    purgeRef.current = true
    setIsPurging(true)
    try {
      const ok = await confirm({
        title: t('notes.permanently_delete_this_note'),
        description: t('notes.this_operation_cannot_be_undone'),
        confirmLabel: t('notes.delete_permanently'),
        tone: 'danger',
      })
      if (ok)
        await purgeNote(note.id)
    }
    finally {
      purgeRef.current = false
      setIsPurging(false)
    }
  }
  return { purge, isPurging }
}

export function useNoteRowExport(state: NoteRowState) {
  const { note, toast, locale } = state
  const exportNote = async (format: 'md' | 'html' | 'pdf') => {
    const notes = useNotes.getState()
    let content = notes.contents[note.id]
    if (content === undefined) {
      await notes.openNote(note.id)
      content = useNotes.getState().contents[note.id]
      if (content === undefined) {
        toast({ title: t('common.export_failed'), tone: 'danger' })
        return
      }
    }
    const payload = { title: note.title, content }
    if (format === 'md') {
      exportNoteAsMarkdown(payload)
      return
    }
    try {
      if (format === 'html')
        await exportNoteAsHtml(payload, locale)
      else
        await exportNoteAsPdf(payload, locale)
    }
    catch (err) {
      toast({
        title: t('common.export_failed'),
        description: errorMessage(err),
        tone: 'danger',
      })
    }
  }
  return exportNote
}

export type NoteRowActions = ReturnType<typeof useNoteRowMoveActions> & ReturnType<typeof useNoteRowPurge> & { exportNote: ReturnType<typeof useNoteRowExport> }