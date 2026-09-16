/**
 * DOM-free helpers behind the ```kanban fence: format detection, JSON/Outline parsing
 * and fence surgery that two-way editing needs.
 */
import {
  applyBodyAtFence as applyBody,
  fenceRange as rangeOf,
  type FenceRange,
} from '../fence-edit'
import { parseKanbanOutline, serializeKanbanOutline } from './outline'
import type {
  KanbanData,
  KanbanFenceRef,
  KanbanMode,
  KanbanParseResult,
  KanbanProperty,
  KanbanView,
} from './types'

export const KANBAN_LANGUAGES = ['kanban', 'notion-kanban', 'board'] as const

export function detectKanbanMode(body: string): KanbanMode {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'outline'
}

function normalizeKanbanData(raw: Partial<KanbanData>): KanbanData {
  const defaultColumns: KanbanProperty[] = [
    { id: 'title', name: 'Title', type: 'title' },
    { id: 'status', name: 'Status', type: 'select', options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'in_progress', label: 'In Progress', color: 'blue' },
      { id: 'done', label: 'Done', color: 'green' },
    ]},
    { id: 'priority', name: 'Priority', type: 'select', options: [
      { id: 'low', label: 'Low', color: 'green' },
      { id: 'medium', label: 'Medium', color: 'yellow' },
      { id: 'high', label: 'High', color: 'red' },
    ]},
    { id: 'assignee', name: 'Assignee', type: 'text' },
    { id: 'startDate', name: 'Start Date', type: 'date' },
    { id: 'endDate', name: 'End Date', type: 'date' },
    { id: 'progress', name: 'Progress', type: 'number' },
    { id: 'tags', name: 'Tags', type: 'multi-select', options: [
      { id: 'feat', label: 'Feature', color: 'green' },
      { id: 'improve', label: 'Improvement', color: 'blue' },
      { id: 'bug', label: 'Bug', color: 'red' },
    ]},
  ]

  const defaultViews: KanbanView[] = [
    { id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' },
    { id: 'view-table', name: 'Table', type: 'table' },
    { id: 'view-calendar', name: 'Calendar', type: 'calendar', dateField: 'startDate' },
    { id: 'view-timeline', name: 'Timeline', type: 'timeline', startField: 'startDate', endField: 'endDate' },
    { id: 'view-gantt', name: 'Gantt', type: 'gantt', startField: 'startDate', endField: 'endDate', progressField: 'progress' },
    { id: 'view-list', name: 'List', type: 'list' },
    { id: 'view-gallery', name: 'Gallery', type: 'gallery' },
  ]

  const columns = Array.isArray(raw.columns) && raw.columns.length > 0 ? raw.columns : defaultColumns
  const views = Array.isArray(raw.views) && raw.views.length > 0 ? raw.views : defaultViews
  const items = Array.isArray(raw.items) ? raw.items : []

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Project',
    activeViewId: raw.activeViewId || views[0]?.id || 'view-board',
    views,
    columns,
    items,
  }
}

export function parseKanbanBody(body: string): KanbanParseResult {
  const mode = detectKanbanMode(body)
  if (mode === 'outline') {
    try {
      const data = parseKanbanOutline(body)
      return { ok: true, data, mode }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), raw: body }
    }
  }

  try {
    const parsed = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Kanban JSON body must be an object', raw: body }
    }
    const data = normalizeKanbanData(parsed as Partial<KanbanData>)
    return { ok: true, data, mode: 'json' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), raw: body }
  }
}

export function serializeKanban(data: KanbanData, mode: KanbanMode): string {
  if (mode === 'outline') {
    return serializeKanbanOutline(data)
  }
  return JSON.stringify(data, null, 2)
}

export function applyKanbanBodyAtFence(content: string, target: KanbanFenceRef, nextBody: string): string | null {
  return applyBody(content, target, nextBody, KANBAN_LANGUAGES)
}

export function kanbanFenceRange(content: string, target: KanbanFenceRef): FenceRange | null {
  return rangeOf(content, target, KANBAN_LANGUAGES)
}
