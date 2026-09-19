/**
 * One card used to read differently depending on which view looked at it (review #25's only
 * correctness row): the board fell back to `startDate`, the gallery and the list never read the
 * schema's own `endDate` column at all, and every badge printed the raw `YYYY-MM-DD` key. The three
 * surfaces now derive one label from one accessor, so the contract asserted here is one item, three
 * surfaces, one date — and that the printed text is the reader's own date format, not the stored key.
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, localeTag } from '../../../i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanCard } from './kanban-card'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanListView } from './kanban-list-view'
import { getKanbanCardDate, getKanbanDueDate } from '../date-fields'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

const columns: KanbanProperty[] = [
  { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
  { id: 'startDate', name: 'Start Date', type: 'date' },
  { id: 'endDate', name: 'End Date', type: 'date' },
]

// Both fixtures stay inside the running year so the label rule never has to carry a year.
const YEAR = new Date().getFullYear()
const DUE_KEY = `${YEAR}-11-05`
const START_KEY = `${YEAR}-02-03`

function labelFor(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag(), { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day))
}

function makeItem(id: string, properties: Record<string, unknown>): KanbanItem {
  return { id, title: id, properties: { status: 'todo', ...properties } }
}

function mount(element: ReactElement) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  mounted.push({ root })
  return container
}

const mounted: { root: ReturnType<typeof createRoot> }[] = []

afterEach(() => {
  while (mounted.length) {
    const { root } = mounted.pop()!
    act(() => { root.unmount() })
  }
  document.body.innerHTML = ''
})

function dataFor(items: KanbanItem[]): KanbanData {
  return { columns, items, views: [{ id: 'v-list', name: 'List', type: 'list', groupBy: 'status' }] }
}

function surfacesFor(item: KanbanItem): Record<string, string> {
  const data = dataFor([item])
  const list = mount(createElement(KanbanListView, {
    data,
    selectedIds: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onAddItem: vi.fn(),
  }))
  const gallery = mount(createElement(KanbanGalleryView, {
    data,
    selectedIds: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onAddItem: vi.fn(),
  }))
  const board = mount(createElement(KanbanCard, {
    item,
    columns,
    isSelected: false,
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    onUpdateTitle: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  }))
  return {
    list: list.textContent ?? '',
    gallery: gallery.textContent ?? '',
    board: board.textContent ?? '',
  }
}

describe('kanban card date across surfaces', () => {
  it('shows the end date the schema owns in every surface', () => {
    const surfaces = surfacesFor(makeItem('only-end', { endDate: DUE_KEY }))
    for (const [name, text] of Object.entries(surfaces))
      expect(text, `${name} dropped the only date the card has`).toContain(labelFor(DUE_KEY))
    for (const text of Object.values(surfaces))
      expect(text, 'the stored key must not reach the reader').not.toContain(DUE_KEY)
  })

  it('shows the deadline rather than the start in every surface', () => {
    const surfaces = surfacesFor(makeItem('both-dates', { dueDate: DUE_KEY, startDate: START_KEY }))
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text, `${name} printed the start date as the deadline`).toContain(labelFor(DUE_KEY))
      expect(text, `${name} printed the deadline twice`).not.toContain(labelFor(START_KEY))
    }
  })

  it('still shows a card that only has a start date', () => {
    const surfaces = surfacesFor(makeItem('only-start', { startDate: START_KEY }))
    for (const [name, text] of Object.entries(surfaces))
      expect(text, `${name} lost the only date the card has`).toContain(labelFor(START_KEY))
  })
})

describe('kanban date field resolution', () => {
  it('reads the deadline from the key the detail writes, then the schema end column', () => {
    expect(getKanbanDueDate(makeItem('a', { dueDate: DUE_KEY, endDate: START_KEY }))).toBe(DUE_KEY)
    expect(getKanbanDueDate(makeItem('b', { endDate: START_KEY }))).toBe(START_KEY)
    expect(getKanbanDueDate(makeItem('c', { startDate: START_KEY }))).toBe('')
  })

  it('ignores a date key no writer produces', () => {
    expect(getKanbanCardDate(makeItem('legacy', { date: DUE_KEY }))).toBe('')
  })

  it('falls back to the start date only when there is no deadline', () => {
    expect(getKanbanCardDate(makeItem('start-only', { startDate: START_KEY }))).toBe(START_KEY)
    expect(getKanbanCardDate(makeItem('both', { dueDate: DUE_KEY, startDate: START_KEY }))).toBe(DUE_KEY)
  })
})
