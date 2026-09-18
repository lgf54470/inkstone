import { useCallback, useMemo, useState, type RefObject } from 'react'
import {
  applyKanbanFilters,
  applyKanbanSorts,
  searchKanbanItems,
} from '../filter-sort'
import { t } from '../../../i18n'
import { reorderKanbanColumns, reorderKanbanItems } from '../dnd'
import type { KanbanMovePivot } from '../dnd'
import { createKanbanId } from '../id'
import type {
  KanbanColorName,
  KanbanData,
  KanbanFilter,
  KanbanItem,
  KanbanOption,
  KanbanProperty,
  KanbanSort,
  KanbanSubtask,
  KanbanView,
} from '../types'
import type { CardSize } from './kanban-view-options'
import { useKanbanHistory } from './kanban-history'
import { useMoveItemClearingSorts } from './kanban-manual-move'

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
  setDetailItem: (item: KanbanItem | null) => void,
) {
  const handleMoveItem = useCallback(
    (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => {
      const groupPropertyId = activeView.groupBy || 'status'
      const nextItems = reorderKanbanItems(data.items, itemId, groupPropertyId, targetGroupKey, pivot)
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

  return { handleMoveItem, handleUpdateTitle, handleUpdateItem, handleUpdateTags }
}

export function useKanbanItemLifecycle(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  detailItem: KanbanItem | null,
  setDetailItem: (item: KanbanItem | null) => void,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
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

  const handleConvertSubtaskToItem = useCallback((itemId: string, subtaskId: string) => {
    const converted = convertSubtaskInItems(data.items, itemId, subtaskId)
    if (!converted) return
    commitData({ ...data, items: converted.items })
    if (detailItem?.id === itemId) setDetailItem(converted.strippedParent)
  }, [data, detailItem, commitData, setDetailItem])

  return { handleDeleteItem, handleConvertSubtaskToItem }
}

function convertSubtaskInItems(
  items: KanbanItem[],
  itemId: string,
  subtaskId: string,
): { items: KanbanItem[]; strippedParent: KanbanItem } | null {
  const parentIdx = items.findIndex((item) => item.id === itemId)
  const parent = parentIdx === -1 ? undefined : items[parentIdx]
  const subtask = parent?.subtasks?.find((st) => st.id === subtaskId)
  if (!parent || !subtask) return null
  const strippedParent: KanbanItem = {
    ...parent,
    subtasks: parent.subtasks?.filter((st) => st.id !== subtaskId),
  }
  const nextItems = [...items]
  nextItems[parentIdx] = strippedParent
  nextItems.splice(parentIdx + 1, 0, subtaskAsKanbanItem(subtask, parent.properties))
  return { items: nextItems, strippedParent }
}

function subtaskAsKanbanItem(
  subtask: KanbanSubtask,
  parentProperties: Record<string, unknown>,
): KanbanItem {
  const properties: Record<string, unknown> = {}
  const status = subtask.status ?? parentProperties.status
  if (status !== undefined) properties.status = status
  if (subtask.dueDate) properties.dueDate = subtask.dueDate
  if (subtask.startDate) properties.startDate = subtask.startDate
  if (subtask.priority) properties.priority = subtask.priority
  if (subtask.tags?.length) properties.tags = [...subtask.tags]
  const item: KanbanItem = {
    id: `item-${createKanbanId()}`,
    title: subtask.title,
    properties,
  }
  if (subtask.icon) item.icon = subtask.icon
  if (subtask.description) {
    item.content = subtask.description
    item.description = subtask.description
  }
  return item
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
  activeView: KanbanView,
) {
  const handleAddItem = useCallback((defaults?: Record<string, unknown>) => {
    const newItemId = `item-${createKanbanId()}`
    const statusVal = data.columns.find((c) => c.id === 'status')?.options?.[0]?.id || 'todo'
    const propsObj: Record<string, unknown> = { status: statusVal, ...defaults }
    const newItem: KanbanItem = {
      id: newItemId,
      title: t('preview.kanban_new_task'),
      properties: propsObj,
    }
    commitData({ ...data, items: [...data.items, newItem] })
    setDetailItem(newItem)
  }, [data, commitData, setDetailItem])

  // Board columns hand over their group key; it belongs to the view's groupBy
  // property, which is not necessarily `status`.
  const handleAddItemInGroup = useCallback((groupKey?: string) => {
    if (!groupKey || groupKey === '__none__') {
      handleAddItem()
      return
    }
    handleAddItem({ [activeView.groupBy || 'status']: groupKey })
  }, [activeView.groupBy, handleAddItem])

  const handleAddColumn = useCallback(() => {
    const statusCol = data.columns.find((c) => c.id === 'status')
    if (!statusCol) return
    const colors: KanbanColorName[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'gray']
    const newColor = colors[(statusCol.options?.length ?? 0) % colors.length]!
    const newOpt: KanbanOption = {
      id: `status-${createKanbanId()}`,
      label: t('preview.kanban_new_group_title', { value0: (statusCol.options?.length ?? 0) + 1 }),
      color: newColor,
    }
    const nextCols = data.columns.map((c) => (c.id === 'status' ? { ...c, options: [...(c.options ?? []), newOpt] } : c))
    commitData({ ...data, columns: nextCols })
  }, [data, commitData])

  return { handleAddItem, handleAddItemInGroup, handleAddColumn }
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

export function useKanbanRootState(
  initialData: KanbanData,
  onUpdateData: (next: KanbanData) => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  const history = useKanbanHistory(initialData, onUpdateData, containerRef)
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
  const items = useKanbanItemMutations(data, commitData, filterSort.activeView, setDetailItem)
  const itemLifecycle = useKanbanItemLifecycle(
    data,
    commitData,
    detailItem,
    setDetailItem,
    selection.setSelectedIds,
  )
  const adds = useKanbanAddOperations(data, commitData, setDetailItem, filterSort.activeView)
  const columnOps = useKanbanColumnOperations(data, commitData, filterSort.activeView)

  const handleMoveItem = useMoveItemClearingSorts(items.handleMoveItem, filterSort)

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
    items: { ...items, ...itemLifecycle, handleMoveItem },
    adds,
    columnOps,
    history,
    handleUpdateBoardTitle,
  }
}

function duplicateKanbanItem(item: KanbanItem): KanbanItem {
  return {
    ...item,
    id: `item-${createKanbanId()}`,
    title: `${item.title} (${t('common.copy')})`,
    subtasks: item.subtasks?.map((st) => ({
      ...st,
      id: `subtask-${createKanbanId()}`,
    })),
  }
}

export function useKanbanContextMenuState(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [targetItem, setTargetItem] = useState<KanbanItem | null>(null)

  const handleDuplicateItem = useCallback(
    (item: KanbanItem) => {
      const newItem = duplicateKanbanItem(item)
      const idx = data.items.findIndex((i) => i.id === item.id)
      const nextItems = [...data.items]
      if (idx >= 0) nextItems.splice(idx + 1, 0, newItem)
      else nextItems.push(newItem)
      commitData({ ...data, items: nextItems })
    },
    [data, commitData],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable="true"]')) {
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()

      const itemEl = target.closest('[data-item-id]') as HTMLElement | null
      const itemId = itemEl?.dataset.itemId
      const found = itemId ? data.items.find((it) => it.id === itemId) || null : null

      setTargetItem(found)
      setPoint({ x: e.clientX, y: e.clientY })
    },
    [data.items],
  )

  const handleClose = useCallback(() => {
    setPoint(null)
    setTargetItem(null)
  }, [])

  return { point, targetItem, handleContextMenu, handleClose, handleDuplicateItem }
}

