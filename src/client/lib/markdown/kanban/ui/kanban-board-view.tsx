import { memo, useState } from 'react'
import { Plus } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { groupKanbanItems, kanbanWipOver } from '../filter-sort'
import type { KanbanGroup } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanMovePivot } from '../dnd'
import { kanbanBoardLayout, kanbanCellKey, kanbanSwimlanes } from '../swimlane'
import type { KanbanBoardCell, KanbanSwimlane } from '../swimlane'
import type { KanbanColorName, KanbanColumnPatch, KanbanData, KanbanItem, KanbanOption, KanbanSubtask, KanbanView } from '../types'
import { useKanbanBoardDndState, type CardDropTarget } from './kanban-board-dnd'
import { KanbanCard, type CardMoveDirection } from './kanban-card'
import { KanbanRenderTail, useKanbanRenderWindow } from './kanban-render-window'
import { CollapsedColumn, KanbanColumnHeader } from './kanban-column-header'
import { KanbanBoardSwimlanes } from './kanban-board-swimlanes'
import type { CardSize } from './kanban-view-options'

interface KanbanBoardViewProps {
  data: KanbanData
  view: KanbanView
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveItem: MoveItemFn
  onAddItem: (cell: KanbanBoardCell) => void
  onAddColumn: () => void
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void
  onUpdateColumn?: (groupKey: string, patch: KanbanColumnPatch) => void
  onDeleteColumn?: (groupKey: string) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

interface ColumnCardsListProps {
  items: KanbanItem[]
  columns: KanbanData['columns']
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  cardDropTarget: CardDropTarget | null
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onDragStartCard: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onDragOverCard: (e: React.DragEvent, id: string) => void
  onDropCard: (e: React.DragEvent, id: string) => void
  onMoveColumn: (itemId: string, dir: CardMoveDirection) => void
  onAddItem: () => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

function ColumnCardsList(props: ColumnCardsListProps) {
  const { visible, hiddenCount, setTailElement, revealMore } = useKanbanRenderWindow(props.items)
  return (
    <div className='mt-2 flex flex-1 flex-col gap-2 overflow-y-auto'>
      {props.items.length === 0 ? (
        <div className='flex h-20 items-center justify-center rounded-[var(--r-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/50 text-[length:var(--text-12)] font-medium text-[var(--text-tertiary)]'>
          {t('preview.kanban_empty_column')}
        </div>
      ) : (
        visible.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            columns={props.columns}
            isSelected={props.selectedIds.has(item.id)}
            cardSize={props.cardSize}
            selectedTags={props.selectedTags}
            dropIndicator={props.cardDropTarget?.cardId === item.id ? props.cardDropTarget.position : null}
            onToggleSelect={props.onToggleSelect}
            onOpenDetail={props.onOpenDetail}
            onToggleTag={props.onToggleTag}
            onUpdateTitle={props.onUpdateTitle}
            onUpdateSubtasks={props.onUpdateSubtasks}
            onDragStart={(e, id) => props.onDragStartCard(e, id)}
            onDragEnd={props.onDragEnd}
            onDragOverCard={props.onDragOverCard}
            onDropOnCard={props.onDropCard}
            onMoveColumn={(_id, dir) => props.onMoveColumn(item.id, dir)}
            onUpdateTags={props.onUpdateTags}
            onAddColumnOption={props.onAddColumnOption}
          />
        ))
      )}

      <KanbanRenderTail hiddenCount={hiddenCount} setTailElement={setTailElement} onReveal={revealMore} />

      <button
        type='button'
        onClick={props.onAddItem}
        className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <Plus size={13} />
        <span>{t('preview.kanban_new_item')}</span>
      </button>
    </div>
  )
}

interface KanbanBoardColumnProps extends Omit<ColumnCardsListProps, 'items'> {
  group: KanbanGroup
  /** Set when the column is one cell of a band, so the frame says which band it is. */
  laneKey?: string
  /** The strip draws the column and none of its cards; a band cell draws the cards and no title. */
  headOnly?: boolean
  bodyOnly?: boolean
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragStartColumn: (e: React.DragEvent) => void
  onRenameColumn: (newLabel: string) => void
  onChangeColumnColor: (newColor: KanbanColorName) => void
  onChangeColumnWipLimit: (limit: number | undefined) => void
  /** Absent on the strip of a banded board: there is nothing to expand back into above it. */
  onCollapseColumn?: () => void
  onDeleteColumn?: () => void
}

