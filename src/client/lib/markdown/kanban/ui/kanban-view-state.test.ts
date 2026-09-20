import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../../lib/i18n'
import { useUi } from '../../../../store/ui'
import { installTestGlobals } from '../../../test-render'
import { useKanbanRootState } from './kanban-root-hooks'
import type { KanbanData, KanbanFilter } from '../types'

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
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

describe('kanban column sort toggling', () => {
  it('cycles a clicked column through asc, desc and unsorted on the active view', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    const toggle = holder.state.filterSort.toggleSortColumn
    act(() => { holder.state.filterSort.toggleSortColumn('status') })
    expect(commits.at(-1)!.views[0]!.sorts).toEqual([{ propertyId: 'status', direction: 'asc' }])
    act(() => { holder.state.filterSort.toggleSortColumn('status') })
    expect(commits.at(-1)!.views[0]!.sorts).toEqual([{ propertyId: 'status', direction: 'desc' }])
    act(() => { holder.state.filterSort.toggleSortColumn('status') })
    expect(commits.at(-1)!.views[0]!.sorts).toEqual([])
    expect(holder.state.filterSort.toggleSortColumn).toBe(toggle)
    unmount()
  })
})

describe('kanban column visibility state', () => {
  it('hides and restores columns on the active view only', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    expect(holder.state.filterSort.hiddenColumns).toEqual([])
    act(() => { holder.state.filterSort.toggleHiddenColumn('status') })
    expect(commits.at(-1)!.views[0]!.hiddenColumns).toEqual(['status'])
    expect(holder.state.filterSort.hiddenColumns).toEqual(['status'])
    act(() => { holder.state.filterSort.toggleHiddenColumn('assignee') })
    expect(commits.at(-1)!.views[0]!.hiddenColumns).toEqual(['status', 'assignee'])
    act(() => { holder.state.filterSort.toggleHiddenColumn('status') })
    expect(commits.at(-1)!.views[0]!.hiddenColumns).toEqual(['assignee'])
    expect(commits.at(-1)!.views[1]!.hiddenColumns).toBeUndefined()
    unmount()
  })

  it('keeps an unset hidden column list referentially stable across view edits', () => {
    const { holder, unmount } = renderRootStateProbe()
    const hidden = holder.state.filterSort.hiddenColumns
    act(() => { holder.state.filterSort.setCardSize('large') })
    expect(holder.state.filterSort.hiddenColumns).toBe(hidden)
    unmount()
  })
})

// The pure document edits are covered in ../view-ops.test.ts; what is only observable here is that
// they go through the board's one commit path — which is what makes a deleted view recoverable by
// the same undo that the toast hands the reader.
describe('kanban view operations', () => {
  it('commits a created view and puts it on screen', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.viewOps.createView('gantt') })
    const added = commits.at(-1)!.views.at(-1)!
    expect(commits.at(-1)!.views).toHaveLength(3)
    expect(added.type).toBe('gantt')
    expect(commits.at(-1)!.activeViewId).toBe(added.id)
    expect(holder.state.filterSort.activeView.type).toBe('gantt')
    unmount()
  })

  it('copies the view the reader is looking at, filters and all', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.filterSort.setFilters(boardFilters) })
    act(() => { holder.state.viewOps.duplicateView('view-board') })
    const next = commits.at(-1)!
    expect(next.views[1]!.type).toBe('board')
    expect(next.views[1]!.filters).toEqual(boardFilters)
    expect(next.activeViewId).toBe(next.views[1]!.id)
    unmount()
  })

  it('renames one view without rewriting the others', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.viewOps.renameView('view-table', 'Backlog') })
    expect(commits.at(-1)!.views[1]!.name).toBe('Backlog')
    expect(commits.at(-1)!.views[0]).toEqual(commits[0]!.views[0])
    unmount()
  })

  it('steps a tab along the strip and keeps the view it shows', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.viewOps.moveView('view-table', -1) })
    expect(commits.at(-1)!.views.map((v) => v.id)).toEqual(['view-table', 'view-board'])
    expect(commits.at(-1)!.activeViewId).toBe('view-board')
    unmount()
  })
})

function lastToast() {
  return useUi.getState().toasts.at(-1)
}

// The pure document edits are covered in ./kanban-column-schema.test.ts; what is only observable
// here is that they go through the board's one commit path, which is what makes a deleted column
// come back through the same undo the toast hands the reader.
describe('kanban column schema operations', () => {
  it('adds a column through the boards one commit path', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.schemaOps.addColumn('Sprint', 'date') })
    expect(commits.at(-1)!.columns.at(-1)).toMatchObject({ name: 'Sprint', type: 'date' })
    expect(holder.state.data.columns).toHaveLength(2)
    unmount()
  })

  it('renames, retypes and moves a column on the active document', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.schemaOps.addColumn('Sprint', 'date') })
    const id = commits.at(-1)!.columns.at(-1)!.id
    act(() => { holder.state.schemaOps.renameColumn(id, 'Iteration') })
    expect(commits.at(-1)!.columns.at(-1)!.name).toBe('Iteration')
    act(() => { holder.state.schemaOps.changeColumnType(id, 'text') })
    expect(commits.at(-1)!.columns.at(-1)!.type).toBe('text')
    act(() => { holder.state.schemaOps.moveColumn(id, -1) })
    expect(commits.at(-1)!.columns.map((c) => c.name)).toEqual(['Iteration', 'Status'])
    unmount()
  })

  it('runs a deleted column back in from the toast, through the board history', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.schemaOps.deleteColumn('status') })
    expect(commits.at(-1)!.columns).toHaveLength(0)
    expect(lastToast()).toMatchObject({ title: t('preview.kanban_column_deleted'), kind: 'undo' })
    act(() => { lastToast()!.action!.run() })
    expect(commits.at(-1)!.columns.map((c) => c.id)).toEqual(['status'])
    unmount()
  })

  // A resize is the one schema edit with no toast of its own — it happens in a drag — so this is
  // the only place that proves Ctrl+Z reaches it.
  it('sizes a column and hands the step back to the board history', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.schemaOps.resizeColumn('status', 240) })
    expect(commits.at(-1)!.columns.find((c) => c.id === 'status')!.width).toBe(240)
    act(() => { holder.state.history.undo() })
    expect(holder.state.data.columns.find((c) => c.id === 'status')!.width).toBeUndefined()
    unmount()
  })
})

describe('undoing a view delete', () => {
  it('runs a deleted view back in from the toast, through the board history', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.viewOps.deleteView('view-table') })
    expect(commits.at(-1)!.views.map((v) => v.id)).toEqual(['view-board'])
    expect(lastToast()).toMatchObject({ title: t('preview.kanban_view_deleted'), kind: 'undo' })
    act(() => { lastToast()!.action!.run() })
    expect(commits.at(-1)!.views.map((v) => v.id)).toEqual(['view-board', 'view-table'])
    unmount()
  })

  it('leaves the last view on the board instead of emptying it', () => {
    const { holder, commits, unmount } = renderRootStateProbe()
    act(() => { holder.state.viewOps.deleteView('view-table') })
    act(() => { holder.state.viewOps.deleteView('view-board') })
    expect(holder.state.data.views.map((v) => v.id)).toEqual(['view-board'])
    expect(commits).toHaveLength(1)
    unmount()
  })
})
