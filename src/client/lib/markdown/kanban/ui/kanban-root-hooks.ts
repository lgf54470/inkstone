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
  KanbanProperty,
  KanbanSort,
  KanbanView,
} from '../types'
import type { CardSize } from './kanban-view-options'
import { useKanbanHistory } from './kanban-history'

function filterAndSortItems(
  items: KanbanItem[],
  searchQuery: string,
  selectedTags: string[],
  filters: KanbanFilter[],
  sorts: KanbanSort[],
): KanbanItem[] {
  let result = searchKanbanItems(items, searchQuery)
  if (selectedTags.length > 0) {
    result = result.filter((item) => {
      const itemTags = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
      const subtaskTags = item.subtasks?.flatMap((st) => st.tags || []) || []
      const combined = [...itemTags, ...subtaskTags]
      return selectedTags.some((tag) => combined.includes(tag))
    })
  }
  result = applyKanbanFilters(result, filters)
  return applyKanbanSorts(result, sorts)
}

export function useKanbanFilterSort(data: KanbanData, activeViewId: string) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<KanbanFilter[]>([])
  const [sorts, setSorts] = useState<KanbanSort[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const activeView: KanbanView = useMemo(() => {
    return data.views.find((v) => v.id === activeViewId) || data.views[0] || {
      id: 'view-board',
      name: 'Board',
      type: 'board',
      groupBy: 'status',
    }
  }, [data.views, activeViewId])

  const filteredItems = useMemo(
    () => filterAndSortItems(data.items, searchQuery, selectedTags, filters, sorts),
    [data.items, searchQuery, selectedTags, filters, sorts],
  )

  const onToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  const onClearTags = useCallback(() => {
    setSelectedTags([])
  }, [])

  const viewData: KanbanData = useMemo(() => ({ ...data, items: filteredItems }), [data, filteredItems])

  return {
    activeView,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sorts,
    setSorts,
    selectedTags,
    setSelectedTags,
    onToggleTag,
    onClearTags,
    viewData,
  }
}

export function useKanbanItemMutations(
  data: KanbanData,
  commitData: (next: KanbanData | ((prev: KanbanData) => KanbanData)) => void,
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
  const handleUpdateTags = useCallback(
    (id: string, tags: string[], newOption?: KanbanOption) => {
      commitData((prev: KanbanData) => {
        const nextItems = prev.items.map((item) =>
          item.id === id ? { ...item, properties: { ...item.properties, tags } } : item,
        )
        const nextColumns = newOption ? appendOptionToColumn(prev.columns, 'tags', newOption) : prev.columns
        return { ...prev, items: nextItems, columns: nextColumns }
      })
    },
    [commitData],
  )

  return { handleMoveItem, handleUpdateTitle, handleUpdateItem, handleDeleteItem, handleUpdateTags }
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

function updateColumnInList(
  columns: KanbanProperty[],
  groupByPropertyId: string,
  groupKey: string,
  patch: { label?: string; color?: KanbanColorName },
): KanbanProperty[] {
  return columns.map((col) => {
    if (col.id !== groupByPropertyId || !col.options) return col
    const nextOptions = col.options.map((opt: KanbanOption) => (opt.id === groupKey ? { ...opt, ...patch } : opt))
    return { ...col, options: nextOptions }
  })
}

function appendOptionToColumn(columns: KanbanProperty[], columnId: string, option: KanbanOption): KanbanProperty[] {
  const colIndex = columns.findIndex((col) => col.id === columnId)
  if (colIndex === -1) {
    return [...columns, { id: columnId, name: columnId === 'tags' ? 'Tags' : columnId, type: 'multi-select', options: [option] }]
  }
  return columns.map((col) => {
    if (col.id !== columnId) return col
    const existing = col.options ?? []
    const matchIndex = existing.findIndex((o: KanbanOption) => o.id === option.id || o.label === option.label)
    if (matchIndex !== -1) {
      const updated = [...existing]
      updated[matchIndex] = { ...updated[matchIndex]!, color: option.color }
      return { ...col, options: updated }
    }
    return { ...col, options: [...existing, option] }
  })
}

export function useKanbanColumnOperations(
  data: KanbanData,
  commitData: (next: KanbanData | ((prev: KanbanData) => KanbanData)) => void,
  activeView: KanbanView,
) {
  const groupByPropertyId = activeView.groupBy || 'status'

  const handleReorderColumns = useCallback(
    (sourceGroupKey: string, targetGroupKey: string) => {
      commitData({ ...data, columns: reorderKanbanColumns(data.columns, groupByPropertyId, sourceGroupKey, targetGroupKey) })
    },
    [data, groupByPropertyId, commitData],
  )

  const handleUpdateColumn = useCallback(
    (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => {
      commitData({ ...data, columns: updateColumnInList(data.columns, groupByPropertyId, groupKey, patch) })
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

  const handleAddColumnOption = useCallback(
    (columnId: string, option: KanbanOption) => {
      commitData((prev: KanbanData) => ({
        ...prev,
        columns: appendOptionToColumn(prev.columns, columnId, option),
      }))
    },
    [commitData],
  )

  return { handleReorderColumns, handleUpdateColumn, handleDeleteColumn, handleChangeGroupBy, handleAddColumnOption }
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
  const history = useKanbanHistory(initialData, onUpdateData)
  const { data, commitData } = history
  const [activeViewId, setActiveViewId] = useState<string>(() => initialData.activeViewId || initialData.views[0]?.id || 'view-board')
  const [detailItem, setDetailItem] = useState<KanbanItem | null>(null)
  const [cardSize, setCardSize] = useState<CardSize>('medium')

  const handleUpdateBoardTitle = useCallback(
    (title: string) => {
      commitData((prev: KanbanData) => ({ ...prev, title }))
    },
    [commitData],
  )

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
    history,
    handleUpdateBoardTitle,
  }
}
