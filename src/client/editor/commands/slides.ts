import type { EditorView } from '@codemirror/view'
import { EditorSelection, type StateCommand } from '@codemirror/state'
import { insertDiagramCode } from '../diagram-templates'
import { BENTO_SLIDES_TEMPLATES } from '../slides-templates'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'

export const insertSlides: StateCommand = insertDiagramCode('bento-slides', BENTO_SLIDES_TEMPLATES[0]!.code)

export const insertSlidesFromOutline: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  const source = (range.empty ? state.doc.toString() : state.sliceDoc(range.from, range.to)).trim()
  const hasHeadingsOrLists = /^#{1,6}\s/m.test(source) || /^[-*+]\s/m.test(source)
  if (!source || !hasHeadingsOrLists) return false

  const insert = `\`\`\`bento-slides\n${source}\n\`\`\`\n`
  dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      scrollIntoView: true,
      userEvent: 'input.insert',
    }),
  )
  return true
}

export function generateSlidesFromOutline(view: EditorView): boolean {
  if (insertSlidesFromOutline(view)) return true
  useUi.getState().toast({ title: t('workspace.slides_from_outline_empty'), tone: 'warning' })
  return false
}

export { BENTO_SLIDES_TEMPLATES }
