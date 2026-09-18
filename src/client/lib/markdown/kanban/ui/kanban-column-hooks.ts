import { useCallback } from 'react'
import { reorderKanbanColumns } from '../dnd'
import type { CommitKanbanData } from './kanban-history'
import type {
  KanbanColorName,
  KanbanData,
  KanbanOption,
  KanbanProperty,
  KanbanView,
} from '../types'

function deleteColumnFromData(data: KanbanData, groupKey: string, groupByPropertyId: string): KanbanData {
  const nextCols = data.columns.map((col) => {
    if (col.id !== groupByPropertyId || !col.options) return col
    return { ...col, options: col.options.filter((opt) => opt.id !== groupKey) }
  })
  const nextItems = data.items.map((it) =>
    it.properties[groupByPropertyId] === groupKey
      ? { ...it, properties: { ...it.properties, [groupByPropertyId]: undefined } }
      : it,
  )
  return { ...data, columns: nextCols, items: nextItems }
}

function updateColumnInList(
  columns: KanbanProperty[],
  groupByPropertyId: string,
  groupKey: string,
  patch: { label?: string; color?: KanbanColorName },
): KanbanProperty[] {
  return columns.map((col) => {
    if (col.id !== groupByPropertyId || !col.options) return col
    const nextOptions = col.options.map((opt: KanbanOption) => (opt.id === groupKey ? { ...opt, ...patch } : opt))
    return { ...col, options: nextOptions }
  })
}

export function appendOptionToColumn(columns: KanbanProperty[], columnId: string, option: KanbanOption): KanbanProperty[] {
  const colIndex = columns.findIndex((col) => col.id === columnId)
  if (colIndex === -1) {
    return [...columns, { id: columnId, name: columnId === 'tags' ? 'Tags' : columnId, type: 'multi-select', options: [option] }]
  }
  return columns.map((col) => {
    if (col.id !== columnId) return col
    const existing = col.options ?? []
    const matchIndex = existing.findIndex((o: KanbanOption) => o.id === option.id || o.label === option.label)
    if (matchIndex !== -1) {
      const updated = [...existing]
      updated[matchIndex] = { ...updated[matchIndex]!, color: option.color }
      return { ...col, options: updated }
    }
    return { ...col, options: [...existing, option] }
  })
}

export function useKanbanColumnOperations(commitData: CommitKanbanData, activeView: KanbanView) {
  const groupByPropertyId = activeView.groupBy || 'status'

  const handleReorderColumns = useCallback(
    (sourceGroupKey: string, targetGroupKey: string) => commitData((prev) => ({
      ...prev,
      columns: reorderKanbanColumns(prev.columns, groupByPropertyId, sourceGroupKey, targetGroupKey),
    })),
    [groupByPropertyId, commitData],
  )

  const handleUpdateColumn = useCallback(
    (groupKey: string, patch: { label?: string; color?: KanbanColorName }) => commitData((prev) => ({
      ...prev,
      columns: updateColumnInList(prev.columns, groupByPropertyId, groupKey, patch),
    })),
    [groupByPropertyId, commitData],
  )

  const handleDeleteColumn = useCallback(
    (groupKey: string) => commitData((prev) => deleteColumnFromData(prev, groupKey, groupByPropertyId)),
    [groupByPropertyId, commitData],
  )

  const handleChangeGroupBy = useCallback(
    (newGroupBy: string) => commitData((prev) => ({
      ...prev,
      views: prev.views.map((v) => (v.id === activeView.id ? { ...v, groupBy: newGroupBy } : v)),
    })),
    [activeView.id, commitData],
  )

  const handleAddColumnOption = useCallback(
    (columnId: string, option: KanbanOption) => commitData((prev) => ({
      ...prev,
      columns: appendOptionToColumn(prev.columns, columnId, option),
    })),
    [commitData],
  )

  return { handleReorderColumns, handleUpdateColumn, handleDeleteColumn, handleChangeGroupBy, handleAddColumnOption }
}
