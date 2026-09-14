import type { EditorView } from '@codemirror/view'
import { EditorSelection, type StateCommand } from '@codemirror/state'
import { markdownToMindmapOutline } from '../../lib/markdown/mindmap'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'

/**
 * Builds a mind map from the note's outline: the selection when there is one,
 * otherwise the whole note. All of it is one transaction, so one undo takes the
 * fence back — the same contract every other insertion here has.
 *
 * Returns false when the text holds no headings and no lists, which is not an
 * error the command can report on its own: the caller toasts.
 */
export const insertMindmapFromOutline: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  const source = range.empty ? state.doc.toString() : state.sliceDoc(range.from, range.to)
  const outline = markdownToMindmapOutline(source)
  if (outline === null) return false
  const insert = `\`\`\`mindmap\n${outline}\n\`\`\`\n`
  dispatch(state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    scrollIntoView: true,
    userEvent: 'input.insert',
  }))
  return true
}

/** The menu-level action: says so when there was no outline to draw, instead of looking like a dead item. */
export function generateMindmapFromOutline(view: EditorView): boolean {
  if (insertMindmapFromOutline(view)) return true
  useUi.getState().toast({ title: t('workspace.mindmap_from_outline_empty'), tone: 'warning' })
  return false
}
