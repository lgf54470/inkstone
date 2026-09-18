import { act, createElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { renderElement } from '../../../test-render'
import { useKanbanAddOperations } from './kanban-root-hooks'
import { KanbanCalendarView } from './kanban-calendar-view'
import type { KanbanData, KanbanView } from '../types'

beforeAll(async () => {
  await initI18n()
})

const statusColumn = {
  id: 'status',
  name: 'Status',
  type: 'select' as const,
  options: [
    { id: 'todo', label: 'To Do', color: 'gray' as const },
    { id: 'doing', label: 'Doing', color: 'blue' as const },
  ],
}

const priorityColumn = {
  id: 'priority',
  name: 'Priority',
  type: 'select' as const,
  options: [
    { id: 'high', label: 'High', color: 'red' as const },
    { id: 'low', label: 'Low', color: 'gray' as const },
  ],
}

function makeData(overrides: Partial<KanbanData> = {}): KanbanData {
  return {
    columns: [statusColumn, priorityColumn],
    items: [],
    views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
    ...overrides,
  }
}

type AddApi = ReturnType<typeof useKanbanAddOperations>

function renderAddHook(
  data: KanbanData,
  activeView: KanbanView,
  commitData: (next: KanbanData) => void,
): AddApi {
  let api: AddApi | null = null
  function Probe() {
    api = useKanbanAddOperations(data, commitData, vi.fn(), activeView)
    return null
  }
  const rendered = renderElement(createElement(Probe))
  rendered.unmount()
  if (!api) throw new Error('probe did not expose the hook api')
  return api
}

function captureCommit(data: KanbanData, activeView: KanbanView) {
  const commits: KanbanData[] = []
  const api = renderAddHook(data, activeView, (d) => {
    commits.push(d)
  })
  const addedItem = () => commits[0]!.items[0]!
  return { api, addedItem }
}

describe('useKanbanAddOperations', () => {
  it('handleAddItem with a date record writes the date field and keeps the default status', () => {
    const { api, addedItem } = captureCommit(makeData(), { id: 'v', name: 'Calendar', type: 'calendar' })
    api.handleAddItem({ startDate: '2026-09-18' })
    expect(addedItem().properties.startDate).toBe('2026-09-18')
    expect(addedItem().properties.status).toBe('todo')
  })

  it('handleAddItem with no defaults still gets the first status option', () => {
    const { api, addedItem } = captureCommit(makeData(), { id: 'v', name: 'Board', type: 'board', groupBy: 'status' })
    api.handleAddItem()
    expect(addedItem().properties.status).toBe('todo')
  })

  it('handleAddItemInGroup targets the active view groupBy property, not status', () => {
    const { api, addedItem } = captureCommit(makeData(), { id: 'v', name: 'Board', type: 'board', groupBy: 'priority' })
    api.handleAddItemInGroup('high')
    expect(addedItem().properties.priority).toBe('high')
    expect(addedItem().properties.status).toBe('todo')
  })

  it('handleAddItemInGroup with the no-group sentinel creates a plain default item', () => {
    const { api, addedItem } = captureCommit(makeData(), { id: 'v', name: 'Board', type: 'board', groupBy: 'priority' })
    api.handleAddItemInGroup('__none__')
    expect(addedItem().properties.status).toBe('todo')
    expect(addedItem().properties.priority).toBeUndefined()
  })
})

function renderCalendar(onAddItem: (defaults?: Record<string, unknown>) => void) {
  const node: ReactNode = createElement(KanbanCalendarView, {
    data: makeData({ views: [{ id: 'v', name: 'Calendar', type: 'calendar' }] }),
    onOpenDetail: vi.fn(),
    onAddItem,
  })
  return renderElement(node)
}

describe('KanbanCalendarView add-from-day-cell', () => {
  it('passes the clicked day into the date field instead of a bare status string', () => {
    const onAddItem = vi.fn()
    const rendered = renderCalendar(onAddItem)
    const addButton = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="New item"]',
    )!
    expect(addButton).toBeTruthy()
    act(() => {
      addButton.click()
    })
    expect(onAddItem).toHaveBeenCalledTimes(1)
    const arg = onAddItem.mock.calls[0]![0]
    expect(typeof arg).toBe('object')
    expect(arg).toMatchObject({ startDate: /^\d{4}-\d{2}-\d{2}$/ })
    expect((arg as Record<string, unknown>).status).toBeUndefined()
    rendered.unmount()
  })
})