const KanbanBoardColumn = memo(function KanbanBoardColumn(props: KanbanBoardColumnProps) {
  const { group, laneKey, headOnly, bodyOnly, isDragOver, onDragOver, onDrop, onDragStartColumn } = props
  useLocaleRepaint()
  return (
    <div
      data-kanban-group={group.groupKey}
      {...(laneKey === undefined ? {} : { 'data-kanban-lane': laneKey })}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex w-72 shrink-0 flex-col rounded-[var(--r-lg)] border bg-[var(--bg-raised)] p-2 transition-colors ${
        isDragOver ? 'border-[var(--accent)] bg-[var(--accent-softer)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      {bodyOnly ? null : (
        <KanbanColumnHeader
          groupKey={group.groupKey}
          label={group.label}
          // A band cell has no header, and the strip counts the whole column rather than its slice.
          count={group.items.length}
          color={group.color}
          wipLimit={group.wipLimit}
          onDragStart={onDragStartColumn}
          onRename={props.onRenameColumn}
          onChangeColor={props.onChangeColumnColor}
          onChangeWipLimit={props.onChangeColumnWipLimit}
          onCollapse={props.onCollapseColumn}
          onDelete={props.onDeleteColumn}
        />
      )}

      {headOnly ? null : <ColumnCardsList {...props} items={group.items} />}
    </div>
  )
})

function AddColumnButton({ onAddColumn }: { onAddColumn: () => void }) {
  return (
    <div className='w-64 shrink-0 pt-1'>
      <button
        type='button'
        onClick={onAddColumn}
        className='flex w-full items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-3 text-[length:var(--text-13)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
      >
        <Plus size={15} />
        <span>{t('preview.kanban_new_group')}</span>
      </button>
    </div>
  )
}

type MoveItemFn = (itemId: string, cell: KanbanBoardCell, pivot?: KanbanMovePivot) => void

/**
 * A move that leaves the card in the cell it already sits in is a reorder, not a change of place, so
 * it gets no announcement; an item the board does not list has no known source, and guessing would
 * mean reading out a column the card may not have left. The band is named only when the drop lands
 * in one, because a drop on the strip changes the column and keeps the band the card was in.
 */
function kanbanMoveAnnouncement(
  groups: KanbanGroup[],
  bands: KanbanSwimlane[],
  itemId: string,
  cell: KanbanBoardCell,
): string | null {
  const source = groups.find((group) => group.items.some((item) => item.id === itemId))
  const target = groups.find((group) => group.groupKey === cell.groupKey)
  const item = source?.items.find((i) => i.id === itemId)
  if (!source || !target || !item) return null
  const currentBand = bands.find((lane) => lane.lane.items.some((i) => i.id === itemId))
  if (source.groupKey === target.groupKey && currentBand?.lane.groupKey === cell.laneKey) return null
  const band = bands.find((lane) => lane.lane.groupKey === cell.laneKey)?.lane
  const title = item.title || t('preview.kanban_untitled')
  const group = formatKanbanGroupLabel(target.groupKey, target.label)
  // This is read before the card has moved, so the column it would fill is still one card short.
  const over = kanbanWipOver(target.items.length + 1, target.wipLimit)
  if (band) {
    const bandLabel = formatKanbanGroupLabel(band.groupKey, band.label)
    return over > 0
      ? t('preview.kanban_moved_to_band_over', { title, group, band: bandLabel, over, limit: target.wipLimit ?? 0 })
      : t('preview.kanban_moved_to_band', { title, group, band: bandLabel })
  }
  if (over > 0)
    return t('preview.kanban_moved_to_group_over', { title, group, over, limit: target.wipLimit ?? 0 })
  return t('preview.kanban_moved_to_group', { title, group })
}

/** The key `offset` places from `keys`, or nothing when the walk runs off either end of the board. */
function neighbourKey(keys: string[], current: string, offset: -1 | 1): string | undefined {
  const index = keys.indexOf(current)
  return index === -1 ? undefined : keys[index + offset]
}

