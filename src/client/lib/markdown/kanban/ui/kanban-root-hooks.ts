import { useCallback, useMemo, useState } from 'react'
import {
  applyKanbanFilters,
  applyKanbanSorts,
  searchKanbanItems,
} from '../filter-sort'
import { t } from '../../../i18n'
import { reorderKanbanColumns, reorderKanbanItems } from '../dnd'
import type {
  KanbanColorName,
  KanbanData,
  KanbanFilter,
  KanbanItem,
  KanbanOption,
  KanbanSort,
  KanbanView,
} from '../types'
import type { CardSize } from './kanban-view-options'

export function useKanbanFilterSort(data: KanbanData, activeViewId: string) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<KanbanFilter[]>([])
  const [sorts, setSorts] = useState<KanbanSort[]>([])

  const activeView: KanbanView = useMemo(() => {
    return data.views.find((v) => v.id === activeViewId) || data.views[0] || {
      id: 'view-board',
      name: 'Board',
      type: 'board',
      groupBy: 'status',
    }
  }, [data.views, activeViewId])

  const filteredItems = useMemo(() => {
    let result = searchKanbanItems(data.items, searchQuery)
    result = applyKanbanFilters(result, filters)
    result = applyKanbanSorts(result, sorts)
    return result
  }, [data.items, searchQuery, filters, sorts])

  const viewData: KanbanData = useMemo(() => ({ ...data, items: filteredItems }), [data, filteredItems])

  return { activeView, searchQuery, setSearchQuery, filters, setFilters, sorts, setSorts, viewData }
}

