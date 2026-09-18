import { useCallback } from 'react'
import { toggleKanbanColumnSort, toggleKanbanHiddenColumn } from '../filter-sort'
import type { KanbanFilter, KanbanSort, KanbanView } from '../types'
import type { CardSize } from './kanban-view-options'
import type { CommitKanbanData } from './kanban-history'

// Unset lists reuse these constants so memoized consumers keep the same
// identity across renders that only touch other view fields.
const EMPTY_FILTERS: KanbanFilter[] = []
const EMPTY_SORTS: KanbanSort[] = []
const EMPTY_HIDDEN_COLUMNS: string[] = []

// Both toggles read the committed view rather than the render-time one, so two
// clicks in one batch still cycle instead of both writing the same result.
function useKanbanViewToggles(activeViewId: string, commitData: CommitKanbanData) {
  const toggleByCommittedView = useCallback(
    (toggle: (view: KanbanView) => Partial<KanbanView>) => {
      commitData((prev) => ({
        ...prev,
        views: prev.views.map((view) => (view.id === activeViewId ? { ...view, ...toggle(view) } : view)),
      }))
    },
    [activeViewId, commitData],
  )
  const toggleSortColumn = useCallback(
    (propertyId: string) => toggleByCommittedView((view) => ({ sorts: toggleKanbanColumnSort(view.sorts, propertyId) })),
    [toggleByCommittedView],
  )
  const toggleHiddenColumn = useCallback(
    (propertyId: string) =>
      toggleByCommittedView((view) => ({ hiddenColumns: toggleKanbanHiddenColumn(view.hiddenColumns, propertyId) })),
    [toggleByCommittedView],
  )
  return { toggleSortColumn, toggleHiddenColumn }
}

export function useKanbanViewState(
  activeView: KanbanView,
  activeViewId: string,
  commitData: CommitKanbanData,
) {
  const searchQuery = activeView.searchQuery ?? ''
  const filters = activeView.filters ?? EMPTY_FILTERS
  const sorts = activeView.sorts ?? EMPTY_SORTS
  const cardSize: CardSize = activeView.cardSize ?? 'medium'
  const hiddenColumns = activeView.hiddenColumns ?? EMPTY_HIDDEN_COLUMNS
  const { toggleSortColumn, toggleHiddenColumn } = useKanbanViewToggles(activeViewId, commitData)

  const updateActiveView = useCallback((patch: Partial<KanbanView>) => {
    commitData((prev) => ({
      ...prev,
      views: prev.views.map((v) => (v.id === activeViewId ? { ...v, ...patch } : v)),
    }))
  }, [activeViewId, commitData])

  const setSearchQuery = useCallback((q: string) => updateActiveView({ searchQuery: q }), [updateActiveView])
  const setFilters = useCallback((next: KanbanFilter[]) => updateActiveView({ filters: next }), [updateActiveView])
  const setSorts = useCallback((next: KanbanSort[]) => updateActiveView({ sorts: next }), [updateActiveView])
  const setCardSize = useCallback((next: CardSize) => updateActiveView({ cardSize: next }), [updateActiveView])

  return {
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sorts,
    setSorts,
    toggleSortColumn,
    cardSize,
    setCardSize,
    hiddenColumns,
    toggleHiddenColumn,
    updateActiveView,
  }
}
