import { EditorSelection, type StateCommand } from '@codemirror/state'
import { t } from '../../lib/i18n'
import type { AlignValue } from '../../lib/markdown/renderer'
import { insertWrappedBlock } from './block'

/**
 * The insertion skeletons for the `:::` panel family.
 *
 * Each one writes a block a reader can finish by hand: the header shows the kind, and the body shows
 * the separator or marker that kind uses. Columns therefore arrive as two of them rather than one, so
 * the `::` is visible without having to look it up.
 */

export const insertColumns: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const first = selected || t('editor.column_1')
  const insert = `::: cols\n${first}\n::\n${t('editor.column_2')}\n:::\n`
  dispatch(state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(range.from + '::: cols\n'.length, range.from + '::: cols\n'.length + first.length),
    scrollIntoView: true,
    userEvent: 'input.insert',
  }))
  return true
}

export const insertTimeline: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const first = selected || t('editor.timeline_node')
  const insert = `::: timeline\n:: [done] ${first}\n:: ${t('editor.timeline_node')}\n:::\n`
  const start = range.from + '::: timeline\n:: [done] '.length
  dispatch(state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(start, start + first.length),
    scrollIntoView: true,
    userEvent: 'input.insert',
  }))
  return true
}

export function insertAlign(align: AlignValue): StateCommand {
  return insertWrappedBlock(`::: ${align}`, ':::', '', `::: ${align}`.length + 1)
}
