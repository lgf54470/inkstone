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
import { safeKanbanCoverUrl, safeKanbanUrl } from './url'
import type {
  KanbanData,
  KanbanFenceRef,
  KanbanItem,
  KanbanMode,
  KanbanParseResult,
  KanbanProperty,
  KanbanView,
} from './types'

export const KANBAN_LANGUAGES = ['kanban', 'notion-kanban', 'board'] as const

/**
 * The most cards one fence may carry, and the same number the CSV door refuses past (`KANBAN_CSV_MAX_ROWS`
 * in `./csv.ts`; `body.test.ts` pins the two equal). A guardrail rather than a product limit: a
 * hand-written fence can list any number of cards and a note pays for the board it draws, so past this
 * one the fence fails into its error state — source, message and retry, the way an unreadable fence does
 * — instead of being quietly cut down to the first thousand, which would hide cards an author wrote.
 */
export const KANBAN_MAX_ITEMS = 1000

/**
 * How much one card's description may hold, wherever it is written from: the detail editor counts
 * down to it, and the CSV import clamps to it — a spreadsheet cell is user input like any other,
 * and the clamp is what keeps one giant cell from ballooning the fence it lands in.
 */
export const KANBAN_DESCRIPTION_MAX_CHARS = 5000

function assertKanbanCardBudget(items: KanbanItem[]): void {
  if (items.length > KANBAN_MAX_ITEMS) {
    throw new Error(`Kanban board lists ${items.length} cards, more than the ${KANBAN_MAX_ITEMS} a board may carry`)
  }
}

export function detectKanbanMode(body: string): KanbanMode {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'outline'
}

function assertFenceUrlsAreSafe(items: KanbanItem[]): void {
  // A rejected protocol fails the whole fence into its error state rather than
  // silently dropping the field, so the author sees why the board will not open.
  // The cover alone may be an inline image; file urls are links and fetches.
  for (const item of items) {
    if (typeof item.cover === 'string' && item.cover.trim() !== '' && safeKanbanCoverUrl(item.cover) === null) {
      throw new Error(`Kanban item "${item.id ?? ''}" has an unsupported cover URL protocol`)
    }
    for (const file of item.files ?? []) {
      if (typeof file.url === 'string' && file.url.trim() !== '' && safeKanbanUrl(file.url) === null) {
        throw new Error(`Kanban item "${item.id ?? ''}" has an unsupported files URL protocol`)
      }
    }
  }
}

function defaultKanbanColumns(): KanbanProperty[] {
  return [
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
    { id: 'assignee', name: 'Assignee', type: 'person' },
    { id: 'startDate', name: 'Start Date', type: 'date' },
    { id: 'endDate', name: 'End Date', type: 'date' },
    { id: 'progress', name: 'Progress', type: 'number' },
    { id: 'tags', name: 'Tags', type: 'multi-select', options: [
      { id: 'feat', label: 'Feature', color: 'green' },
      { id: 'improve', label: 'Improvement', color: 'blue' },
      { id: 'bug', label: 'Bug', color: 'red' },
    ]},
  ]
}

function defaultKanbanViews(): KanbanView[] {
  return [
    { id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' },
    { id: 'view-table', name: 'Table', type: 'table' },
    { id: 'view-chart', name: 'Chart', type: 'chart', chartType: 'bar', chartGroupBy: 'status' },
    { id: 'view-calendar', name: 'Calendar', type: 'calendar', dateField: 'startDate' },
    { id: 'view-timeline', name: 'Timeline', type: 'timeline', startField: 'startDate', endField: 'endDate' },
    { id: 'view-gantt', name: 'Gantt', type: 'gantt', startField: 'startDate', endField: 'endDate', progressField: 'progress' },
    { id: 'view-list', name: 'List', type: 'list' },
    { id: 'view-gallery', name: 'Gallery', type: 'gallery' },
  ]
}

function normalizeKanbanData(raw: Partial<KanbanData>): KanbanData {
  const columns = Array.isArray(raw.columns) && raw.columns.length > 0 ? raw.columns : defaultKanbanColumns()
  const views = Array.isArray(raw.views) && raw.views.length > 0 ? raw.views : defaultKanbanViews()
  const items = Array.isArray(raw.items) ? raw.items : []
  assertFenceUrlsAreSafe(items)
  assertKanbanCardBudget(items)

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
      assertKanbanCardBudget(data.items)
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
