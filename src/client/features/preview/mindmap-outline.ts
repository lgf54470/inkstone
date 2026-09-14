/**
 * Writing a live mind map back into the note as a Markdown outline.
 *
 * Two paths, one contract. With an editor on this very note the change goes in
 * as a single CodeMirror transaction, so one undo takes it back; without one —
 * a preview-only layout — it goes through the note store and offers its own
 * undo, the way the format conversion already does. Both run the same fence
 * surgery (see lib/markdown/mindmap/body), so the two agree on where the
 * outline lands and both refuse outright when the fence has moved.
 */

import type { EditorView } from '@codemirror/view'
import { getActiveEditorView } from '../../editor/commands'
import { insertTextAfterFence, mindmapFenceRange, replaceFenceWithText, type MindmapSession } from '../../lib/markdown/mindmap'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'

/** `replace` writes the outline over the fence; `after` keeps the map and appends. */
export type MindmapOutlinePlacement = 'replace' | 'after'

export type MindmapOutlineResult = 'written' | 'empty' | 'conflict' | 'missing'

interface EditorEdit {
  from: number
  to: number
  insert: string
}

/**
 * The editor of *this* note, or null. Another pane's editor is a different
 * document: dispatching there would put the outline in the wrong note.
 */
function editorFor(content: string): EditorView | null {
  const view = getActiveEditorView()
  if (!view) return null
  return view.state.doc.toString() === content ? view : null
}

function editInEditor(view: EditorView, content: string, session: MindmapSession, placement: MindmapOutlinePlacement, outline: string): EditorEdit | null {
  const fence = session.fence()
  if (!fence) return null
  const span = mindmapFenceRange(content, fence)
  if (!span) return null
  const doc = view.state.doc
  const from = doc.line(span.start + 1).from
  // `span.end` is one past the block, so the block ends where that line begins —
  // or at the end of the document when the fence was never closed.
  const atEnd = span.end >= doc.lines
  const to = atEnd ? doc.length : doc.line(span.end + 1).from
  return placement === 'replace'
    ? { from, to, insert: outline }
    : { from: to, to, insert: `${atEnd ? '\n' : ''}${outline}\n` }
}

/**
 * The note's text with the outline written where the caller asked for it, or
 * null when the fence is no longer where the map saw it. Guessing would
 * overwrite whatever the user typed since, so the caller must then decline.
 */
function editInContent(content: string, session: MindmapSession, placement: MindmapOutlinePlacement, outline: string): string | null {
  const fence = session.fence()
  if (!fence) return null
  return placement === 'replace'
    ? replaceFenceWithText(content, fence, outline)
    : insertTextAfterFence(content, fence, outline)
}

/** The store path has no editor undo to lean on, so it offers its own. */
function offerUndo(noteId: string, previous: string): void {
  useUi.getState().toast({
    title: t('preview.mindmap_outline_written'),
    kind: 'undo',
    action: { label: t('common.undo'), run: () => useNotes.getState().editContent(noteId, previous) },
    duration: 5000,
  })
}

export function writeMindmapOutline(session: MindmapSession, placement: MindmapOutlinePlacement): MindmapOutlineResult {
  const outline = session.outlineMarkdown()
  if (!outline) return 'empty'
  const noteId = session.noteId()
  if (!noteId || !session.fence()) return 'missing'
  const content = useNotes.getState().contents[noteId]
  if (content === undefined) return 'missing'

  const view = editorFor(content)
  if (view) {
    const edit = editInEditor(view, content, session, placement, outline)
    if (!edit) return 'conflict'
    view.dispatch({ changes: edit, userEvent: 'input.insert' })
    view.focus()
    return 'written'
  }

  const next = editInContent(content, session, placement, outline)
  if (next === null) return 'conflict'
  useNotes.getState().editContent(noteId, next)
  offerUndo(noteId, content)
  return 'written'
}
