import { useCallback, useRef, useState } from 'react'
import { parseKanbanDragData } from '../dnd'
import type { KanbanDragPayload, KanbanMovePivot } from '../dnd'
import { kanbanCellKey } from '../swimlane'
import type { KanbanBoardCell } from '../swimlane'

export type { KanbanMovePivot }

export type DragItemState =
  | { type: 'card'; id: string; sourceGroupKey: string }
  | { type: 'column'; groupKey: string }
  | null

export interface CardDropTarget {
  cardId: string
  position: 'top' | 'bottom'
}

type MoveCardFn = (itemId: string, cell: KanbanBoardCell, pivot?: KanbanMovePivot) => void

function initDragData(e: React.DragEvent, payload: unknown, text: string) {
  e.dataTransfer.setData('application/json', JSON.stringify(payload))
  e.dataTransfer.setData('text/plain', text)
  e.dataTransfer.effectAllowed = 'move'
}

function computeDropPosition(e: React.DragEvent, targetCardId: string): CardDropTarget {
  const rect = e.currentTarget.getBoundingClientRect()
  const position = e.clientY - rect.top < rect.height / 2 ? 'top' : 'bottom'
  return { cardId: targetCardId, position }
}

// parseKanbanDragData falls back to text/plain, so a card id can arrive from an
// external drop. The in-flight internal drag (draggedItem) is trusted directly; a
// payload id only moves a card after a [data-item-id] element for it is found in
// the same [data-kanban-board], so dropped text or another board's id is a no-op.
function resolveDroppedCardId(
  e: React.DragEvent,
  data: KanbanDragPayload | null,
  draggedItem: DragItemState,
): string | null {
  if (draggedItem?.type === 'card') return draggedItem.id
  if (data?.type !== 'card') return null
  const board = e.currentTarget instanceof Element ? e.currentTarget.closest('[data-kanban-board]') : null
  return board?.querySelector(`[data-item-id="${CSS.escape(data.itemId)}"]`) ? data.itemId : null
}

function processCardDrop(
  e: React.DragEvent,
  draggedItem: DragItemState,
  targetCell: KanbanBoardCell,
  targetCardId: string,
  cardDropTarget: CardDropTarget | null,
  onMoveItem: MoveCardFn,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  const cardId = resolveDroppedCardId(e, data, draggedItem)
  if (cardId) {
    const position: KanbanMovePivot['position'] =
      cardDropTarget?.cardId === targetCardId && cardDropTarget.position === 'bottom' ? 'after' : 'before'
    onMoveItem(cardId, targetCell, { itemId: targetCardId, position })
  }
}

function processColumnDrop(
  e: React.DragEvent,
  draggedItem: DragItemState,
  targetCell: KanbanBoardCell,
  onMoveItem: MoveCardFn,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  if (data?.type === 'column' || draggedItem?.type === 'column') {
    const sourceKey = data?.type === 'column' ? data.groupKey : (draggedItem as { groupKey: string }).groupKey
    if (sourceKey && onReorderColumns) onReorderColumns(sourceKey, targetCell.groupKey)
  } else {
    const cardId = resolveDroppedCardId(e, data, draggedItem)
    if (cardId) onMoveItem(cardId, targetCell)
  }
}

// Drag-start / drag-over handlers only need the stable state setters, so they
// keep a stable identity for the whole drag and memoized columns/cards do not
// re-render just because a drag frame passed by.
function useDndStartHandlers(
  setDraggedItem: (next: DragItemState) => void,
  setCardDropTarget: React.Dispatch<React.SetStateAction<CardDropTarget | null>>,
) {
  const handleCardDragStart = useCallback((e: React.DragEvent, id: string, sourceGroupKey: string) => {
    initDragData(e, { type: 'card', itemId: id, sourceGroupKey }, id)
    setDraggedItem({ type: 'card', id, sourceGroupKey })
  }, [setDraggedItem])

  const handleColumnDragStart = useCallback((e: React.DragEvent, groupKey: string) => {
    initDragData(e, { type: 'column', groupKey }, groupKey)
    setDraggedItem({ type: 'column', groupKey })
  }, [setDraggedItem])

  const handleCardDragOver = useCallback((e: React.DragEvent, targetCardId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const next = computeDropPosition(e, targetCardId)
    // dragover fires every frame; hovering the same half of the same card is
    // not a new drop target, so keep the previous object and memoized cards
    // see an unchanged prop
    setCardDropTarget((prev) =>
      prev && prev.cardId === next.cardId && prev.position === next.position ? prev : next,
    )
  }, [setCardDropTarget])

  return { handleCardDragStart, handleColumnDragStart, handleCardDragOver }
}

// The cell a drag is over, keyed on the whole cell: a column of a banded board is drawn once per
// row, and a highlight keyed on the column alone would light all of them up at once.
function useDragOverCell() {
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null)
  return {
    setDragOverCell: useCallback((cell: KanbanBoardCell) => setDragOverCellKey(kanbanCellKey(cell)), []),
    clearDragOverCell: useCallback(() => setDragOverCellKey(null), []),
    isDragOverCell: (cell: KanbanBoardCell) => dragOverCellKey === kanbanCellKey(cell),
  }
}

interface DragRef {
  current: {
    draggedItem: DragItemState
    cardDropTarget: CardDropTarget | null
    onMoveItem: MoveCardFn
    onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void
  }
}

function useCellDropHandlers(dragRef: DragRef, handleDragEnd: () => void) {
  const handleCardDrop = useCallback(
    (e: React.DragEvent, targetCell: KanbanBoardCell, targetCardId: string) => {
      e.preventDefault()
      e.stopPropagation()
      const { draggedItem: dragged, cardDropTarget: target, onMoveItem: move } = dragRef.current
      processCardDrop(e, dragged, targetCell, targetCardId, target, move)
      handleDragEnd()
    },
    [handleDragEnd],
  )

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetCell: KanbanBoardCell) => {
      e.preventDefault()
      const { draggedItem: dragged, onMoveItem: move, onReorderColumns: reorder } = dragRef.current
      processColumnDrop(e, dragged, targetCell, move, reorder)
      handleDragEnd()
    },
    [handleDragEnd],
  )

  return { handleCardDrop, handleColumnDrop }
}

export function useKanbanBoardDndState(
  onMoveItem: MoveCardFn,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const [draggedItem, setDraggedItem] = useState<DragItemState>(null)
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null)
  const { setDragOverCell, clearDragOverCell, isDragOverCell } = useDragOverCell()

  // Drop handlers read the in-flight drag state and the move callbacks at call
  // time through this ref, so their identity survives re-renders while the
  // drop still routes to the latest onMoveItem.
  const dragRef = useRef({ draggedItem, cardDropTarget, onMoveItem, onReorderColumns })
  dragRef.current = { draggedItem, cardDropTarget, onMoveItem, onReorderColumns }

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    clearDragOverCell()
    setCardDropTarget(null)
  }, [clearDragOverCell])

  const startHandlers = useDndStartHandlers(setDraggedItem, setCardDropTarget)
  const dropHandlers = useCellDropHandlers(dragRef, handleDragEnd)

  return {
    isDragOverCell,
    setDragOverCell,
    cardDropTarget,
    handleDragEnd,
    ...startHandlers,
    ...dropHandlers,
  }
}

