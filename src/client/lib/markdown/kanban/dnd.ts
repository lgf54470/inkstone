import type { KanbanItem, KanbanProperty } from './types'

export interface CardDragPayload {
  type: 'card'
  itemId: string
  sourceGroupKey: string
}

export interface ColumnDragPayload {
  type: 'column'
  groupKey: string
}

export type KanbanDragPayload = CardDragPayload | ColumnDragPayload

export function parseKanbanDragData(dataTransfer: DataTransfer): KanbanDragPayload | null {
  try {
    const raw = dataTransfer.getData('application/json')
    if (raw) {
      const parsed = JSON.parse(raw) as KanbanDragPayload
      if (parsed && (parsed.type === 'card' || parsed.type === 'column')) {
        return parsed
      }
    }
  } catch {
    // best-effort fallback if JSON parsing fails
  }
  const text = dataTransfer.getData('text/plain')
  if (text) {
    return { type: 'card', itemId: text, sourceGroupKey: '' }
  }
  return null
}

export interface KanbanMovePivot {
  itemId: string
  position: 'before' | 'after'
}

function appendAfterTargetGroup(
  result: KanbanItem[],
  updatedItem: KanbanItem,
  targetGroupItems: KanbanItem[],
): KanbanItem[] {
  const lastTargetItem = targetGroupItems[targetGroupItems.length - 1]!
  const insertAfterIdx = result.findIndex((it) => it.id === lastTargetItem.id)
  result.splice(insertAfterIdx + 1, 0, updatedItem)
  return result
}

function insertIntoTargetGroup(
  withoutItem: KanbanItem[],
  updatedItem: KanbanItem,
  targetGroupItems: KanbanItem[],
  pivot?: KanbanMovePivot,
): KanbanItem[] {
  const result = [...withoutItem]
  if (pivot) {
    const pivotIdx = result.findIndex((it) => it.id === pivot.itemId)
    if (pivotIdx !== -1) {
      result.splice(pivot.position === 'before' ? pivotIdx : pivotIdx + 1, 0, updatedItem)
      return result
    }
  }
  return appendAfterTargetGroup(result, updatedItem, targetGroupItems)
}

export function reorderKanbanItems(
  items: KanbanItem[],
  itemId: string,
  groupPropertyId: string,
  targetGroupKey: string,
  pivot?: KanbanMovePivot,
): KanbanItem[] {
  const itemIndex = items.findIndex((it) => it.id === itemId)
  if (itemIndex === -1) return items
  if (pivot && pivot.itemId === itemId) return items

  const currentItem = items[itemIndex]!
  const newGroupVal = targetGroupKey === '__none__' ? undefined : targetGroupKey
  const updatedItem: KanbanItem = {
    ...currentItem,
    properties: {
      ...currentItem.properties,
      [groupPropertyId]: newGroupVal,
    },
  }

  const withoutItem = items.filter((it) => it.id !== itemId)
  const targetGroupItems = withoutItem.filter((it) => {
    const v = it.properties[groupPropertyId]
    return targetGroupKey === '__none__' ? !v : v === targetGroupKey
  })

  if (targetGroupItems.length === 0) {
    return [...withoutItem, updatedItem]
  }

  return insertIntoTargetGroup(withoutItem, updatedItem, targetGroupItems, pivot)
}

export function reorderKanbanColumns(
  columns: KanbanProperty[],
  groupByPropertyId: string,
  sourceGroupKey: string,
  targetGroupKey: string,
): KanbanProperty[] {
  return columns.map((col) => {
    if (col.id !== groupByPropertyId || !col.options) return col
    const sourceIdx = col.options.findIndex((o) => o.id === sourceGroupKey)
    const targetIdx = col.options.findIndex((o) => o.id === targetGroupKey)
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return col

    const nextOptions = [...col.options]
    const [moved] = nextOptions.splice(sourceIdx, 1)
    if (!moved) return col
    nextOptions.splice(targetIdx, 0, moved)
    return { ...col, options: nextOptions }
  })
}
