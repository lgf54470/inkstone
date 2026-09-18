import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { KanbanTableView } from './kanban-table-view'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanData, KanbanFile, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

type TableProps = ComponentProps<typeof KanbanTableView>
type TableHandlers = Pick<
  TableProps,
  'onAddItem' | 'onAddColumn' | 'onUpdateProperty' | 'onUpdateSubtasks' | 'onUpdateFiles' | 'selectedIds'
>

function mountTable(data: KanbanData, props: TableHandlers) {
  installTestGlobals()
  const container = document.createElement('div')
  document.body.append(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      createElement(KanbanTableView, {
        data,
        view: data.views[0],
        onToggleSelect: vi.fn(),
        onToggleAll: vi.fn(),
        onOpenDetail: vi.fn(),
        ...props,
      }),
    )
  })
  return {
    container,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

const data: KanbanData = {
  columns: [
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'todo', label: 'To Do', color: 'gray' },
        { id: 'in_progress', label: 'In Progress', color: 'blue' },
      ],
    },
  ],
  items: [{ id: 'a', title: 'A', properties: { status: 'todo' } }],
  views: [{ id: 'v', name: 'Table', type: 'table', groupBy: 'status' }],
}

function addGroupButton(container: HTMLElement): HTMLButtonElement {
  const label = t('preview.kanban_add_new_group')
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label))
  if (!button) throw new Error(`no button labelled "${label}"`)
  return button
}

describe('KanbanTableView add group', () => {
  it('adds a group option instead of a card', () => {
    const onAddColumn = vi.fn()
    const onAddItem = vi.fn()
    const { container, unmount } = mountTable(data, handlers({ onAddItem, onAddColumn }))
    act(() => { addGroupButton(container).click() })
    expect(onAddColumn).toHaveBeenCalledTimes(1)
    expect(onAddItem).not.toHaveBeenCalled()
    unmount()
  })
})

const schemaColumns: KanbanProperty[] = [
  { id: 'title', name: 'Title', type: 'title' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'To Do', color: 'gray' },
      { id: 'in_progress', label: 'In Progress', color: 'blue' },
    ],
  },
  {
    id: 'priority',
    name: 'Priority',
    type: 'select',
    options: [
      { id: 'low', label: 'Low', color: 'green' },
      { id: 'high', label: 'High', color: 'red' },
    ],
  },
  { id: 'spec', name: 'Spec file', type: 'text' },
  { id: 'story', name: 'Story points', type: 'number' },
  { id: 'deadline', name: 'Deadline', type: 'date' },
  { id: 'tags', name: 'Tags', type: 'multi-select', options: [{ id: 'bug', label: 'Bug', color: 'red' }] },
  { id: 'reviewer', name: 'Reviewer', type: 'person' },
  { id: 'blocked', name: 'Blocked', type: 'checkbox' },
]

const schemaFile: KanbanFile = {
  id: 'f-1',
  name: 'report.pdf',
  size: 2048,
  mime: 'application/pdf',
  url: 'https://cdn.example.com/report.pdf',
}

const schemaData: KanbanData = {
  columns: schemaColumns,
  items: [
    {
      id: 'a',
      title: 'Design spec',
      files: [schemaFile],
      properties: {
        status: 'todo',
        priority: 'high',
        spec: 'docs/a.md',
        story: 5,
        deadline: '2026-09-30',
        tags: ['bug'],
        reviewer: 'Nora',
        blocked: true,
      },
    },
    { id: 'b', title: 'Empty ticket', properties: { status: 'in_progress' } },
  ],
  views: [{ id: 'v', name: 'Table', type: 'table', groupBy: 'status' }],
}

function headerLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-kanban-column]')]
    .filter((el) => !el.closest('[data-item-id]'))
    .map((el) => el.textContent ?? '')
}

function cellOf(container: HTMLElement, itemId: string, columnId: string): HTMLElement {
  const cell = container.querySelector<HTMLElement>(`[data-item-id="${itemId}"] [data-kanban-column="${columnId}"]`)
  if (!cell) throw new Error(`no cell for item "${itemId}" column "${columnId}"`)
  return cell
}

