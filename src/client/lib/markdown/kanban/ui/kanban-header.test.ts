import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { initI18n, t } from '../../../../lib/i18n'
import { renderElement } from '../../../test-render'
import { formatKanbanPropertyName } from '../i18n-helpers'
import { KanbanHeader } from './kanban-header'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

const statusColumn = {
  id: 'status',
  name: 'Status',
  type: 'select' as const,
  options: [
    { id: 'done', label: 'Done', color: 'green' as const },
    { id: 'todo', label: 'To Do', color: 'gray' as const },
  ],
}

function item(id: string, status: string): KanbanItem {
  return { id, title: id, properties: { status } }
}

const allItems = [item('a', 'done'), item('b', 'todo')]

const data: KanbanData = {
  columns: [statusColumn],
  items: allItems,
  views: [{ id: 'v', name: 'Board', type: 'board', groupBy: 'status' }],
}

function renderHeader(visibleItems: KanbanItem[], extra: Partial<ComponentProps<typeof KanbanHeader>> = {}) {
  return renderElement(
    createElement(KanbanHeader, {
      data,
      visibleItems,
      activeView: data.views[0]!,
      searchQuery: '',
      filters: [],
      sorts: [],
      onSelectView: vi.fn(),
      onSearchChange: vi.fn(),
      onChangeFilters: vi.fn(),
      onChangeSorts: vi.fn(),
      onAddItem: vi.fn(),
      ...extra,
    }),
  )
}

describe('KanbanHeader progress bar scope', () => {
  it('segments reflect the visible (filtered) items, not the whole board', () => {
    const rendered = renderHeader([allItems[0]!])
    try {
      expect(document.querySelector('[title="Done: 1 (100%)"]')).toBeTruthy()
      expect(document.querySelector('[title="To Do: 1 (50%)"]')).toBeNull()
    } finally {
      rendered.unmount()
    }
  })

  it('shows every status when nothing is filtered out', () => {
    const rendered = renderHeader(allItems)
    try {
      expect(document.querySelector('[title="Done: 1 (50%)"]')).toBeTruthy()
      expect(document.querySelector('[title="To Do: 1 (50%)"]')).toBeTruthy()
    } finally {
      rendered.unmount()
    }
  })
})

const tableColumns: KanbanProperty[] = [
  { id: 'title', name: 'Title', type: 'title' },
  statusColumn,
  { id: 'spec', name: 'Spec file', type: 'text' },
]

function renderTableHeader(hiddenColumns: string[], onToggleHiddenColumn = vi.fn()) {
  const tableData: KanbanData = {
    columns: tableColumns,
    items: allItems,
    views: [{ id: 'vt', name: 'Table', type: 'table', groupBy: 'status', hiddenColumns }],
  }
  const rendered = renderElement(
    createElement(KanbanHeader, {
      data: tableData,
      visibleItems: allItems,
      activeView: tableData.views[0]!,
      searchQuery: '',
      filters: [],
      sorts: [],
      onSelectView: vi.fn(),
      onSearchChange: vi.fn(),
      onChangeFilters: vi.fn(),
      onChangeSorts: vi.fn(),
      onAddItem: vi.fn(),
      onToggleHiddenColumn,
    }),
  )
  return { ...rendered, onToggleHiddenColumn }
}

function columnToggle(container: HTMLElement, columnName: string): HTMLInputElement | null {
  const label = [...container.querySelectorAll('label')].find((el) => el.textContent?.includes(columnName))
  return label?.querySelector('input[type="checkbox"]') ?? null
}

function columnName(columnId: string): string {
  const column = tableColumns.find((col) => col.id === columnId)
  if (!column) throw new Error(`no fixture column "${columnId}"`)
  return formatKanbanPropertyName(column)
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(name))
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

describe('KanbanHeader column visibility', () => {
  it('lists the table columns and reports the one being toggled', () => {
    const { container, unmount, onToggleHiddenColumn } = renderTableHeader(['spec'])
    try {
      act(() => { buttonNamed(container, t('preview.kanban_columns')).click() })
      const panel = container.querySelector<HTMLElement>('[role="dialog"]')!
      expect(columnToggle(panel, columnName('title'))).toBeNull()
      expect(columnToggle(panel, columnName('spec'))?.checked).toBe(false)
      act(() => { columnToggle(panel, columnName('status'))!.click() })
      expect(onToggleHiddenColumn).toHaveBeenCalledWith('status')
    } finally {
      unmount()
    }
  })

  it('keeps the board view options free of column toggles', () => {
    const rendered = renderHeader(allItems, {
      cardSize: 'medium',
      onChangeCardSize: vi.fn(),
      onChangeGroupBy: vi.fn(),
      onToggleHiddenColumn: vi.fn(),
    })
    try {
      act(() => { buttonNamed(rendered.container, t('preview.kanban_group_by')).click() })
      const panel = rendered.container.querySelector<HTMLElement>('[role="dialog"]')!
      expect(panel.querySelector('select')).toBeTruthy()
      expect(panel.querySelector('input[type="checkbox"]')).toBeNull()
    } finally {
      rendered.unmount()
    }
  })
})
