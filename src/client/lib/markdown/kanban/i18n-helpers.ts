import { t, type MessageKey } from '../../i18n'
import type { KanbanOption, KanbanProperty, KanbanView } from './types'

const VIEW_NAME_MAP: Record<string, MessageKey> = {
  board: 'preview.kanban_view_board',
  table: 'preview.kanban_view_table',
  calendar: 'preview.kanban_view_calendar',
  timeline: 'preview.kanban_view_timeline',
  gantt: 'preview.kanban_view_gantt',
  list: 'preview.kanban_view_list',
  gallery: 'preview.kanban_view_gallery',
}

export function formatKanbanViewName(view: KanbanView): string {
  const byTypeKey = VIEW_NAME_MAP[view.type]
  const isDefaultName = !view.name || view.name.toLowerCase() === view.type.toLowerCase()
  if (isDefaultName && byTypeKey) {
    return t(byTypeKey)
  }
  const byNameKey = VIEW_NAME_MAP[view.name.toLowerCase()]
  if (byNameKey) {
    return t(byNameKey)
  }
  return view.name
}

const PROPERTY_NAME_MAP: Record<string, MessageKey> = {
  title: 'preview.kanban_prop_title',
  status: 'preview.kanban_prop_status',
  priority: 'preview.kanban_prop_priority',
  assignee: 'preview.kanban_prop_assignee',
  startdate: 'preview.kanban_prop_start_date',
  start_date: 'preview.kanban_prop_start_date',
  enddate: 'preview.kanban_prop_end_date',
  end_date: 'preview.kanban_prop_end_date',
  progress: 'preview.kanban_prop_progress',
  tags: 'preview.kanban_prop_tags',
}

export function formatKanbanPropertyName(prop: KanbanProperty | string): string {
  const idOrName = typeof prop === 'string' ? prop : prop.id || prop.name
  const normalized = idOrName.toLowerCase().replace(/[\s_-]+/g, '')
  const key = PROPERTY_NAME_MAP[normalized]
  if (key) {
    return t(key)
  }
  return typeof prop === 'string' ? prop : prop.name
}

const OPTION_LABEL_MAP: Record<string, MessageKey> = {
  todo: 'preview.kanban_status_todo',
  'to do': 'preview.kanban_status_todo',
  in_progress: 'preview.kanban_status_in_progress',
  'in progress': 'preview.kanban_status_in_progress',
  done: 'preview.kanban_status_done',
  low: 'preview.kanban_priority_low',
  medium: 'preview.kanban_priority_medium',
  high: 'preview.kanban_priority_high',
  feat: 'preview.kanban_tag_feat',
  feature: 'preview.kanban_tag_feat',
  improve: 'preview.kanban_tag_improve',
  improvement: 'preview.kanban_tag_improve',
  bug: 'preview.kanban_tag_bug',
}

export function formatKanbanOptionLabel(optionOrLabel: KanbanOption | string, propId?: string): string {
  const id = typeof optionOrLabel === 'string' ? optionOrLabel : optionOrLabel.id
  const label = typeof optionOrLabel === 'string' ? optionOrLabel : optionOrLabel.label
  const idKey = OPTION_LABEL_MAP[id.toLowerCase()]
  if (idKey) return t(idKey)
  const labelKey = OPTION_LABEL_MAP[label.toLowerCase()]
  if (labelKey) return t(labelKey)
  if (propId === 'status') {
    const statusKey = OPTION_LABEL_MAP[label.toLowerCase().replace(/\s+/g, '_')]
    if (statusKey) return t(statusKey)
  }
  return label
}

export function formatKanbanGroupLabel(groupKey: string, fallbackLabel: string): string {
  if (groupKey === '__none__' || fallbackLabel === 'No Status') {
    return t('preview.kanban_no_status')
  }
  return formatKanbanOptionLabel(fallbackLabel)
}