function cellText(container: HTMLElement, itemId: string, columnId: string): string {
  return cellOf(container, itemId, columnId).textContent ?? ''
}

function handlers(overrides: Partial<TableHandlers> = {}): TableHandlers {
  return {
    selectedIds: new Set<string>(),
    onAddItem: vi.fn(),
    onAddColumn: vi.fn(),
    onUpdateProperty: vi.fn(),
    onUpdateFiles: vi.fn(),
    ...overrides,
  }
}

describe('KanbanTableView schema columns', () => {
  it('headers every schema column in schema order and appends the attachments column', () => {
    const { container, unmount } = mountTable(schemaData, handlers())
    expect(headerLabels(container)).toEqual([
      ...schemaColumns.map((col) => formatKanbanPropertyName(col)),
      t('preview.kanban_files'),
    ])
    unmount()
  })

  it('renders each property value in its own column', () => {
    const { container, unmount } = mountTable(schemaData, handlers())
    expect(cellText(container, 'a', 'spec')).toContain('docs/a.md')
    expect(cellText(container, 'a', 'story')).toContain('5')
    expect(cellText(container, 'a', 'deadline')).toContain('2026-09-30')
    expect(cellText(container, 'a', 'reviewer')).toContain('Nora')
    expect(cellText(container, 'a', 'priority')).toContain(t('preview.kanban_priority_high'))
    expect(cellText(container, 'a', 'tags')).toContain(t('preview.kanban_tag_bug'))
    unmount()
  })
})

describe('KanbanTableView schema cells', () => {
  it('keeps a select column editable and writes the chosen option id', () => {
    const onUpdateProperty = vi.fn()
    const { container, unmount } = mountTable(schemaData, handlers({ onUpdateProperty }))
    const select = cellOf(container, 'a', 'priority').querySelector<HTMLSelectElement>('select')!
    expect(select.value).toBe('high')
    act(() => {
      select.value = 'low'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onUpdateProperty).toHaveBeenCalledWith('a', 'priority', 'low')
    unmount()
  })

  it('shows the option label when a document stored the label instead of the id', () => {
    const labelValued: KanbanData = {
      ...schemaData,
      items: [{ id: 'a', title: 'Imported', properties: { status: 'In Progress', priority: 'High' } }],
    }
    const { container, unmount } = mountTable(labelValued, handlers())
    expect(cellText(container, 'a', 'status')).toContain(t('preview.kanban_status_in_progress'))
    expect(cellText(container, 'a', 'priority')).toContain(t('preview.kanban_priority_high'))
    unmount()
  })

  it('moves tag chips out of the title cell into their own column', () => {
    const { container, unmount } = mountTable(schemaData, handlers())
    expect(cellText(container, 'a', 'title')).not.toContain(t('preview.kanban_tag_bug'))
    expect(cellText(container, 'a', 'title')).toContain('Design spec')
    unmount()
  })

  it('marks a checked checkbox column and leaves an empty cell as a dash', () => {
    const { container, unmount } = mountTable(schemaData, handlers())
    expect(cellOf(container, 'a', 'blocked').querySelector<HTMLInputElement>('input')?.checked).toBe(true)
    expect(cellText(container, 'b', 'spec')).toBe('-')
    expect(cellText(container, 'b', 'story')).toBe('-')
    unmount()
  })
})

describe('KanbanTableView attachments column', () => {
  it('writes attachments through the item files writer', () => {
    const onUpdateFiles = vi.fn()
    const { container, unmount } = mountTable(schemaData, handlers({ onUpdateFiles }))
    expect(cellText(container, 'a', 'files')).toContain('report.pdf')
    const deleteButton = cellOf(container, 'a', 'files').querySelector<HTMLButtonElement>(
      `button[title="${t('preview.kanban_delete_file')}"]`,
    )!
    act(() => { deleteButton.click() })
    expect(onUpdateFiles).toHaveBeenCalledWith('a', [])
    unmount()
  })
})
