import { useCallback } from 'react'
import { appendOptionToColumn } from './kanban-column-hooks'
import type { CommitKanbanData } from './kanban-history'
import type { KanbanData, KanbanFile, KanbanItem, KanbanOption, KanbanSubtask } from '../types'

/**
 * A card's days, moved by a drag on the timeline or the gantt. One commit for both of the days a bar
 * spans, because they are one gesture: two writes would put two steps in the undo stack and the reader
 * would have to press undo twice to take back a single drag.
 */
function useKanbanRescheduleWrite(commitData: CommitKanbanData) {
  return useCallback(
    (id: string, patch: Record<string, string>) => {
      if (Object.keys(patch).length === 0) return
      commitData((prev: KanbanData) => withItemProperties(prev, id, patch))
    },
    [commitData],
  )
}

/** Several of one item's own properties in one commit — the shape a drag that moves two dates needs. */
function withItemProperties(prev: KanbanData, id: string, patch: Record<string, unknown>): KanbanData {
  return {
    ...prev,
    items: prev.items.map((item) =>
      item.id === id ? { ...item, properties: { ...item.properties, ...patch } } : item,
    ),
  }
}

/** One item's own property, merged into the newest document; a brand new option rides the same commit. */
function withItemProperty(
  prev: KanbanData,
  id: string,
  columnId: string,
  value: unknown,
  newOption?: KanbanOption,
): KanbanData {
  const next = withItemProperties(prev, id, { [columnId]: value })
  return newOption ? { ...next, columns: appendOptionToColumn(prev.columns, columnId, newOption) } : next
}

/**
 * One item's own fields, as a view writes them: its attachments, its subtasks, one cell of it. Every
 * writer here is built from the document the commit sees rather than from the render that asked for
 * it, so an unchanged writer keeps one identity for the board's whole life — which is what lets the
 * views below stay memoized. A closure minted per render made every card's props new, so a click
 * that only opened one card's detail panel repainted the entire board (K-19).
 */
export function useKanbanValueWrites(commitData: CommitKanbanData) {
  const patchItem = useCallback((id: string, patch: Partial<KanbanItem>) => {
    commitData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }, [commitData])

  const handleUpdateFiles = useCallback(
    (id: string, files: KanbanFile[]) => patchItem(id, { files }),
    [patchItem],
  )

  const handleUpdateSubtasks = useCallback(
    (id: string, subtasks: KanbanSubtask[]) => patchItem(id, { subtasks }),
    [patchItem],
  )

  const handleUpdateProperty = useCallback(
    (id: string, propertyId: string, value: unknown) => {
      commitData((prev: KanbanData) => withItemProperty(prev, id, propertyId, value))
    },
    [commitData],
  )

  const handleRescheduleItem = useKanbanRescheduleWrite(commitData)

  const handleUpdateMultiSelect = useCallback(
    (id: string, columnId: string, values: string[], newOption?: KanbanOption) => {
      commitData((prev: KanbanData) => withItemProperty(prev, id, columnId, values, newOption))
    },
    [commitData],
  )

  const handleUpdateTags = useCallback(
    (id: string, tags: string[], newOption?: KanbanOption) => {
      handleUpdateMultiSelect(id, 'tags', tags, newOption)
    },
    [handleUpdateMultiSelect],
  )

  return {
    handleUpdateFiles,
    handleUpdateSubtasks,
    handleUpdateProperty,
    handleRescheduleItem,
    handleUpdateMultiSelect,
    handleUpdateTags,
  }
}
