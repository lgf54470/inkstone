import type { Root } from 'react-dom/client'
import type { AppLocale } from '@shared/types'
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
  dark: boolean
  locale: AppLocale
  container: HTMLElement | null
  root: Root | null
  ref: KanbanFenceRef | null
  write: KanbanWriter | null
  dirty: boolean
  timer: number | null
}
