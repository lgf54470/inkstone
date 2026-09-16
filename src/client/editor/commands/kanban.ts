import type { EditorView } from '@codemirror/view'
import { EditorSelection, type StateCommand } from '@codemirror/state'
import { insertDiagramCode } from '../diagram-templates'
import { KANBAN_TEMPLATES } from '../kanban-templates'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'

export const insertKanban: StateCommand = insertDiagramCode('kanban', KANBAN_TEMPLATES[0]!.code)

export const insertKanbanFromOutline: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  const source = (range.empty ? state.doc.toString() : state.sliceDoc(range.from, range.to)).trim()
  const hasHeadingsOrLists = /^#{1,6}\s/m.test(source) || /^[-*+]\s/m.test(source)
  if (!source || !hasHeadingsOrLists) return false

  const insert = `\`\`\`kanban\n${source}\n\`\`\`\n`
  dispatch(state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    scrollIntoView: true,
    userEvent: 'input.insert',
  }))
  return true
}

export function generateKanbanFromOutline(view: EditorView): boolean {
  if (insertKanbanFromOutline(view)) return true
  useUi.getState().toast({ title: t('workspace.kanban_from_outline_empty'), tone: 'warning' })
  return false
}

export { KANBAN_TEMPLATES }
