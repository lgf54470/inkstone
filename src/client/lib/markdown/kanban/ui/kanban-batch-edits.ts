import { useCallback } from 'react'
import { appendOptionToColumn } from './kanban-column-hooks'
import type { CommitKanbanData } from './kanban-history'
import type { KanbanOption, KanbanProperty } from '../types'

/**
 * What a card carries under a multi-select property: the list it holds, or the single value a board
 * authored elsewhere wrote where a list belongs. Reading it here rather than at each call site keeps
 * the batch editor from mistaking a string for a list and losing the tag it was meant to add to.
 */
export function kanbanTagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  return typeof value === 'string' && value ? [value] : []
}

export interface KanbanBatchEditsApi {
  handleBatchGroupChange: (groupId: string) => void
  handleBatchSetProperty: (propertyId: string, value: unknown) => void
  handleBatchAddTag: (propertyId: string, tagId: string, newOption?: KanbanOption) => void
}

interface KanbanBatchEditScope {
  selectedIds: Set<string>
  /** The field the batch bar's group picker writes; the view's grouping property, not always `status`. */
  groupColumn?: KanbanProperty
  commitData: CommitKanbanData
  clearSelection: () => void
}

/**
 * Moving the whole batch into another group. The one batch write that ends the selection, because it
 * relocates the cards the batch was gathered around — what is left in the columns the reader picked
 * from is no longer the set they are working on.
 */
function useKanbanBatchGroupChange({
  selectedIds,
  groupColumn,
  commitData,
  clearSelection,
}: KanbanBatchEditScope) {
  return useCallback(
    (groupId: string) => {
      if (selectedIds.size === 0) return
      const propertyId = groupColumn?.id || 'status'
      // A multi-select column keeps its array shape. The value the picker sent replaces the field
      // wholesale: a group is what the board cuts columns by, so a card cannot stand in two at once.
      const value = groupColumn?.type === 'multi-select' ? [groupId] : groupId
      commitData((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          selectedIds.has(item.id) ? { ...item, properties: { ...item.properties, [propertyId]: value } } : item,
        ),
      }))
      clearSelection()
    },
    [selectedIds, groupColumn?.id, groupColumn?.type, commitData, clearSelection],
  )
}

/**
 * Batch writes of one field, in one commit for the whole selection. They leave every card exactly
 * where it stands, so the selection survives them: a reader who has just re-aimed twenty cards may
 * well want to tag them next, and picking them again is the very cost this bar exists to remove.
 */
function useKanbanBatchFieldWrites(selectedIds: Set<string>, commitData: CommitKanbanData) {
  const handleBatchSetProperty = useCallback(
    (propertyId: string, value: unknown) => {
      if (selectedIds.size === 0) return
      commitData((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          selectedIds.has(item.id) ? { ...item, properties: { ...item.properties, [propertyId]: value } } : item,
        ),
      }))
    },
    [selectedIds, commitData],
  )

  const handleBatchAddTag = useCallback(
    (propertyId: string, tagId: string, newOption?: KanbanOption) => {
      if (selectedIds.size === 0) return
      commitData((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (!selectedIds.has(item.id)) return item
          const tags = kanbanTagList(item.properties[propertyId])
          // A card that already carries the tag is handed back untouched, so the editor never adds a
          // second copy of a value the reader can only see once.
          if (tags.includes(tagId)) return item
          return { ...item, properties: { ...item.properties, [propertyId]: [...tags, tagId] } }
        }),
        columns: newOption ? appendOptionToColumn(prev.columns, propertyId, newOption) : prev.columns,
      }))
    },
    [selectedIds, commitData],
  )

  return { handleBatchSetProperty, handleBatchAddTag }
}

export function useKanbanBatchEdits(scope: KanbanBatchEditScope): KanbanBatchEditsApi {
  const handleBatchGroupChange = useKanbanBatchGroupChange(scope)
  const { handleBatchSetProperty, handleBatchAddTag } = useKanbanBatchFieldWrites(scope.selectedIds, scope.commitData)
  return { handleBatchGroupChange, handleBatchSetProperty, handleBatchAddTag }
}
