import { useState } from 'react'
import { parseKanbanDragData } from '../dnd'
import type { groupKanbanItems } from '../filter-sort'

export type DragItemState =
  | { type: 'card'; id: string; sourceGroupKey: string }
  | { type: 'column'; groupKey: string }
  | null

export interface CardDropTarget {
  cardId: string
  position: 'top' | 'bottom'
}

type KanbanGroupType = ReturnType<typeof groupKanbanItems>[number]

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

function processCardDrop(
  e: React.DragEvent,
  draggedItem: DragItemState,
  targetGroup: KanbanGroupType,
  targetCardId: string,
  cardDropTarget: CardDropTarget | null,
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  const cardId = data?.type === 'card' ? data.itemId : draggedItem?.type === 'card' ? draggedItem.id : null
  if (cardId) {
    const cardIdx = targetGroup.items.findIndex((it) => it.id === targetCardId)
    const targetIndex = cardDropTarget?.position === 'bottom' ? cardIdx + 1 : cardIdx
    onMoveItem(cardId, targetGroup.groupKey, targetIndex)
  }
}

function processColumnDrop(
  e: React.DragEvent,
  draggedItem: DragItemState,
  targetGroupKey: string,
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const data = parseKanbanDragData(e.dataTransfer)
  if (data?.type === 'column' || draggedItem?.type === 'column') {
    const sourceKey = data?.type === 'column' ? data.groupKey : (draggedItem as { groupKey: string }).groupKey
    if (sourceKey && onReorderColumns) onReorderColumns(sourceKey, targetGroupKey)
  } else {
    const cardId = data?.type === 'card' ? data.itemId : draggedItem?.type === 'card' ? draggedItem.id : null
    if (cardId) onMoveItem(cardId, targetGroupKey)
  }
}

export function useKanbanBoardDndState(
  onMoveItem: (itemId: string, targetGroupKey: string, targetIndex?: number) => void,
  onReorderColumns?: (sourceGroupKey: string, targetGroupKey: string) => void,
) {
  const [draggedItem, setDraggedItem] = useState<DragItemState>(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null)
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null)

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverGroupKey(null)
    setCardDropTarget(null)
  }

  return {
    dragOverGroupKey,
    setDragOverGroupKey,
    cardDropTarget,
    handleDragEnd,
    handleCardDragStart: (e: React.DragEvent, id: string, sourceGroupKey: string) => {
      initDragData(e, { type: 'card', itemId: id, sourceGroupKey }, id)
      setDraggedItem({ type: 'card', id, sourceGroupKey })
    },
    handleColumnDragStart: (e: React.DragEvent, groupKey: string) => {
      initDragData(e, { type: 'column', groupKey }, groupKey)
      setDraggedItem({ type: 'column', groupKey })
    },
    handleCardDragOver: (e: React.DragEvent, targetCardId: string) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setCardDropTarget(computeDropPosition(e, targetCardId))
    },
    handleCardDrop: (e: React.DragEvent, targetGroup: KanbanGroupType, targetCardId: string) => {
      e.preventDefault()
      e.stopPropagation()
      processCardDrop(e, draggedItem, targetGroup, targetCardId, cardDropTarget, onMoveItem)
      handleDragEnd()
    },
    handleColumnDrop: (e: React.DragEvent, targetGroupKey: string) => {
      e.preventDefault()
      processColumnDrop(e, draggedItem, targetGroupKey, onMoveItem, onReorderColumns)
      handleDragEnd()
    },
  }
}

