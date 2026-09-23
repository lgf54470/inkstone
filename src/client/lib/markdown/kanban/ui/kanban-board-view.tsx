import { memo, useCallback, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { groupKanbanItems, kanbanWipOver } from '../filter-sort'
import type { KanbanGroup } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanMovePivot } from '../dnd'
import { kanbanBoardLayout, kanbanCellKey, kanbanSwimlanes } from '../swimlane'
import type { KanbanBoardCell, KanbanSwimlane } from '../swimlane'
import type { KanbanColorName, KanbanColumnPatch, KanbanData, KanbanItem, KanbanOption, KanbanSubtask, KanbanView } from '../types'
import { useKanbanBoardDndState } from './kanban-board-dnd'
import { useColumnCellHandlers } from './kanban-cell-handlers'
import type { CardMoveDirection } from './kanban-card'
import { ColumnCardsList, type ColumnCardsListProps } from './kanban-column-cards'
import { CollapsedColumn, KanbanColumnHeader } from './kanban-column-header'
import type { KanbanColumnSelectAll } from './kanban-column-menu'
import { KanbanBoardSwimlanes } from './kanban-board-swimlanes'
import type { CardSize } from './kanban-view-options'

interface KanbanBoardViewProps {
  data: KanbanData
  view: KanbanView
  selectedIds: Set<string>
  cardSize?: CardSize
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  /** Absent where the host cannot act on a batch, which is also what removes the column's own row. */
  onToggleAll?: (ids: string[]) => void
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
  /** Named rather than threaded: only the header consumes it, and only for a whole column. */
  selectAll?: KanbanColumnSelectAll
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
      // The board is three surfaces deep and each step has to be the step above the one it sits on:
      // the plane is `--bg-inset`, a column is `--bg-surface`, and a card is `--bg-raised` on top of
      // it. The column used to be raised with the cards on the surface below it, which read as a
      // recessed card in the dark theme — and, in the light one, as three whites in a row.
      // No height of its own: the column is as tall as its cards, and only a column longer than the
      // canvas is capped — by `styles/kanban.css`, one padding step under the board's own cap, which is
      // what keeps a long column scrolling inside itself and the short ones beside it short.
      className={`flex w-72 shrink-0 flex-col rounded-[var(--r-lg)] border bg-[var(--bg-surface)] p-2 transition-colors ${
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
          {...(props.selectAll
            ? { onToggleSelectAll: props.selectAll.onToggle, isAllSelected: props.selectAll.isAllSelected }
            : {})}
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

/**
 * The grouping and the moves, with the moves holding one identity for the board's life: the columns
 * and cards below compare what they are handed, and a mover minted per render would hand every card
 * a new prop for a change that touched none of them (K-19). What the handlers read — the groups, the
 * bands, the board's own mover — is read at call time through refs instead.
 */
function useKanbanBoardMoves(
  data: KanbanData,
  view: KanbanView,
  moveItem: MoveItemFn,
) {
  const layout = kanbanBoardLayout(data, view)
  const groups = groupKanbanItems(data.items, layout.groupPropertyId, layout.groupProperty)
  const bands = kanbanSwimlanes(data.items, layout)
  const [moveAnnouncement, setMoveAnnouncement] = useState('')
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const bandsRef = useRef(bands)
  bandsRef.current = bands
  const moveItemRef = useRef(moveItem)
  moveItemRef.current = moveItem

  const handleMoveItem = useCallback<MoveItemFn>((itemId, cell, pivot) => {
    const message = kanbanMoveAnnouncement(groupsRef.current, bandsRef.current, itemId, cell)
    if (message) setMoveAnnouncement(message)
    moveItemRef.current(itemId, cell, pivot)
  }, [])

  /** Shift+Arrow walks one step of the grid the card is in, keeping the coordinate it did not touch. */
  const handleMoveCell = useCallback((itemId: string, cell: KanbanBoardCell, direction: CardMoveDirection) => {
    const step = direction === 'next' || direction === 'prev'
      ? neighbourKey(groupsRef.current.map((group) => group.groupKey), cell.groupKey, direction === 'next' ? 1 : -1)
      : undefined
    const laneStep = direction === 'down' || direction === 'up'
      ? neighbourKey(bandsRef.current.map((band) => band.lane.groupKey), cell.laneKey ?? '', direction === 'down' ? 1 : -1)
      : undefined
    if (step === undefined && laneStep === undefined) return
    handleMoveItem(itemId, { ...cell, groupKey: step ?? cell.groupKey, laneKey: laneStep ?? cell.laneKey })
  }, [handleMoveItem])

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
  onToggleSelectAll?: (ids: string[]) => void
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

/**
 * Whether the cards this column draws are all picked, and the gesture that settles them to that
 * state. The whole column is one batch commit, so its ids are gathered here rather than per card.
 */
function useColumnSelectAll(props: BoardColumnCellProps) {
  const { group, selectedIds, onToggleSelectAll } = props
  if (!onToggleSelectAll) return undefined
  return {
    count: group.items.length,
    isAllSelected: group.items.length > 0 && group.items.every((item) => selectedIds.has(item.id)),
    onToggle: () => onToggleSelectAll(group.items.map((item) => item.id)),
  }
}

function ExpandedBoardColumn(props: BoardColumnCellProps) {
  const { cell, group, dnd, variant } = props
  const selectAll = useColumnSelectAll(props)
  const handlers = useColumnCellHandlers({
    cell,
    groupKey: group.groupKey,
    dnd,
    onUpdateColumn: props.onUpdateColumn,
    onDeleteColumn: props.onDeleteColumn,
    onAddItem: props.onAddItem,
    onMoveCell: props.onMoveCell,
  })
  return (
    <KanbanBoardColumn
      {...props}
      laneKey={cell.laneKey}
      headOnly={variant === 'head'}
      bodyOnly={variant === 'body'}
      isDragOver={dnd.isDragOverCell(cell)}
      cardDropTarget={dnd.cardDropTarget}
      onDragEnd={dnd.handleDragEnd}
      onDragOverCard={dnd.handleCardDragOver}
      {...handlers}
      // A banded column is the strip's title, and has no narrower form to fold into.
      onCollapseColumn={variant === 'column' ? () => props.onToggleCollapse(group.groupKey) : undefined}
      selectAll={variant === 'column' ? selectAll : undefined}
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

/**
 * The board scrolls sideways when it is a row of columns, and both ways once it is a grid.
 *
 * `items-start` is the whole difference between a board and a wall of empty boxes: a flex row stretches
 * its children to the tallest of them, so every column was drawn as tall as the canvas rather than as
 * tall as its cards, and the reader saw two or three rows of their own column's background under the
 * last card (user report 2026-09-23). The cap that keeps this from making a whole board scroll instead
 * of its longest column lives in `styles/kanban.css`, next to the canvas cap it is derived from.
 */
const PLAIN_BOARD_ROOT = 'flex w-full items-start gap-4 overflow-auto p-4'
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
    onToggleSelectAll: props.onToggleAll,
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
