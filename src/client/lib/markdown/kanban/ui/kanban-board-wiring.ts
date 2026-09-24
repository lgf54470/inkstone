/**
 * The board's moves: which column a card belongs to, the drag that changes it, the batch a drop can
 * carry, and the reader's own place in the board beside them. Kept apart from the drawing for the same
 * reason the drawing is split by shape — the board is one of the largest surfaces in the module, and
 * this half holds no markup at all.
 *
 * The handles here hold one identity for the board's life: the columns and cards below compare what
 * they are handed, and a mover minted per render would hand every card a new prop for a change that
 * touched none of them (K-19). What they read — the groups, the bands, the selection, the host's own
 * mover — is read at call time through refs instead.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { t } from '../../../i18n'
import { groupKanbanItems, kanbanWipOver } from '../filter-sort'
import type { KanbanGroup } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanMovePivot } from '../dnd'
import { kanbanBoardLayout, kanbanSwimlanes } from '../swimlane'
import type { KanbanBoardCell, KanbanSwimlane } from '../swimlane'
import type { KanbanData, KanbanView } from '../types'
import { useKanbanBoardDndState } from './kanban-board-dnd'
import { useKanbanScrollMemory, useKanbanViewMemory } from './kanban-view-memory'
import type { CardMoveDirection } from './kanban-card'

export type MoveItemFn = (itemId: string, cell: KanbanBoardCell, pivot?: KanbanMovePivot) => void

/** The batch standing on the board when a drop happens, and the writer that moves it as one. */
export interface BoardBatch {
  selectedIds: ReadonlySet<string>
  moveSelection?: MoveItemFn
}

/** What the board draws from: the grid it shows and what a move of one card says out loud. */
export interface BoardMoves {
  groups: KanbanGroup[]
  bands: KanbanSwimlane[]
  moveAnnouncement: string
  handleMoveCell: (itemId: string, cell: KanbanBoardCell, direction: CardMoveDirection) => void
}

/** Which columns are folded away, and the scroller that remembers where the reader left the board. */
interface BoardPlace {
  collapsedGroups: ReadonlySet<string>
  toggleCollapse: (groupKey: string) => void
  scrollRef: RefObject<HTMLDivElement | null>
  handleScroll: (event: React.UIEvent<HTMLElement>) => void
}

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
 * What a batch drop says out loud: the column under the pointer, and how many cards went into it. The
 * count is the selection as it stood at the drop, not the cards the writer then moved, and a drop that
 * turns out to be a single move stays quiet here because the mover announces that one itself.
 */
function useBatchMoveAnnouncement(
  groupsRef: RefObject<KanbanGroup[]>,
  batch: BoardBatch,
  setMoveAnnouncement: (message: string) => void,
): MoveItemFn {
  const selectionRef = useRef(batch.selectedIds)
  selectionRef.current = batch.selectedIds
  const moveSelectionRef = useRef(batch.moveSelection)
  moveSelectionRef.current = batch.moveSelection
  return useCallback<MoveItemFn>((itemId, cell, pivot) => {
    const target = groupsRef.current.find((group) => group.groupKey === cell.groupKey)
    const count = selectionRef.current.size
    if (target && count > 1) {
      setMoveAnnouncement(
        t('preview.kanban_batch_moved', { count, group: formatKanbanGroupLabel(target.groupKey, target.label) }),
      )
    }
    moveSelectionRef.current?.(itemId, cell, pivot)
  }, [groupsRef, setMoveAnnouncement])
}

interface BoardMoveHandles extends BoardMoves {
  handleMoveItem: MoveItemFn
  handleMoveSelection: MoveItemFn
}

function useKanbanBoardMoves(
  data: KanbanData,
  view: KanbanView,
  moveItem: MoveItemFn,
  batch: BoardBatch,
): BoardMoveHandles {
  const layout = useMemo(() => kanbanBoardLayout(data, view), [data, view])
  const groups = useMemo(
    () => groupKanbanItems(data.items, layout.groupPropertyId, layout.groupProperty),
    [data.items, layout],
  )
  const bands = useMemo(() => kanbanSwimlanes(data.items, layout), [data.items, layout])
  const [moveAnnouncement, setMoveAnnouncement] = useState('')
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const bandsRef = useRef(bands)
  bandsRef.current = bands
  const moveItemRef = useRef(moveItem)
  moveItemRef.current = moveItem
  const handleMoveSelection = useBatchMoveAnnouncement(groupsRef, batch, setMoveAnnouncement)

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

  return { groups, bands, moveAnnouncement, handleMoveItem, handleMoveSelection, handleMoveCell }
}

/**
 * The reader's own place in this board: the columns they folded away, and how far it is scrolled
 * sideways. Both live in the board's memory rather than in this view — it keeps them across a view
 * switch, and `kanban-view-memory.ts` says why neither is written into the fence.
 */
function useBoardPlace(view: KanbanView | undefined): BoardPlace {
  const memory = useKanbanViewMemory(view?.id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const handleScroll = useKanbanScrollMemory(scrollRef, memory)
  return { collapsedGroups: memory.folds, toggleCollapse: memory.toggleFold, scrollRef, handleScroll }
}

/**
 * The board's moves and the drag that makes them: one wiring, because a drop is what moves a card and
 * both halves read the same mover and the same selection. The drag is handed a batch mover only when
 * the host can write one, which is what keeps every drop a single move on a board that cannot batch.
 */
export function useBoardDrag(
  data: KanbanData,
  view: KanbanView,
  moveItem: MoveItemFn,
  batch: BoardBatch,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
): BoardMoves & BoardPlace & { dnd: ReturnType<typeof useKanbanBoardDndState> } {
  const moves = useKanbanBoardMoves(data, view, moveItem, batch)
  const dnd = useKanbanBoardDndState(moves.handleMoveItem, onReorderColumns, {
    selectedIds: batch.selectedIds,
    onMoveSelection: batch.moveSelection ? moves.handleMoveSelection : undefined,
  })
  const place = useBoardPlace(view)
  return {
    groups: moves.groups,
    bands: moves.bands,
    moveAnnouncement: moves.moveAnnouncement,
    handleMoveCell: moves.handleMoveCell,
    ...place,
    dnd,
  }
}
