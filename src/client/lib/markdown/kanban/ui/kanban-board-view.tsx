import { memo, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { kanbanCardFields } from '../card-fields'
import type { KanbanGroup } from '../filter-sort'
import { kanbanCellKey } from '../swimlane'
import type { KanbanBoardCell, KanbanSwimlane } from '../swimlane'
import type {
  KanbanAddFinish,
  KanbanColorName,
  KanbanColumnPatch,
  KanbanData,
  KanbanItem,
  KanbanOption,
  KanbanSubtask,
  KanbanView,
} from '../types'
import { useColumnCellHandlers } from './kanban-cell-handlers'
import type { CardMoveDirection } from './kanban-card'
import { ColumnCardsList, type ColumnCardsListProps } from './kanban-column-cards'
import { CollapsedColumn, KanbanColumnHeader } from './kanban-column-header'
import type { KanbanColumnSelectAll } from './kanban-column-menu'
import { KanbanBoardSwimlanes } from './kanban-board-swimlanes'
import { useBoardDrag, type MoveItemFn } from './kanban-board-wiring'
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
  /** The same drop made with a batch standing on the board; absent leaves every drop a single move. */
  onMoveSelection?: MoveItemFn
  onAddItem: (cell: KanbanBoardCell, finish?: KanbanAddFinish) => void
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
  onCollapse?: (groupKey: string) => void
  onDeleteColumn?: () => void
  /** Named rather than threaded: only the header consumes it, and only for a whole column. */
  selectAll?: KanbanColumnSelectAll
}

const KanbanBoardColumn = memo(function KanbanBoardColumn(props: KanbanBoardColumnProps) {
  const { group, laneKey, headOnly, bodyOnly, isDragOver, onDragOver, onDrop, onDragStartColumn, onCollapse } = props
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
          onCollapse={onCollapse ? () => onCollapse(group.groupKey) : undefined}
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

/** Everything a cell of the board needs to draw, whichever of the three shapes it is. */
interface BoardCellBundle {
  columns: KanbanData['columns']
  cardSize?: CardSize
  /**
   * The columns this view prints on its cards (see `card-fields.ts`). Read from the view the board was
   * handed rather than threaded down from the root: the board is the surface that draws cards, and it
   * is already given both halves of the answer.
   */
  cardFields: string[]
  selectedIds: Set<string>
  selectedTags?: string[]
  dnd: ReturnType<typeof useBoardDrag>['dnd']
  onToggleCollapse: (groupKey: string) => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll?: (ids: string[]) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onUpdateTitle: (id: string, newTitle: string) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
  onMoveCell: (itemId: string, cell: KanbanBoardCell, dir: CardMoveDirection) => void
  onAddItem: (cell: KanbanBoardCell, finish?: KanbanAddFinish) => void
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
  return useMemo(() => {
    if (!onToggleSelectAll) return undefined
    return {
      count: group.items.length,
      isAllSelected: group.items.length > 0 && group.items.every((item) => selectedIds.has(item.id)),
      onToggle: () => onToggleSelectAll(group.items.map((item) => item.id)),
    }
  }, [group, selectedIds, onToggleSelectAll])
}

function ExpandedBoardColumn(props: BoardColumnCellProps) {
  // The cell and the drag bundle are read here and not handed on: both are rebuilt while a drag moves
  // (the cell once per render, the bundle once per highlight), and the column below is a `memo` that
  // compares what it is given — passing either through re-painted every column for a hover that lit
  // one of them. The cell is rebuilt inside `useColumnCellHandlers` from its two keys anyway.
  const { cell, group, dnd, ...columnProps } = props
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
      {...columnProps}
      group={group}
      laneKey={cell.laneKey}
      headOnly={props.variant === 'head'}
      bodyOnly={props.variant === 'body'}
      isDragOver={dnd.isDragOverCell(cell)}
      cardDropTarget={dnd.cardDropTarget}
      onDragEnd={dnd.handleDragEnd}
      onDragOverCard={dnd.handleCardDragOver}
      {...handlers}
      // A banded column is the strip's title, and has no narrower form to fold into.
      onCollapse={props.variant === 'column' ? props.onToggleCollapse : undefined}
      selectAll={props.variant === 'column' ? selectAll : undefined}
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
  collapsedGroups: ReadonlySet<string>
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

export const KanbanBoardView = memo(function KanbanBoardView(props: KanbanBoardViewProps) {
  useLocaleRepaint()
  const { collapsedGroups, toggleCollapse, scrollRef, handleScroll, groups, bands, moveAnnouncement, handleMoveCell, dnd } =
    useBoardDrag(props.data, props.view, props.onMoveItem, {
      selectedIds: props.selectedIds,
      moveSelection: props.onMoveSelection,
    }, props.onReorderColumns)
  const cardFields = useMemo(
    () => kanbanCardFields(props.view, props.data.columns),
    [props.view, props.data.columns],
  )

  const cells: BoardCellBundle = {
    columns: props.data.columns,
    cardSize: props.cardSize,
    cardFields,
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
    <div ref={scrollRef} data-kanban-board onScroll={handleScroll} className={bands.length > 0 ? BANDED_BOARD_ROOT : PLAIN_BOARD_ROOT}>
      {bands.length > 0 ? (
        <BandedBoardGrid bands={bands} groups={groups} cells={cells} onAddColumn={props.onAddColumn} />
      ) : (
        <PlainBoardColumns groups={groups} cells={cells} collapsedGroups={collapsedGroups} onAddColumn={props.onAddColumn} />
      )}
      {/* Marked: a column's own title field leaves a message inside this board too (KU-13). */}
      <span data-kanban-move-announcement role='status' aria-live='polite' className='sr-only'>
        {moveAnnouncement}
      </span>
    </div>
  )
})
