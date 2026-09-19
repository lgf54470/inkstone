import { memo, useId, useRef } from 'react'
import { useLocaleRepaint } from '../../../i18n'
import type {
  KanbanColorName,
  KanbanData,
  KanbanFile,
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
import { KanbanFilesScope } from './kanban-files-cell'
import { KanbanGalleryView } from './kanban-gallery-view'
import { KanbanGanttView } from './kanban-gantt-view'
import { KanbanHeader } from './kanban-header'
import { KanbanItemDetail } from './kanban-item-detail'
import { KanbanListView } from './kanban-list-view'
import { KanbanTableView } from './kanban-table-view'
import { KanbanTimelineView } from './kanban-timeline-view'
import { kanbanViewTabId } from './kanban-view-tabs'
import { useKanbanContextMenuState, useKanbanRootState } from './kanban-root-hooks'
import type { CardSize } from './kanban-view-options'

interface KanbanRootProps {
  initialData: KanbanData
  isFullscreen?: boolean
  kanbanName?: string
  unsaved?: boolean
  sourceData?: KanbanData
  onRetryWrite?: () => void
  onDiscardWrite?: () => void
  onUpdateData: (data: KanbanData) => void
  onToggleFullscreen?: () => void
  /** Passed down from the mount options: how the host renders description markdown. */
  renderDescription?: (source: string) => string
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
  handleToggleAll: (ids: string[]) => void
  setDetailItem: (item: KanbanItem | null) => void
  handleUpdateTitle: (id: string, title: string) => void
  handleUpdateFiles: (id: string, files: KanbanFile[]) => void
  handleUpdateMultiSelect: (itemId: string, columnId: string, values: string[], newOption?: KanbanOption) => void
  handleMoveItem: (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void
  handleAddItem: (defaults?: Record<string, unknown>) => void
  handleAddItemInGroup: (groupKey?: string) => void
  handleAddColumn: () => void
  handleUpdateView: (patch: Partial<KanbanData['views'][number]>) => void
  handleToggleSortColumn: (propertyId: string) => void
  handleReorderColumns: (sourceGroupKey: string, targetGroupKey: string) => void
  handleUpdateColumn: (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => void
  handleDeleteColumn: (groupKey: string) => void
  handleUpdateTags?: (id: string, tags: string[], newOption?: KanbanOption) => void
  handleAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function KanbanTimelineViews({ activeView, viewData, data, commitData, setDetailItem, handleAddItem }: KanbanViewRendererProps) {
  if (activeView.type === 'calendar') {
    return <KanbanCalendarView data={viewData} view={activeView} onOpenDetail={setDetailItem} onAddItem={handleAddItem} />
  }
  if (activeView.type === 'timeline') {
    return <KanbanTimelineView data={viewData} view={activeView} onOpenDetail={setDetailItem} onAddItem={handleAddItem} />
  }
  return (
    <KanbanGanttView
      data={viewData}
      view={activeView}
      onOpenDetail={setDetailItem}
      onAddItem={handleAddItem}
      onUpdateProgress={(id, progress) => {
        const progressKey = activeView.progressField || 'progress'
        const next = data.items.map((it) => (it.id === id ? { ...it, properties: { ...it.properties, [progressKey]: progress } } : it))
        commitData({ ...data, items: next })
      }}
    />
  )
}

// Views edit one item's own fields; the writer keeps that shape in one place
// while still committing the whole document like every other edit does.
function kanbanItemWriter(data: KanbanData, commitData: (next: KanbanData) => void) {
  return (id: string, patch: Partial<KanbanItem>) =>
    commitData({ ...data, items: data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
}

function BoardTableView(props: KanbanViewRendererProps) {
  const writeItem = kanbanItemWriter(props.data, props.commitData)
  const handleUpdateSubtasks = (id: string, subtasks: KanbanSubtask[]) => writeItem(id, { subtasks })

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
      onToggleAll={props.handleToggleAll}
      onOpenDetail={props.setDetailItem}
      onUpdateProperty={(id, prop, val) => {
        const next = props.data.items.map((it) => (it.id === id ? { ...it, properties: { ...it.properties, [prop]: val } } : it))
        props.commitData({ ...props.data, items: next })
      }}
      onUpdateSubtasks={handleUpdateSubtasks}
      onUpdateFiles={props.handleUpdateFiles}
      onUpdateMultiSelect={props.handleUpdateMultiSelect}
      onAddItem={props.handleAddItem}
      onAddColumn={props.handleAddColumn}
      onSortColumn={props.handleToggleSortColumn}
    />
  )
}

function ListGalleryView(props: KanbanViewRendererProps) {
  const writeItem = kanbanItemWriter(props.data, props.commitData)
  const handleUpdateSubtasks = (id: string, subtasks: KanbanSubtask[]) => writeItem(id, { subtasks })

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
        onUpdateView={props.handleUpdateView}
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
  unsaved,
  sourceData,
  viewPanelId,
  onRetryWrite,
  onDiscardWrite,
  onToggleFullscreen,
}: {
  state: ReturnType<typeof useKanbanRootState>
  isFullscreen?: boolean
  unsaved?: boolean
  sourceData?: KanbanData
  viewPanelId: string
  onRetryWrite?: () => void
  onDiscardWrite?: () => void
  onToggleFullscreen?: () => void
}) {
  return (
    <KanbanHeader
      data={state.data}
      visibleItems={state.filterSort.viewData.items}
      activeView={state.filterSort.activeView}
      searchQuery={state.filterSort.searchQuery}
      filters={state.filterSort.filters}
      sorts={state.filterSort.sorts}
      selectedTags={state.filterSort.selectedTags}
      cardSize={state.filterSort.cardSize}
      isFullscreen={isFullscreen}
      canUndo={state.history.canUndo}
      canRedo={state.history.canRedo}
      onUndo={state.history.undo}
      onRedo={state.history.redo}
      onUpdateBoardTitle={state.handleUpdateBoardTitle}
      onSelectView={state.setActiveViewId}
      viewOps={state.viewOps}
      onSearchChange={state.filterSort.setSearchQuery}
      onChangeFilters={state.filterSort.setFilters}
      onChangeSorts={state.filterSort.setSorts}
      onToggleTag={state.filterSort.onToggleTag}
      onClearTags={state.filterSort.onClearTags}
      onChangeCardSize={state.filterSort.setCardSize}
      onChangeGroupBy={state.columnOps.handleChangeGroupBy}
      onToggleHiddenColumn={state.filterSort.toggleHiddenColumn}
      onAddItem={() => state.adds.handleAddItem()}
      onToggleFullscreen={onToggleFullscreen}
      viewPanelId={viewPanelId}
      unsaved={unsaved}
      onRetryWrite={onRetryWrite}
      onDiscardWrite={sourceData && onDiscardWrite ? () => {
        state.commitData(sourceData)
        onDiscardWrite()
      } : undefined}
    />
  )
}

function KanbanMain({
  state,
  viewPanelId,
}: {
  state: ReturnType<typeof useKanbanRootState>
  viewPanelId: string
}) {
  return (
    // The selected view is what its tab controls, so this box is the panel — hanging the role here
    // rather than on a wrapper keeps the geometry untouched, and the board stops nesting a second
    // `main` landmark inside the app shell's own one.
    <div
      id={viewPanelId}
      role='tabpanel'
      aria-labelledby={kanbanViewTabId(viewPanelId, state.filterSort.activeView.id)}
      className='relative flex-1 overflow-hidden'
    >
      <KanbanViewRenderer
        activeView={state.filterSort.activeView}
        viewData={state.filterSort.viewData}
        data={state.data}
        selectedIds={state.selection.selectedIds}
        cardSize={state.filterSort.cardSize}
        selectedTags={state.filterSort.selectedTags}
        onToggleTag={state.filterSort.onToggleTag}
        commitData={state.commitData}
        handleToggleSelect={state.selection.handleToggleSelect}
        handleToggleAll={state.selection.handleToggleAll}
        setDetailItem={state.setDetailItem}
        handleUpdateTitle={state.items.handleUpdateTitle}
        handleUpdateFiles={state.items.handleUpdateFiles}
        handleUpdateMultiSelect={state.items.handleUpdateMultiSelect}
        handleMoveItem={state.items.handleMoveItem}
        handleAddItem={state.adds.handleAddItem}
        handleAddItemInGroup={state.adds.handleAddItemInGroup}
        handleAddColumn={state.adds.handleAddColumn}
        handleUpdateView={state.filterSort.updateActiveView}
        handleToggleSortColumn={state.filterSort.toggleSortColumn}
        handleReorderColumns={state.columnOps.handleReorderColumns}
        handleUpdateColumn={state.columnOps.handleUpdateColumn}
        handleDeleteColumn={state.columnOps.handleDeleteColumn}
        handleUpdateTags={state.items.handleUpdateTags}
        handleAddColumnOption={state.columnOps.handleAddColumnOption}
      />
      <KanbanBatchBar
        selectedCount={state.selection.selectedIds.size}
        groupColumn={state.groupColumn}
        onBatchGroupChange={state.selection.handleBatchGroupChange}
        onBatchDelete={state.selection.handleBatchDelete}
        onClearSelection={state.selection.handleClearSelection}
      />
    </div>
  )
}

function KanbanRootOverlays({
  state,
  menu,
  isFullscreen,
  onToggleFullscreen,
  renderDescription,
}: {
  state: ReturnType<typeof useKanbanRootState>
  menu: ReturnType<typeof useKanbanContextMenuState>
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  renderDescription?: (source: string) => string
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
        renderDescription={renderDescription}
      />
      <KanbanContextMenu
        point={menu.point}
        targetItem={menu.targetItem}
        selectedCount={state.selection.selectedIds.size}
        activeView={state.filterSort.activeView}
        views={state.data.views}
        cardSize={state.filterSort.cardSize}
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
        onChangeCardSize={state.filterSort.setCardSize}
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
  kanbanName,
  unsaved,
  sourceData,
  onRetryWrite,
  onDiscardWrite,
  onUpdateData,
  onToggleFullscreen,
  renderDescription,
}: KanbanRootProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // One id names the panel and, through `kanbanViewTabId`, the tab that controls it; the header and
  // the view render in two branches of this tree, so the pair is minted here.
  const viewPanelId = useId()
  // A host tree React did not make never re-renders this root, so the board listens
  // for language changes itself rather than trusting a mount option to carry them.
  useLocaleRepaint()
  const state = useKanbanRootState(initialData, onUpdateData, containerRef)
  const menu = useKanbanContextMenuState(state.data, state.commitData)

  return (
    <div
      ref={containerRef}
      // Clicking board whitespace focuses this container, so board-scoped
      // shortcuts (undo/redo) keep working when no card holds focus.
      tabIndex={-1}
      onContextMenu={menu.handleContextMenu}
      className='flex h-full w-full flex-col overflow-hidden bg-[var(--bg-surface)] text-[var(--text-primary)]'
    >
      <KanbanFilesScope.Provider value={kanbanName || 'default'}>
        <KanbanTopBar
          state={state}
          isFullscreen={isFullscreen}
          unsaved={unsaved}
          sourceData={sourceData}
          viewPanelId={viewPanelId}
          onRetryWrite={onRetryWrite}
          onDiscardWrite={onDiscardWrite}
          onToggleFullscreen={onToggleFullscreen}
        />
        <KanbanMain state={state} viewPanelId={viewPanelId} />
        <KanbanRootOverlays
          state={state}
          menu={menu}
          isFullscreen={isFullscreen}
          renderDescription={renderDescription}
          onToggleFullscreen={onToggleFullscreen}
        />
      </KanbanFilesScope.Provider>
    </div>
  )
})