function useKanbanBoardMoves(
  data: KanbanData,
  view: KanbanView,
  moveItem: MoveItemFn,
) {
  const layout = kanbanBoardLayout(data, view)
  const groups = groupKanbanItems(data.items, layout.groupPropertyId, layout.groupProperty)
  const bands = kanbanSwimlanes(data.items, layout)
  const [moveAnnouncement, setMoveAnnouncement] = useState('')

  const handleMoveItem: MoveItemFn = (itemId, cell, pivot) => {
    const message = kanbanMoveAnnouncement(groups, bands, itemId, cell)
    if (message) setMoveAnnouncement(message)
    moveItem(itemId, cell, pivot)
  }

  /** Alt+Arrow walks one step of the grid the card is in, keeping the coordinate it did not touch. */
  const handleMoveCell = (itemId: string, cell: KanbanBoardCell, direction: CardMoveDirection) => {
    const step = direction === 'next' || direction === 'prev'
      ? neighbourKey(groups.map((group) => group.groupKey), cell.groupKey, direction === 'next' ? 1 : -1)
      : undefined
    const laneStep = direction === 'down' || direction === 'up'
      ? neighbourKey(bands.map((band) => band.lane.groupKey), cell.laneKey ?? '', direction === 'down' ? 1 : -1)
      : undefined
    if (step === undefined && laneStep === undefined) return
    handleMoveItem(itemId, { ...cell, groupKey: step ?? cell.groupKey, laneKey: laneStep ?? cell.laneKey })
  }

  return { groups, bands, moveAnnouncement, handleMoveItem, handleMoveCell }
}

/** Everything a cell of the board needs to draw, whichever of the three shapes it is. */
interface BoardCellBundle {
  columns: KanbanData['columns']
  cardSize?: CardSize
  selectedIds: Set<string>
  selectedTags?: string[]
  dnd: ReturnType<typeof useKanbanBoardDndState>
  onToggleCollapse: (groupKey: string) => void
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveCell: (itemId: string, cell: KanbanBoardCell, dir: CardMoveDirection) => void
  onAddItem: (cell: KanbanBoardCell) => void
  onUpdateColumn?: (groupKey: string, patch: KanbanColumnPatch) => void
  onDeleteColumn?: (groupKey: string) => void
  onUpdateTags?: (itemId: string, nextTags: string[], newOption?: KanbanOption) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

interface BoardColumnCellProps extends BoardCellBundle {
  cell: KanbanBoardCell
  group: KanbanGroup
  /** `column` is the plain board, `head` and `body` are the two halves of a banded board. */
  variant: 'column' | 'head' | 'body'
  isCollapsed: boolean
}

function ExpandedBoardColumn(props: BoardColumnCellProps) {
  const { cell, group, dnd, variant } = props
  return (
    <KanbanBoardColumn
      {...props}
      laneKey={cell.laneKey}
      headOnly={variant === 'head'}
      bodyOnly={variant === 'body'}
      isDragOver={dnd.isDragOverCell(cell)}
      cardDropTarget={dnd.cardDropTarget}
      onDragOver={(e) => {
        e.preventDefault()
        dnd.setDragOverCell(cell)
      }}
      onDrop={(e) => dnd.handleColumnDrop(e, cell)}
      onDragStartCard={(e, id) => dnd.handleCardDragStart(e, id, group.groupKey)}
      onDragEnd={dnd.handleDragEnd}
      onDragOverCard={dnd.handleCardDragOver}
      onDropCard={(e, id) => dnd.handleCardDrop(e, cell, id)}
      onDragStartColumn={(e) => dnd.handleColumnDragStart(e, group.groupKey)}
      onRenameColumn={(newLabel) => props.onUpdateColumn?.(group.groupKey, { label: newLabel })}
      onChangeColumnColor={(newColor) => props.onUpdateColumn?.(group.groupKey, { color: newColor })}
      onChangeColumnWipLimit={(wipLimit) => props.onUpdateColumn?.(group.groupKey, { wipLimit })}
      // A banded column is the strip's title, and has no narrower form to fold into.
      onCollapseColumn={variant === 'column' ? () => props.onToggleCollapse(group.groupKey) : undefined}
      onDeleteColumn={() => props.onDeleteColumn?.(group.groupKey)}
      onAddItem={() => props.onAddItem(cell)}
      onMoveColumn={(itemId, dir) => props.onMoveCell(itemId, cell, dir)}
    />
  )
}

function CollapsedColumnItem(props: BoardColumnCellProps) {
  const { cell, group, dnd } = props
  return (
    <CollapsedColumn
      group={group}
      isDragOver={dnd.isDragOverCell(cell)}
      onExpand={() => props.onToggleCollapse(group.groupKey)}
      onDragOver={(e) => {
        e.preventDefault()
        dnd.setDragOverCell(cell)
      }}
      onDrop={(e) => dnd.handleColumnDrop(e, cell)}
    />
  )
}

function BoardColumnCell(props: BoardColumnCellProps) {
  if (props.variant === 'column' && props.isCollapsed) return <CollapsedColumnItem {...props} />
  return <ExpandedBoardColumn {...props} />
}

/** The board scrolls sideways when it is a row of columns, and both ways once it is a grid. */
const PLAIN_BOARD_ROOT = 'flex h-full w-full gap-4 overflow-x-auto p-4'
const BANDED_BOARD_ROOT = 'flex h-full w-full flex-col gap-4 overflow-auto p-4'

function PlainBoardColumns({
  groups,
  cells,
  collapsedGroups,
  onAddColumn,
}: {
  groups: KanbanGroup[]
  cells: BoardCellBundle
  collapsedGroups: Set<string>
  onAddColumn: () => void
}) {
  return (
    <>
      {groups.map((group) => (
        <BoardColumnCell
          key={group.groupKey}
          {...cells}
          cell={{ groupKey: group.groupKey }}
          group={group}
          variant='column'
          isCollapsed={collapsedGroups.has(group.groupKey)}
        />
      ))}
      <AddColumnButton onAddColumn={onAddColumn} />
    </>
  )
}

/**
 * A board nobody asked to band stays a single row of columns; asking for a second field turns that row
 * into a grid whose columns are titled once, above every band, and whose cells are that column within
 * one band. Both are the same columns and the same cards — only the arrangement differs.
 */
function BandedBoardGrid({
  bands,
  groups,
  cells,
  onAddColumn,
}: {
  bands: KanbanSwimlane[]
  groups: KanbanGroup[]
  cells: BoardCellBundle
  onAddColumn: () => void
}) {
  return (
    <KanbanBoardSwimlanes
      bands={bands}
      groups={groups}
      addColumnSlot={<AddColumnButton onAddColumn={onAddColumn} />}
      renderCell={({ cell, group, variant }) => (
        // Collapsing a column is the plain board's arrangement: a band row has no narrower form.
        <BoardColumnCell
          key={kanbanCellKey(cell)}
          {...cells}
          cell={cell}
          group={group}
          variant={variant}
          isCollapsed={false}
        />
      )}
    />
  )
}

/** Which columns the reader has folded away. Only the plain board can fold one. */
function useCollapsedColumns() {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }
  return { collapsedGroups, toggleCollapse }
}

