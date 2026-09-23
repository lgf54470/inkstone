import type { Root } from 'react-dom/client'
import type { KanbanData, KanbanFenceRef, KanbanMode, KanbanWriter } from './types'

export interface KanbanBlockEntry {
  key: string
  scope: string
  noteId: string | null
  index: number
  host: HTMLElement
  source: string
  data: KanbanData | null
  mode: KanbanMode
  editable: boolean
  owner: 'inline' | 'overlay'
  container: HTMLElement | null
  root: Root | null
  ref: KanbanFenceRef | null
  write: KanbanWriter | null
  dirty: boolean
  /** Edits the note refused to accept; kept in memory until retry or discard. */
  unsaved: boolean
  /** The block left the document and this entry was torn down; nothing may move its container again. */
  disposed: boolean
  timer: number | null
}
