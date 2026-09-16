/**
 * Core type definitions for the Kanban and Notion-style database block.
 */

export type KanbanPropertyType =
  | 'title'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'person'

export type KanbanColorName =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

export interface KanbanOption {
  id: string
  label: string
  color: KanbanColorName
}

export interface KanbanProperty {
  id: string
  name: string
  type: KanbanPropertyType
  options?: KanbanOption[]
}

export interface KanbanSubtask {
  id: string
  title: string
  completed: boolean
}

export interface KanbanItem {
  id: string
  title: string
  icon?: string
  cover?: string
  content?: string
  subtasks?: KanbanSubtask[]
  properties: Record<string, unknown>
}

export type KanbanViewType =
  | 'board'
  | 'table'
  | 'calendar'
  | 'timeline'
  | 'gantt'
  | 'list'
  | 'gallery'

export type KanbanFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'

export interface KanbanFilter {
  propertyId: string
  operator: KanbanFilterOperator
  value?: string
}

export interface KanbanSort {
  propertyId: string
  direction: 'asc' | 'desc'
}

export interface KanbanView {
  id: string
  name: string
  type: KanbanViewType
  groupBy?: string
  dateField?: string
  startField?: string
  endField?: string
  progressField?: string
  coverField?: string
  filters?: KanbanFilter[]
  sorts?: KanbanSort[]
  hiddenProperties?: string[]
}

export interface KanbanData {
  title?: string
  activeViewId?: string
  views: KanbanView[]
  columns: KanbanProperty[]
  items: KanbanItem[]
}

export type KanbanMode = 'json' | 'outline'

export type KanbanParseResult =
  | { ok: true; data: KanbanData; mode: KanbanMode }
  | { ok: false; error: string; raw: string }

export interface KanbanFenceRef {
  line: number
  body: string
}

export type KanbanWriteResult = 'written' | 'conflict' | 'missing'

export type KanbanWriter = (ref: KanbanFenceRef, nextBody: string) => KanbanWriteResult
