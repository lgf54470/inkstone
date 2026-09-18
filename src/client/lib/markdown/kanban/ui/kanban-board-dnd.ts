import { useCallback, useRef, useState } from 'react'
import { parseKanbanDragData } from '../dnd'
import type { KanbanDragPayload, KanbanMovePivot } from '../dnd'
import type { groupKanbanItems } from '../filter-sort'

export type { KanbanMovePivot }

export type DragItemState =
  | { type: 'card'; id: string; sourceGroupKey: string }
  | { type: 'column'; groupKey: string }
  | null

export interface CardDropTarget {
  cardId: string
  position: 'top' | 'bottom'
}

type KanbanGroupType = ReturnType<typeof groupKanbanItems>[number]

type MoveCardFn = (itemId: string, targetGroupKey: string, pivot?: KanbanMovePivot) => void

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
  targetGroup: KanbanGroupType,
  targetCardId: string,
  cardDropTarget: CardDropTarget | null,
  onMoveItem: MoveCardFn,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  const cardId = resolveDroppedCardId(e, data, draggedItem)
  if (cardId) {
    const position: KanbanMovePivot['position'] =
      cardDropTarget?.cardId === targetCardId && cardDropTarget.position === 'bottom' ? 'after' : 'before'
    onMoveItem(cardId, targetGroup.groupKey, { itemId: targetCardId, position })
  }
}

function processColumnDrop(
  e: React.DragEvent,
  draggedItem: DragItemState,
  targetGroupKey: string,
  onMoveItem: MoveCardFn,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  if (data?.type === 'column' || draggedItem?.type === 'column') {
    const sourceKey = data?.type === 'column' ? data.groupKey : (draggedItem as { groupKey: string }).groupKey
    if (sourceKey && onReorderColumns) onReorderColumns(sourceKey, targetGroupKey)
  } else {
    const cardId = resolveDroppedCardId(e, data, draggedItem)
    if (cardId) onMoveItem(cardId, targetGroupKey)
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

export function useKanbanBoardDndState(
  onMoveItem: MoveCardFn,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const [draggedItem, setDraggedItem] = useState<DragItemState>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null)
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null)

  // Drop handlers read the in-flight drag state and the move callbacks at call
  // time through this ref, so their identity survives re-renders while the
  // drop still routes to the latest onMoveItem.
  const dragRef = useRef({ draggedItem, cardDropTarget, onMoveItem, onReorderColumns })
  dragRef.current = { draggedItem, cardDropTarget, onMoveItem, onReorderColumns }

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null)
    setDragOverGroupKey(null)
    setCardDropTarget(null)
  }, [])

  const startHandlers = useDndStartHandlers(setDraggedItem, setCardDropTarget)

  const handleCardDrop = useCallback(
    (e: React.DragEvent, targetGroup: KanbanGroupType, targetCardId: string) => {
      e.preventDefault()
      e.stopPropagation()
      const { draggedItem: dragged, cardDropTarget: target, onMoveItem: move } = dragRef.current
      processCardDrop(e, dragged, targetGroup, targetCardId, target, move)
      handleDragEnd()
    },
    [handleDragEnd],
  )

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetGroupKey: string) => {
      e.preventDefault()
      const { draggedItem: dragged, onMoveItem: move, onReorderColumns: reorder } = dragRef.current
      processColumnDrop(e, dragged, targetGroupKey, move, reorder)
      handleDragEnd()
    },
    [handleDragEnd],
  )

  return {
    dragOverGroupKey,
    setDragOverGroupKey,
    cardDropTarget,
    handleDragEnd,
    ...startHandlers,
    handleCardDrop,
    handleColumnDrop,
  }
}

