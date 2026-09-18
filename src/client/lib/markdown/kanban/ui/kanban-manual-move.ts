import { useMemo } from 'react'
import { t } from '../../../i18n'
import { useUi } from '../../../../store/ui'
import type { KanbanMovePivot } from '../dnd'
import type { KanbanSort } from '../types'

export function makeMoveItemClearingSorts(deps: {
  moveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void
  getSorts: () => KanbanSort[]
  clearSorts: () => void
  notifySortCleared: () => void
}): (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void {
  return (itemId, targetGroupKey, pivot) => {
    deps.moveItem(itemId, targetGroupKey, pivot)
    if (deps.getSorts().length > 0) {
      deps.clearSorts()
      deps.notifySortCleared()
    }
  }
}

export function useMoveItemClearingSorts(
  moveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void,
  filterSort: { sorts: KanbanSort[]; setSorts: (sorts: KanbanSort[]) => void },
) {
  return useMemo(
    () => makeMoveItemClearingSorts({
      moveItem,
      getSorts: () => filterSort.sorts,
      clearSorts: () => filterSort.setSorts([]),
      notifySortCleared: () => useUi.getState().toast({ title: t('preview.kanban_sort_cleared_for_drag') }),
    }),
    [moveItem, filterSort],
  )
}
