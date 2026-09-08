import { memo } from 'react'
import { useNoteRowState, type NoteRowProps } from './note-row-state'
import { useNoteRowExport, useNoteRowMoveActions, useNoteRowPurge, type NoteRowActions } from './note-row-actions'
import { useNoteRowMenuItems } from './note-row-items'
import { NoteRowRoot } from './note-row-ui'

export const NoteRow = memo(function NoteRow(props: NoteRowProps) {
  const state = useNoteRowState(props)
  const actions: NoteRowActions = {
    ...useNoteRowMoveActions(state),
    ...useNoteRowPurge(state),
    exportNote: useNoteRowExport(state),
  }
  const items = useNoteRowMenuItems(state, actions)
  return <NoteRowRoot state={state} actions={actions} items={items}/>
})