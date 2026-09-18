import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { initI18n } from '../../../../lib/i18n'
import { renderElement } from '../../../test-render'
import { KanbanHeader } from './kanban-header'
import type { KanbanData, KanbanItem } from '../types'

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

function renderHeader(visibleItems: KanbanItem[]) {
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
