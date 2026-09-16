import { memo, useCallback, useMemo, useState } from 'react'
import {
  applyKanbanFilters,
  applyKanbanSorts,
  searchKanbanItems,
} from '../filter-sort'
import type {
  KanbanColorName,
  KanbanData,
  KanbanFilter,
  KanbanItem,
  KanbanOption,
  KanbanSort,
  KanbanView,
} from '../types'
import { KanbanBatchBar } from './kanban-batch-bar'
import { KanbanBoardView } from './kanban-board-view'
import { KanbanCalendarView } from './kanban-calendar-view'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanGanttView } from './kanban-gantt-view'
import { KanbanHeader } from './kanban-header'
import { KanbanItemDetail } from './kanban-item-detail'
import { KanbanListView } from './kanban-list-view'
import { KanbanTableView } from './kanban-table-view'
import { KanbanTimelineView } from './kanban-timeline-view'

interface KanbanRootProps {
  initialData: KanbanData
  isFullscreen?: boolean
  onUpdateData: (data: KanbanData) => void
  onToggleFullscreen?: () => void
}

function useKanbanFilterSort(data: KanbanData, activeViewId: string) {
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

function useKanbanItemMutations(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  activeView: KanbanView,
  detailItem: KanbanItem | null,
  setDetailItem: (item: KanbanItem | null) => void,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const handleMoveItem = useCallback((itemId: string, targetGroupKey: string) => {
    const groupPropertyId = activeView.groupBy || 'status'
    const nextItems = data.items.map((item) => {
      if (item.id !== itemId) return item
      const val = targetGroupKey === '__none__' ? undefined : targetGroupKey
      return { ...item, properties: { ...item.properties, [groupPropertyId]: val } }
    })
    commitData({ ...data, items: nextItems })
  }, [data, activeView.groupBy, commitData])

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

function useKanbanAddOperations(
  data: KanbanData,
  commitData: (next: KanbanData) => void,
  setDetailItem: (item: KanbanItem | null) => void,
) {
  const handleAddItem = useCallback((defaultGroupKey?: string) => {
    const newItemId = `item-${Date.now()}`
    const groupKey = defaultGroupKey && defaultGroupKey !== '__none__' ? defaultGroupKey : undefined
    const statusVal = groupKey || data.columns.find((c) => c.id === 'status')?.options?.[0]?.id || 'todo'
    const newItem: KanbanItem = { id: newItemId, title: 'New task', properties: { status: statusVal } }
    commitData({ ...data, items: [...data.items, newItem] })
    setDetailItem(newItem)
  }, [data, commitData, setDetailItem])

  const handleAddColumn = useCallback(() => {
    const statusCol = data.columns.find((c) => c.id === 'status')
    if (!statusCol) return
    const colors: KanbanColorName[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'gray']
    const newColor = colors[(statusCol.options?.length ?? 0) % colors.length]!
    const newOpt: KanbanOption = { id: `status-${Date.now()}`, label: `New group ${statusCol.options?.length ?? 0}`, color: newColor }
    const nextCols = data.columns.map((c) => (c.id === 'status' ? { ...c, options: [...(c.options ?? []), newOpt] } : c))
    commitData({ ...data, columns: nextCols })
  }, [data, commitData])

  return { handleAddItem, handleAddColumn }
}

function useKanbanSelection(
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

interface KanbanViewRendererProps {
  activeView: KanbanView
  viewData: KanbanData
  data: KanbanData
  selectedIds: Set<string>
  commitData: (next: KanbanData) => void
  handleToggleSelect: (id: string) => void
  setDetailItem: (item: KanbanItem | null) => void
  handleUpdateTitle: (id: string, newTitle: string) => void
  handleMoveItem: (itemId: string, targetGroupKey: string) => void
  handleAddItem: (defaultGroupKey?: string) => void
  handleAddColumn: () => void
}

function KanbanTimelineViews(props: KanbanViewRendererProps) {
  const { activeView, viewData, data, commitData, setDetailItem, handleAddItem } = props
  if (activeView.type === 'calendar') {
    return <KanbanCalendarView data={viewData} onOpenDetail={setDetailItem} onAddItem={handleAddItem} />
  }
  if (activeView.type === 'timeline') {
    return <KanbanTimelineView data={viewData} onOpenDetail={setDetailItem} onAddItem={handleAddItem} />
  }
  return (
    <KanbanGanttView
      data={viewData}
      onOpenDetail={setDetailItem}
      onAddItem={handleAddItem}
      onUpdateProgress={(id, progress) => {
        const next = data.items.map((it) => (it.id === id ? { ...it, properties: { ...it.properties, progress } } : it))
        commitData({ ...data, items: next })
      }}
    />
  )
}

function BoardTableView(props: KanbanViewRendererProps) {
  const { activeView, viewData, data, selectedIds, commitData, handleToggleSelect, setDetailItem, handleUpdateTitle, handleMoveItem, handleAddItem, handleAddColumn } = props
  if (activeView.type === 'board') {
    return (
      <KanbanBoardView
        data={viewData}
        view={activeView}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onOpenDetail={setDetailItem}
        onUpdateTitle={handleUpdateTitle}
        onMoveItem={handleMoveItem}
        onAddItem={handleAddItem}
        onAddColumn={handleAddColumn}
      />
    )
  }
  return (
    <KanbanTableView
      data={viewData}
      selectedIds={selectedIds}
      onToggleSelect={handleToggleSelect}
      onOpenDetail={setDetailItem}
      onUpdateProperty={(id, prop, val) => {
        const next = data.items.map((it) => (it.id === id ? { ...it, properties: { ...it.properties, [prop]: val } } : it))
        commitData({ ...data, items: next })
      }}
      onAddItem={handleAddItem}
      onAddColumn={handleAddColumn}
    />
  )
}

function ListGalleryView(props: KanbanViewRendererProps) {
  const { activeView, viewData, selectedIds, handleToggleSelect, setDetailItem, handleAddItem } = props
  if (activeView.type === 'list') {
    return (
      <KanbanListView
        data={viewData}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onOpenDetail={setDetailItem}
        onAddItem={handleAddItem}
      />
    )
  }
  return (
    <KanbanGalleryView
      data={viewData}
      selectedIds={selectedIds}
      onToggleSelect={handleToggleSelect}
      onOpenDetail={setDetailItem}
      onAddItem={handleAddItem}
    />
  )
}

function KanbanViewRenderer(props: KanbanViewRendererProps) {
  const type = props.activeView.type
  if (type === 'calendar' || type === 'timeline' || type === 'gantt') {
    return <KanbanTimelineViews {...props} />
  }
  if (type === 'board' || type === 'table') {
    return <BoardTableView {...props} />
  }
  return <ListGalleryView {...props} />
}

interface KanbanMainProps {
  activeView: KanbanView
  viewData: KanbanData
  data: KanbanData
  selectedIds: Set<string>
  commitData: (next: KanbanData) => void
  handleToggleSelect: (id: string) => void
  setDetailItem: (item: KanbanItem | null) => void
  handleUpdateTitle: (id: string, newTitle: string) => void
  handleMoveItem: (itemId: string, targetGroupKey: string) => void
  handleAddItem: (defaultGroupKey?: string) => void
  handleAddColumn: () => void
  handleBatchStatusChange: (statusId: string) => void
  handleBatchDelete: () => void
  handleClearSelection: () => void
}

function KanbanMain(props: KanbanMainProps) {
  return (
    <main className='relative flex-1 overflow-hidden'>
      <KanbanViewRenderer
        activeView={props.activeView}
        viewData={props.viewData}
        data={props.data}
        selectedIds={props.selectedIds}
        commitData={props.commitData}
        handleToggleSelect={props.handleToggleSelect}
        setDetailItem={props.setDetailItem}
        handleUpdateTitle={props.handleUpdateTitle}
        handleMoveItem={props.handleMoveItem}
        handleAddItem={props.handleAddItem}
        handleAddColumn={props.handleAddColumn}
      />
      <KanbanBatchBar
        selectedCount={props.selectedIds.size}
        statusColumn={props.data.columns.find((c) => c.id === 'status')}
        onBatchStatusChange={props.handleBatchStatusChange}
        onBatchDelete={props.handleBatchDelete}
        onClearSelection={props.handleClearSelection}
      />
    </main>
  )
}

function useKanbanRootState(initialData: KanbanData, onUpdateData: (next: KanbanData) => void) {
  const [data, setData] = useState<KanbanData>(initialData)
  const [activeViewId, setActiveViewId] = useState<string>(() => initialData.activeViewId || initialData.views[0]?.id || 'view-board')
  const [detailItem, setDetailItem] = useState<KanbanItem | null>(null)

  const commitData = useCallback((next: KanbanData) => {
    setData(next)
    onUpdateData(next)
  }, [onUpdateData])

  const filterSort = useKanbanFilterSort(data, activeViewId)
  const selection = useKanbanSelection(data, commitData)
  const items = useKanbanItemMutations(data, commitData, filterSort.activeView, detailItem, setDetailItem, selection.setSelectedIds)
  const adds = useKanbanAddOperations(data, commitData, setDetailItem)

  return {
    data,
    detailItem,
    setDetailItem,
    setActiveViewId,
    commitData,
    filterSort,
    selection,
    items,
    adds,
  }
}

export const KanbanRoot = memo(function KanbanRoot({
  initialData,
  isFullscreen,
  onUpdateData,
  onToggleFullscreen,
}: KanbanRootProps) {
  const state = useKanbanRootState(initialData, onUpdateData)
  const { data, activeView, searchQuery, setSearchQuery, filters, setFilters, sorts, setSorts, viewData } = {
    data: state.data,
    ...state.filterSort,
  }

  return (
    <div className='flex h-full w-full flex-col overflow-hidden bg-[var(--bg-surface)] text-[var(--text-primary)]'>
      <KanbanHeader
        data={data}
        activeView={activeView}
        searchQuery={searchQuery}
        filters={filters}
        sorts={sorts}
        isFullscreen={isFullscreen}
        onSelectView={state.setActiveViewId}
        onSearchChange={setSearchQuery}
        onChangeFilters={setFilters}
        onChangeSorts={setSorts}
        onAddItem={() => state.adds.handleAddItem()}
        onToggleFullscreen={onToggleFullscreen}
      />
      <KanbanMain
        activeView={activeView}
        viewData={viewData}
        data={data}
        selectedIds={state.selection.selectedIds}
        commitData={state.commitData}
        handleToggleSelect={state.selection.handleToggleSelect}
        setDetailItem={state.setDetailItem}
        handleUpdateTitle={state.items.handleUpdateTitle}
        handleMoveItem={state.items.handleMoveItem}
        handleAddItem={state.adds.handleAddItem}
        handleAddColumn={state.adds.handleAddColumn}
        handleBatchStatusChange={state.selection.handleBatchStatusChange}
        handleBatchDelete={state.selection.handleBatchDelete}
        handleClearSelection={state.selection.handleClearSelection}
      />
      <KanbanItemDetail
        item={state.detailItem}
        columns={data.columns}
        onClose={() => state.setDetailItem(null)}
        onUpdate={state.items.handleUpdateItem}
        onDelete={state.items.handleDeleteItem}
      />
    </div>
  )
})
