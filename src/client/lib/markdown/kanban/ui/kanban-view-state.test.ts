import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../../../lib/i18n'
import { installTestGlobals } from '../../../test-render'
import { useKanbanRootState } from './kanban-root-hooks'
import type { KanbanData, KanbanFilter } from '../types'

beforeAll(async () => {
  await initI18n()
})

function makeKanbanData(): KanbanData {
  return {
    title: 'Board',
    activeViewId: 'view-board',
    views: [
      { id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' },
      { id: 'view-table', name: 'Table', type: 'table' },
    ],
    columns: [
      { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
    ],
    items: [],
  }
}

type RootState = ReturnType<typeof useKanbanRootState>

function renderRootStateProbe() {
  installTestGlobals()
  const holder: { state: RootState } = { state: null as unknown as RootState }
  const commits: KanbanData[] = []
  const onUpdateData = vi.fn((next: KanbanData) => { commits.push(next) })

  function Probe() {
    const containerRef = useRef<HTMLElement | null>(null)
    holder.state = useKanbanRootState(makeKanbanData(), onUpdateData, containerRef)
    return createElement('div', { ref: containerRef })
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe)) })
  const unmount = () => {
    act(() => { root.unmount() })
    container.remove()
  }
  return { holder, commits, onUpdateData, unmount }
}

const boardFilters: KanbanFilter[] = [{ propertyId: 'status', operator: 'equals', value: 'todo' }]

describe('kanban view state persistence', () => {
  it('writes the selected view back into the committed data', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.setActiveViewId('view-table') })
    expect(commits.at(-1)!.activeViewId).toBe('view-table')
    expect(holder.state.filterSort.activeView.type).toBe('table')
    unmount()
  })

  it('stores filters, search and card size on the active view only', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.filterSort.setFilters(boardFilters) })
    act(() => { holder.state.filterSort.setSearchQuery('alpha') })
    act(() => { holder.state.filterSort.setCardSize('small') })
    expect(commits.at(-1)!.views[0]!.filters).toEqual(boardFilters)
    expect(commits.at(-1)!.views[0]!.searchQuery).toBe('alpha')
    expect(commits.at(-1)!.views[0]!.cardSize).toBe('small')

    act(() => { holder.state.setActiveViewId('view-table') })
    expect(holder.state.filterSort.filters).toEqual([])
    expect(holder.state.filterSort.searchQuery).toBe('')
    expect(holder.state.filterSort.cardSize).toBe('medium')

    act(() => { holder.state.setActiveViewId('view-board') })
    expect(holder.state.filterSort.filters).toEqual(boardFilters)
    expect(holder.state.filterSort.searchQuery).toBe('alpha')
    expect(holder.state.filterSort.cardSize).toBe('small')
    unmount()
  })

  it('keeps unset filter and sort lists referentially stable across view edits', () => {
    const { holder, unmount } = renderRootStateProbe()
    const filters = holder.state.filterSort.filters
    const sorts = holder.state.filterSort.sorts
    act(() => { holder.state.filterSort.setCardSize('large') })
    expect(holder.state.filterSort.filters).toBe(filters)
    expect(holder.state.filterSort.sorts).toBe(sorts)
    unmount()
  })

  it('re-renders the board on commit so callers see the persisted view state', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.filterSort.setSorts([{ propertyId: 'title', direction: 'asc' }]) })
    expect(commits.at(-1)!.views[0]!.sorts).toEqual([{ propertyId: 'title', direction: 'asc' }])
    expect(holder.state.data.views[0]!.sorts).toEqual([{ propertyId: 'title', direction: 'asc' }])
    unmount()
  })
})