export const KanbanBoardView = memo(function KanbanBoardView(props: KanbanBoardViewProps) {
  useLocaleRepaint()
  const { collapsedGroups, toggleCollapse } = useCollapsedColumns()
  const { groups, bands, moveAnnouncement, handleMoveItem, handleMoveCell } = useKanbanBoardMoves(
    props.data,
    props.view,
    props.onMoveItem,
  )
  const dnd = useKanbanBoardDndState(handleMoveItem, props.onReorderColumns)

  const cells: BoardCellBundle = {
    columns: props.data.columns,
    cardSize: props.cardSize,
    selectedIds: props.selectedIds,
    selectedTags: props.selectedTags,
    dnd,
    onToggleCollapse: toggleCollapse,
    onToggleSelect: props.onToggleSelect,
    onOpenDetail: props.onOpenDetail,
    onToggleTag: props.onToggleTag,
    onUpdateTitle: props.onUpdateTitle,
    onUpdateSubtasks: props.onUpdateSubtasks,
    onMoveCell: handleMoveCell,
    onAddItem: props.onAddItem,
    onUpdateColumn: props.onUpdateColumn,
    onDeleteColumn: props.onDeleteColumn,
    onUpdateTags: props.onUpdateTags,
    onAddColumnOption: props.onAddColumnOption,
  }

  return (
    <div data-kanban-board className={bands.length > 0 ? BANDED_BOARD_ROOT : PLAIN_BOARD_ROOT}>
      {bands.length > 0 ? (
        <BandedBoardGrid bands={bands} groups={groups} cells={cells} onAddColumn={props.onAddColumn} />
      ) : (
        <PlainBoardColumns groups={groups} cells={cells} collapsedGroups={collapsedGroups} onAddColumn={props.onAddColumn} />
      )}
      <span role='status' aria-live='polite' className='sr-only'>
        {moveAnnouncement}
      </span>
    </div>
  )
})
