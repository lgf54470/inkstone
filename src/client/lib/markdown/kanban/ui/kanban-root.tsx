import { memo } from 'react'
import type {
  KanbanColorName,
  KanbanData,
  KanbanItem,
  KanbanOption,
  KanbanSubtask,
} from '../types'
import type { KanbanMovePivot } from '../dnd'
import { KanbanBatchBar } from './kanban-batch-bar'
import { KanbanBoardView } from './kanban-board-view'
import { KanbanCalendarView } from './kanban-calendar-view'
import { KanbanChartView } from './kanban-chart-view'
import { KanbanContextMenu } from './kanban-context-menu'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanGanttView } from './kanban-gantt-view'
import { KanbanHeader } from './kanban-header'
import { KanbanItemDetail } from './kanban-item-detail'
import { KanbanListView } from './kanban-list-view'
import { KanbanTableView } from './kanban-table-view'
import { KanbanTimelineView } from './kanban-timeline-view'
import { useKanbanContextMenuState, useKanbanRootState } from './kanban-root-hooks'
import type { CardSize } from './kanban-view-options'

interface KanbanRootProps {
  initialData: KanbanData
  isFullscreen?: boolean
  onUpdateData: (data: KanbanData) => void
  onToggleFullscreen?: () => void
}

interface KanbanViewRendererProps {
  activeView: KanbanData['views'][number]
  viewData: KanbanData
  data: KanbanData
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  onToggleTag?: (tag: string) => void
  commitData: (d: KanbanData) => void
  handleToggleSelect: (id: string) => void
  setDetailItem: (item: KanbanItem | null) => void
  handleUpdateTitle: (id: string, title: string) => void
  handleMoveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void
  handleAddItem: (defaults?: Record<string, unknown>) => void
  handleAddItemInGroup: (groupKey?: string) => void
  handleAddColumn: () => void
  handleReorderColumns: (sourceGroupKey: string, targetGroupKey: string) => void
  handleUpdateColumn: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  handleDeleteColumn: (groupKey: string) => void
  handleUpdateTags?: (id: string, tags: string[], newOption?: KanbanOption) => void
  handleAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function KanbanTimelineViews({ activeView, viewData, data, commitData, setDetailItem, handleAddItem }: KanbanViewRendererProps) {
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
  const handleUpdateSubtasks = (id: string, subtasks: KanbanSubtask[]) => {
    const next = props.data.items.map((it) => (it.id === id ? { ...it, subtasks } : it))
    props.commitData({ ...props.data, items: next })
  }

  if (props.activeView.type === 'board') {
    return (
      <KanbanBoardView
        data={props.viewData}
        view={props.activeView}
        selectedIds={props.selectedIds}
        cardSize={props.cardSize}
        selectedTags={props.selectedTags}
        onToggleTag={props.onToggleTag}
        onToggleSelect={props.handleToggleSelect}
        onOpenDetail={props.setDetailItem}
        onUpdateTitle={props.handleUpdateTitle}
        onUpdateSubtasks={handleUpdateSubtasks}
        onMoveItem={props.handleMoveItem}
        onAddItem={props.handleAddItemInGroup}
        onAddColumn={props.handleAddColumn}
        onReorderColumns={props.handleReorderColumns}
        onUpdateColumn={props.handleUpdateColumn}
        onDeleteColumn={props.handleDeleteColumn}
        onUpdateTags={props.handleUpdateTags}
        onAddColumnOption={props.handleAddColumnOption}
      />
    )
  }
  return (
    <KanbanTableView
      data={props.viewData}
      view={props.activeView}
      selectedIds={props.selectedIds}
      onToggleSelect={props.handleToggleSelect}
      onOpenDetail={props.setDetailItem}
      onUpdateProperty={(id, prop, val) => {
        const next = props.data.items.map((it) => (it.id === id ? { ...it, properties: { ...it.properties, [prop]: val } } : it))
        props.commitData({ ...props.data, items: next })
      }}
      onUpdateSubtasks={handleUpdateSubtasks}
      onAddItem={props.handleAddItem}
      onAddColumn={props.handleAddColumn}
    />
  )
}

function ListGalleryView(props: KanbanViewRendererProps) {
  const handleUpdateSubtasks = (itemId: string, nextSubtasks: KanbanSubtask[]) => {
    const next = props.data.items.map((it) => (it.id === itemId ? { ...it, subtasks: nextSubtasks } : it))
    props.commitData({ ...props.data, items: next })
  }

  if (props.activeView.type === 'list') {
    return (
      <KanbanListView
        data={props.viewData}
        selectedIds={props.selectedIds}
        selectedTags={props.selectedTags}
        onToggleTag={props.onToggleTag}
        onToggleSelect={props.handleToggleSelect}
        onOpenDetail={props.setDetailItem}
        onAddItem={props.handleAddItem}
      />
    )
  }
  return (
    <KanbanGalleryView
      data={props.viewData}
      selectedIds={props.selectedIds}
      onToggleSelect={props.handleToggleSelect}
      onOpenDetail={props.setDetailItem}
      onAddItem={props.handleAddItem}
      onUpdateSubtasks={handleUpdateSubtasks}
    />
  )
}

function KanbanViewRenderer(props: KanbanViewRendererProps) {
  const type = props.activeView.type
  if (type === 'chart') {
    return (
      <KanbanChartView
        data={props.viewData}
        view={props.activeView}
        onUpdateView={(patch) => {
          const nextViews = props.data.views.map((v) => (v.id === props.activeView.id ? { ...v, ...patch } : v))
          props.commitData({ ...props.data, views: nextViews })
        }}
      />
    )
  }
  if (type === 'calendar' || type === 'timeline' || type === 'gantt') {
    return <KanbanTimelineViews {...props} />
  }
  if (type === 'board' || type === 'table') {
    return <BoardTableView {...props} />
  }
  return <ListGalleryView {...props} />
}

function KanbanTopBar({
  state,
  isFullscreen,
  onToggleFullscreen,
}: {
  state: ReturnType<typeof useKanbanRootState>
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  return (
    <KanbanHeader
      data={state.data}
      activeView={state.filterSort.activeView}
      searchQuery={state.filterSort.searchQuery}
      filters={state.filterSort.filters}
      sorts={state.filterSort.sorts}
      selectedTags={state.filterSort.selectedTags}
      cardSize={state.cardSize}
      isFullscreen={isFullscreen}
      canUndo={state.history.canUndo}
      canRedo={state.history.canRedo}
      onUndo={state.history.undo}
      onRedo={state.history.redo}
      onUpdateBoardTitle={state.handleUpdateBoardTitle}
      onSelectView={state.setActiveViewId}
      onSearchChange={state.filterSort.setSearchQuery}
      onChangeFilters={state.filterSort.setFilters}
      onChangeSorts={state.filterSort.setSorts}
      onToggleTag={state.filterSort.onToggleTag}
      onClearTags={state.filterSort.onClearTags}
      onChangeCardSize={state.setCardSize}
      onChangeGroupBy={state.columnOps.handleChangeGroupBy}
      onAddItem={() => state.adds.handleAddItem()}
      onToggleFullscreen={onToggleFullscreen}
    />
  )
}

function KanbanMain({ state }: { state: ReturnType<typeof useKanbanRootState> }) {
  return (
    <main className='relative flex-1 overflow-hidden'>
      <KanbanViewRenderer
        activeView={state.filterSort.activeView}
        viewData={state.filterSort.viewData}
        data={state.data}
        selectedIds={state.selection.selectedIds}
        cardSize={state.cardSize}
        selectedTags={state.filterSort.selectedTags}
        onToggleTag={state.filterSort.onToggleTag}
        commitData={state.commitData}
        handleToggleSelect={state.selection.handleToggleSelect}
        setDetailItem={state.setDetailItem}
        handleUpdateTitle={state.items.handleUpdateTitle}
        handleMoveItem={state.items.handleMoveItem}
        handleAddItem={state.adds.handleAddItem}
        handleAddItemInGroup={state.adds.handleAddItemInGroup}
        handleAddColumn={state.adds.handleAddColumn}
        handleReorderColumns={state.columnOps.handleReorderColumns}
        handleUpdateColumn={state.columnOps.handleUpdateColumn}
        handleDeleteColumn={state.columnOps.handleDeleteColumn}
        handleUpdateTags={state.items.handleUpdateTags}
        handleAddColumnOption={state.columnOps.handleAddColumnOption}
      />
      <KanbanBatchBar
        selectedCount={state.selection.selectedIds.size}
        statusColumn={state.data.columns.find((c) => c.id === 'status')}
        onBatchStatusChange={state.selection.handleBatchStatusChange}
        onBatchDelete={state.selection.handleBatchDelete}
        onClearSelection={state.selection.handleClearSelection}
      />
    </main>
  )
}

function KanbanRootOverlays({
  state,
  menu,
  isFullscreen,
  onToggleFullscreen,
}: {
  state: ReturnType<typeof useKanbanRootState>
  menu: ReturnType<typeof useKanbanContextMenuState>
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  return (
    <>
      <KanbanItemDetail
        item={state.detailItem}
        columns={state.data.columns}
        onClose={() => state.setDetailItem(null)}
        onUpdate={state.items.handleUpdateItem}
        onDelete={state.items.handleDeleteItem}
        onConvertSubtask={(subtaskId) => {
          if (state.detailItem) state.items.handleConvertSubtaskToItem(state.detailItem.id, subtaskId)
        }}
        onAddColumnOption={state.columnOps.handleAddColumnOption}
      />
      <KanbanContextMenu
        point={menu.point}
        targetItem={menu.targetItem}
        selectedCount={state.selection.selectedIds.size}
        activeView={state.filterSort.activeView}
        views={state.data.views}
        cardSize={state.cardSize}
        canUndo={state.history.canUndo}
        canRedo={state.history.canRedo}
        isFullscreen={isFullscreen}
        onClose={menu.handleClose}
        onOpenDetail={state.setDetailItem}
        onDuplicateItem={menu.handleDuplicateItem}
        onDeleteItem={state.items.handleDeleteItem}
        onAddItem={() => state.adds.handleAddItem()}
        onAddColumn={state.adds.handleAddColumn}
        onSelectView={state.setActiveViewId}
        onChangeCardSize={state.setCardSize}
        onBatchDelete={state.selection.handleBatchDelete}
        onClearSelection={state.selection.handleClearSelection}
        onUndo={state.history.undo}
        onRedo={state.history.redo}
        onToggleFullscreen={onToggleFullscreen}
      />
    </>
  )
}

export const KanbanRoot = memo(function KanbanRoot({
  initialData,
  isFullscreen,
  onUpdateData,
  onToggleFullscreen,
}: KanbanRootProps) {
  const state = useKanbanRootState(initialData, onUpdateData)
  const menu = useKanbanContextMenuState(state.data, state.commitData)

  return (
    <div
      onContextMenu={menu.handleContextMenu}
      className='flex h-full w-full flex-col overflow-hidden bg-[var(--bg-surface)] text-[var(--text-primary)]'
    >
      <KanbanTopBar state={state} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
      <KanbanMain state={state} />
      <KanbanRootOverlays state={state} menu={menu} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
    </div>
  )
})

