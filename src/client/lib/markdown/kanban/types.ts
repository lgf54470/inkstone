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
  | 'files'

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
  | 'coral'
  | 'teal'
  | 'slate'

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

export interface KanbanFile {
  id: string
  name: string
  size: number
  mime: string
  url: string
  r2Key?: string
}

export interface KanbanSubtask {
  id: string
  title: string
  completed: boolean
  icon?: string
  description?: string
  status?: string
  dueDate?: string
  startDate?: string
  priority?: string
  owner?: string
  tags?: string[]
}

export interface KanbanItem {
  id: string
  title: string
  icon?: string
  cover?: string
  content?: string
  description?: string
  files?: KanbanFile[]
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
  | 'chart'

export type KanbanChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'doughnut'
  | 'polarArea'
  | 'radar'

export interface KanbanChartDataset {
  labels: string[]
  data: number[]
  colors: KanbanColorName[]
  total: number
}

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
  chartType?: KanbanChartType
  chartGroupBy?: string
  filters?: KanbanFilter[]
  sorts?: KanbanSort[]
  searchQuery?: string
  cardSize?: 'small' | 'medium' | 'large'
  hiddenColumns?: string[]
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