export function useKanbanItemMutations(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  activeView: KanbanView,
  detailItem: KanbanItem | null,
  setDetailItem: (item: KanbanItem | null) => void,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const handleMoveItem = useCallback(
    (itemId: string, targetGroupKey: string, targetIndex?: number) => {
      const groupPropertyId = activeView.groupBy || 'status'
      const nextItems = reorderKanbanItems(data.items, itemId, groupPropertyId, targetGroupKey, targetIndex)
      commitData({ ...data, items: nextItems })
    },
    [data, activeView.groupBy, commitData],
  )

  const handleUpdateTitle = useCallback((id: string, newTitle: string) => {
    const nextItems = data.items.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    commitData({ ...data, items: nextItems })
  }, [data, commitData])

  const handleUpdateItem = useCallback((updated: KanbanItem) => {
    const nextItems = data.items.map((item) => (item.id === updated.id ? updated : item))
    commitData({ ...data, items: nextItems })
    setDetailItem(updated)
  }, [data, commitData, setDetailItem])

  const handleDeleteItem = useCallback((id: string) => {
    const nextItems = data.items.filter((item) => item.id !== id)
    commitData({ ...data, items: nextItems })
    if (detailItem?.id === id) setDetailItem(null)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [data, detailItem, commitData, setDetailItem, setSelectedIds])

  return { handleMoveItem, handleUpdateTitle, handleUpdateItem, handleDeleteItem }
}

function deleteColumnFromData(data: KanbanData, groupKey: string, groupByPropertyId: string): KanbanData {
  const nextCols = data.columns.map((col) => {
    if (col.id !== groupByPropertyId || !col.options) return col
    return { ...col, options: col.options.filter((opt) => opt.id !== groupKey) }
  })
  const nextItems = data.items.map((it) =>
    it.properties[groupByPropertyId] === groupKey
      ? { ...it, properties: { ...it.properties, [groupByPropertyId]: undefined } }
      : it,
  )
  return { ...data, columns: nextCols, items: nextItems }
}

export function useKanbanColumnOperations(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  activeView: KanbanView,
) {
  const groupByPropertyId = activeView.groupBy || 'status'

  const handleReorderColumns = useCallback(
    (sourceGroupKey: string, targetGroupKey: string) => {
      const nextCols = reorderKanbanColumns(data.columns, groupByPropertyId, sourceGroupKey, targetGroupKey)
      commitData({ ...data, columns: nextCols })
    },
    [data, groupByPropertyId, commitData],
  )

  const handleUpdateColumn = useCallback(
    (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => {
      const nextCols = data.columns.map((col) => {
        if (col.id !== groupByPropertyId || !col.options) return col
        const nextOptions = col.options.map((opt) => (opt.id === groupKey ? { ...opt, ...patch } : opt))
        return { ...col, options: nextOptions }
      })
      commitData({ ...data, columns: nextCols })
    },
    [data, groupByPropertyId, commitData],
  )

  const handleDeleteColumn = useCallback(
    (groupKey: string) => {
      commitData(deleteColumnFromData(data, groupKey, groupByPropertyId))
    },
    [data, groupByPropertyId, commitData],
  )

  const handleChangeGroupBy = useCallback(
    (newGroupBy: string) => {
      const nextViews = data.views.map((v) => (v.id === activeView.id ? { ...v, groupBy: newGroupBy } : v))
      commitData({ ...data, views: nextViews })
    },
    [data, activeView.id, commitData],
  )

  return { handleReorderColumns, handleUpdateColumn, handleDeleteColumn, handleChangeGroupBy }
}

export function useKanbanAddOperations(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  setDetailItem: (item: KanbanItem | null) => void,
) {
  const handleAddItem = useCallback((defaults?: string | Record<string, unknown>) => {
    const newItemId = `item-${Date.now()}`
    let propsObj: Record<string, unknown> = {}
    if (typeof defaults === 'object' && defaults !== null) {
      propsObj = { ...defaults }
    } else if (typeof defaults === 'string' && defaults !== '__none__') {
      propsObj = { status: defaults }
    } else {
      const statusVal = data.columns.find((c) => c.id === 'status')?.options?.[0]?.id || 'todo'
      propsObj = { status: statusVal }
    }
    const newItem: KanbanItem = {
      id: newItemId,
      title: t('preview.kanban_new_task'),
      properties: propsObj,
    }
    commitData({ ...data, items: [...data.items, newItem] })
    setDetailItem(newItem)
  }, [data, commitData, setDetailItem])

  const handleAddColumn = useCallback(() => {
    const statusCol = data.columns.find((c) => c.id === 'status')
    if (!statusCol) return
    const colors: KanbanColorName[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'gray']
    const newColor = colors[(statusCol.options?.length ?? 0) % colors.length]!
    const newOpt: KanbanOption = {
      id: `status-${Date.now()}`,
      label: t('preview.kanban_new_group_title', { value0: (statusCol.options?.length ?? 0) + 1 }),
      color: newColor,
    }
    const nextCols = data.columns.map((c) => (c.id === 'status' ? { ...c, options: [...(c.options ?? []), newOpt] } : c))
    commitData({ ...data, columns: nextCols })
  }, [data, commitData])

  return { handleAddItem, handleAddColumn }
}

export function useKanbanSelection(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBatchStatusChange = useCallback((statusId: string) => {
    const nextItems = data.items.map((item) =>
      selectedIds.has(item.id) ? { ...item, properties: { ...item.properties, status: statusId } } : item,
    )
    commitData({ ...data, items: nextItems })
    setSelectedIds(new Set())
  }, [data, selectedIds, commitData])

  const handleBatchDelete = useCallback(() => {
    const nextItems = data.items.filter((item) => !selectedIds.has(item.id))
    commitData({ ...data, items: nextItems })
    setSelectedIds(new Set())
  }, [data, selectedIds, commitData])

  return { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection, handleBatchStatusChange, handleBatchDelete }
}

export function useKanbanRootState(initialData: KanbanData, onUpdateData: (next: KanbanData) => void) {
  const [data, setData] = useState<KanbanData>(initialData)
  const [activeViewId, setActiveViewId] = useState<string>(() => initialData.activeViewId || initialData.views[0]?.id || 'view-board')
  const [detailItem, setDetailItem] = useState<KanbanItem | null>(null)
  const [cardSize, setCardSize] = useState<CardSize>('medium')

  const commitData = useCallback((next: KanbanData) => {
    setData(next)
    onUpdateData(next)
  }, [onUpdateData])

  const filterSort = useKanbanFilterSort(data, activeViewId)
  const selection = useKanbanSelection(data, commitData)
  const items = useKanbanItemMutations(data, commitData, filterSort.activeView, detailItem, setDetailItem, selection.setSelectedIds)
  const adds = useKanbanAddOperations(data, commitData, setDetailItem)
  const columnOps = useKanbanColumnOperations(data, commitData, filterSort.activeView)

  return {
    data,
    cardSize,
    setCardSize,
    detailItem,
    setDetailItem,
    setActiveViewId,
    commitData,
    filterSort,
    selection,
    items,
    adds,
    columnOps,
  }
}
