import { useCallback } from 'react'
import { toggleKanbanColumnSort } from '../filter-sort'
import type { KanbanFilter, KanbanSort, KanbanView } from '../types'
import type { CardSize } from './kanban-view-options'
import type { CommitKanbanData } from './kanban-history'

// Unset lists reuse these constants so memoized consumers keep the same
// identity across renders that only touch other view fields.
const EMPTY_FILTERS: KanbanFilter[] = []
const EMPTY_SORTS: KanbanSort[] = []

export function useKanbanViewState(
  activeView: KanbanView,
  activeViewId: string,
  commitData: CommitKanbanData,
) {
  const searchQuery = activeView.searchQuery ?? ''
  const filters = activeView.filters ?? EMPTY_FILTERS
  const sorts = activeView.sorts ?? EMPTY_SORTS
  const cardSize: CardSize = activeView.cardSize ?? 'medium'

  const updateActiveView = useCallback((patch: Partial<KanbanView>) => {
    commitData((prev) => ({
      ...prev,
      views: prev.views.map((v) => (v.id === activeViewId ? { ...v, ...patch } : v)),
    }))
  }, [activeViewId, commitData])

  const setSearchQuery = useCallback((q: string) => updateActiveView({ searchQuery: q }), [updateActiveView])
  const setFilters = useCallback((next: KanbanFilter[]) => updateActiveView({ filters: next }), [updateActiveView])
  const setSorts = useCallback((next: KanbanSort[]) => updateActiveView({ sorts: next }), [updateActiveView])
  // Reads the committed view rather than the render-time one, so two header
  // clicks in one batch still cycle asc then desc instead of both writing asc.
  const toggleSortColumn = useCallback(
    (propertyId: string) => {
      commitData((prev) => ({
        ...prev,
        views: prev.views.map((view) =>
          view.id === activeViewId ? { ...view, sorts: toggleKanbanColumnSort(view.sorts, propertyId) } : view,
        ),
      }))
    },
    [activeViewId, commitData],
  )
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
    updateActiveView,
  }
}
