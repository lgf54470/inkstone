import { useCallback } from 'react'
import { appendOptionToColumn } from './kanban-column-hooks'
import type { CommitKanbanData } from './kanban-history'
import type { KanbanData, KanbanFile, KanbanItem, KanbanOption, KanbanSubtask } from '../types'

/** One item's own property, merged into the newest document; a brand new option rides the same commit. */
function withItemProperty(
  prev: KanbanData,
  id: string,
  columnId: string,
  value: unknown,
  newOption?: KanbanOption,
): KanbanData {
  const items = prev.items.map((item) =>
    item.id === id ? { ...item, properties: { ...item.properties, [columnId]: value } } : item,
  )
  const columns = newOption
    ? appendOptionToColumn(prev.columns, columnId, newOption)
    : prev.columns
  return { ...prev, items, columns }
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
    handleUpdateMultiSelect,
    handleUpdateTags,
  }
}
