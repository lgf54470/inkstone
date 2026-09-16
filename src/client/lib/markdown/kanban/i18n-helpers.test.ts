import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, setLocale, t } from '../../i18n'
import {
  formatKanbanGroupLabel,
  formatKanbanOptionLabel,
  formatKanbanPropertyName,
  formatKanbanViewName,
} from './i18n-helpers'

beforeAll(async () => {
  await initI18n()
  await setLocale('zh-CN')
})

describe('formatKanbanViewName', () => {
  it('formats default view names based on view type', () => {
    expect(formatKanbanViewName({ id: '1', name: 'Board', type: 'board' })).toBe(t('preview.kanban_view_board'))
    expect(formatKanbanViewName({ id: '2', name: 'Table', type: 'table' })).toBe(t('preview.kanban_view_table'))
    expect(formatKanbanViewName({ id: '3', name: 'Calendar', type: 'calendar' })).toBe(t('preview.kanban_view_calendar'))
    expect(formatKanbanViewName({ id: '4', name: 'Timeline', type: 'timeline' })).toBe(t('preview.kanban_view_timeline'))
    expect(formatKanbanViewName({ id: '5', name: 'Gantt', type: 'gantt' })).toBe(t('preview.kanban_view_gantt'))
    expect(formatKanbanViewName({ id: '6', name: 'List', type: 'list' })).toBe(t('preview.kanban_view_list'))
    expect(formatKanbanViewName({ id: '7', name: 'Gallery', type: 'gallery' })).toBe(t('preview.kanban_view_gallery'))
  })

  it('preserves custom user-entered view names', () => {
    expect(formatKanbanViewName({ id: '8', name: 'My Sprint Sprint 24', type: 'board' })).toBe('My Sprint Sprint 24')
  })
})

describe('formatKanbanPropertyName', () => {
  it('formats standard property names', () => {
    expect(formatKanbanPropertyName('title')).toBe(t('preview.kanban_prop_title'))
    expect(formatKanbanPropertyName('Status')).toBe(t('preview.kanban_prop_status'))
    expect(formatKanbanPropertyName('priority')).toBe(t('preview.kanban_prop_priority'))
    expect(formatKanbanPropertyName('Assignee')).toBe(t('preview.kanban_prop_assignee'))
    expect(formatKanbanPropertyName('startDate')).toBe(t('preview.kanban_prop_start_date'))
    expect(formatKanbanPropertyName('end_date')).toBe(t('preview.kanban_prop_end_date'))
  })

  it('preserves custom property names', () => {
    expect(formatKanbanPropertyName('Custom Field')).toBe('Custom Field')
  })
})

describe('formatKanbanOptionLabel', () => {
  it('formats standard status and priority options', () => {
    expect(formatKanbanOptionLabel({ id: 'todo', label: 'To Do', color: 'gray' })).toBe(t('preview.kanban_status_todo'))
    expect(formatKanbanOptionLabel({ id: 'in_progress', label: 'In Progress', color: 'blue' })).toBe(t('preview.kanban_status_in_progress'))
    expect(formatKanbanOptionLabel({ id: 'done', label: 'Done', color: 'green' })).toBe(t('preview.kanban_status_done'))
    expect(formatKanbanOptionLabel({ id: 'high', label: 'High', color: 'red' })).toBe(t('preview.kanban_priority_high'))
  })

  it('formats fallback group label', () => {
    expect(formatKanbanGroupLabel('__none__', 'No Status')).toBe(t('preview.kanban_no_status'))
    expect(formatKanbanGroupLabel('status-1', 'To Do')).toBe(t('preview.kanban_status_todo'))
  })
})
