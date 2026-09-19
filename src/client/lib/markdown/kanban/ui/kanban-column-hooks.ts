import { useCallback } from 'react'
import { t } from '../../../i18n'
import { toastWithUndo } from '../../../../store/ui'
import { getDeterministicTagColor } from '../colors'
import { createKanbanId } from '../id'
import { reorderKanbanColumns } from '../dnd'
import type { CommitKanbanData } from './kanban-history'
import type {
  KanbanColorName,
  KanbanData,
  KanbanFilter,
  KanbanOption,
  KanbanProperty,
  KanbanPropertyType,
  KanbanSort,
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

/** The types the reader can put on a column. `title` and `files` are the two the table draws itself. */
export const KANBAN_EDITABLE_TYPES: readonly KanbanPropertyType[] = [
  'text',
  'number',
  'select',
  'multi-select',
  'date',
  'checkbox',
  'person',
]

const TYPE_NAME_KEYS: Record<string, Parameters<typeof t>[0]> = {
  text: 'preview.kanban_type_text',
  number: 'preview.kanban_type_number',
  select: 'preview.kanban_type_select',
  'multi-select': 'preview.kanban_type_multi_select',
  date: 'preview.kanban_type_date',
  checkbox: 'preview.kanban_type_checkbox',
  person: 'preview.kanban_type_person',
  title: 'preview.kanban_prop_title',
  files: 'preview.kanban_files',
}

/** The name of a column type for the type picker, which is a message rather than the token the fence stores. */
export function formatKanbanColumnTypeLabel(type: KanbanPropertyType): string {
  const key = TYPE_NAME_KEYS[type]
  return key ? t(key) : type
}

// A column the table has to draw itself cannot be edited away from under the reader: the title column
// is where an item's name lives and the attachments column reads `item.files`, not `item.properties`.
function isProtectedColumn(column: KanbanProperty | undefined): boolean {
  return !column || column.type === 'title' || column.type === 'files' || column.id === 'title' || column.id === 'files'
}

function findColumn(data: KanbanData, propertyId: string): KanbanProperty | undefined {
  return data.columns.find((col) => col.id === propertyId)
}

function replaceColumn(data: KanbanData, propertyId: string, next: KanbanProperty): KanbanData {
  return { ...data, columns: data.columns.map((col) => (col.id === propertyId ? next : col)) }
}

function writeValues(data: KanbanData, propertyId: string, read: (value: unknown) => unknown): KanbanData {
  return {
    ...data,
    items: data.items.map((item) =>
      item.properties[propertyId] === undefined
        ? item
        : { ...item, properties: { ...item.properties, [propertyId]: read(item.properties[propertyId]) } },
    ),
  }
}

/** The id the fence stores a value under: lower-case, word boundaries folded to hyphens. */
function columnSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function uniqueColumnId(columns: KanbanProperty[], name: string): string {
  const base = columnSlug(name) || `col-${createKanbanId()}`
  if (!columns.some((col) => col.id === base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!columns.some((col) => col.id === candidate)) return candidate
  }
}

export function addPropertyColumn(data: KanbanData, name: string, type: KanbanPropertyType): KanbanData {
  const label = name.trim()
  if (!label || type === 'title' || type === 'files') return data
  const column: KanbanProperty = { id: uniqueColumnId(data.columns, label), name: label, type }
  return { ...data, columns: [...data.columns, column] }
}

export function renamePropertyColumn(data: KanbanData, propertyId: string, name: string): KanbanData {
  const column = findColumn(data, propertyId)
  const label = name.trim()
  if (isProtectedColumn(column) || !label || !column) return data
  return replaceColumn(data, propertyId, { ...column, name: label })
}

export function movePropertyColumn(data: KanbanData, propertyId: string, offset: number): KanbanData {
  const index = data.columns.findIndex((col) => col.id === propertyId)
  const target = index + offset
  if (index === -1 || target < 0 || target >= data.columns.length) return data
  const columns = [...data.columns]
  const [moved] = columns.splice(index, 1)
  columns.splice(target, 0, moved!)
  return { ...data, columns }
}

/** The distinct values a column holds, in the order the items say them. */
function storedValues(data: KanbanData, propertyId: string): string[] {
  const seen: string[] = []
  for (const item of data.items) {
    const value = item.properties[propertyId]
    const parts = Array.isArray(value) ? value : [value]
    for (const part of parts) {
      if (part === undefined || part === null || part === '') continue
      const text = String(part)
      if (!seen.includes(text)) seen.push(text)
    }
  }
  return seen
}

function optionCovers(options: KanbanOption[], value: string): boolean {
  return options.some((opt) => opt.id === value || opt.label === value)
}

// Turning a column into a choice column has to give every value it already holds somewhere to live,
// so the options missing from the list are derived from the values rather than the values being
// dropped for want of an option.
function optionsForValues(data: KanbanData, column: KanbanProperty): KanbanOption[] {
  const options = [...(column.options ?? [])]
  const existing = new Set(options.map((opt) => opt.id))
  for (const value of storedValues(data, column.id)) {
    if (optionCovers(options, value)) continue
    const slug = columnSlug(value) || `opt-${createKanbanId()}`
    let id = slug
    for (let n = 2; existing.has(id); n++) id = `${slug}-${n}`
    existing.add(id)
    options.push({ id, label: value, color: getDeterministicTagColor(value) })
  }
  return options
}

function optionIdFor(options: KanbanOption[], value: string): string {
  return options.find((opt) => opt.id === value || opt.label === value)?.id ?? value
}

function optionLabelFor(options: KanbanOption[], value: string): string {
  const opt = options.find((o) => o.id === value || o.label === value)
  return opt?.label ?? value
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (value === undefined || value === null || value === '') return []
  return [String(value)]
}

function asNumber(value: unknown): unknown {
  const text = String(value).trim()
  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : value
}

/**
 * Retypes a column without losing what is in it: the select family gains the options its values need
 * and stores their ids, leaving it writes back the labels the reader was shown, and a value no
 * conversion fits stays exactly as it was.
 */
export function changePropertyColumnType(data: KanbanData, propertyId: string, type: KanbanPropertyType): KanbanData {
  const column = findColumn(data, propertyId)
  if (isProtectedColumn(column) || !column || column.type === type) return data
  const wasChoice = column.type === 'select' || column.type === 'multi-select'
  const isChoice = type === 'select' || type === 'multi-select'
  const options = isChoice ? optionsForValues(data, column) : undefined
  const nextColumn: KanbanProperty = options ? { ...column, type, options } : { id: column.id, name: column.name, type }

  let next = replaceColumn(data, propertyId, nextColumn)
  if (wasChoice || isChoice) {
    next = writeValues(next, propertyId, (value) => {
      const parts = toArray(value).map((part) =>
        isChoice ? optionIdFor(options!, part) : optionLabelFor(column.options ?? [], part),
      )
      // A select keeps one value, so the collapse takes what it can read; a multi-select keeps them all.
      return type === 'multi-select' ? parts : parts[0]
    })
  } else if (type === 'number') {
    next = writeValues(next, propertyId, asNumber)
  }
  return next
}

/** A view field that names a column has to let go of it when the column goes. */
function releaseColumnField<T extends KanbanView>(view: T, propertyId: string): T {
  const fields = ['groupBy', 'dateField', 'startField', 'endField', 'progressField', 'chartGroupBy'] as const
  const next = { ...view }
  for (const field of fields) {
    if (next[field] === propertyId) delete next[field]
  }
  const filters: KanbanFilter[] | undefined = view.filters?.filter((f) => f.propertyId !== propertyId)
  const sorts: KanbanSort[] | undefined = view.sorts?.filter((s) => s.propertyId !== propertyId)
  if (view.filters) next.filters = filters
  if (view.sorts) next.sorts = sorts
  if (view.hiddenColumns) next.hiddenColumns = view.hiddenColumns.filter((id) => id !== propertyId)
  return next
}

export function removePropertyColumn(data: KanbanData, propertyId: string): KanbanData {
  const column = findColumn(data, propertyId)
  if (isProtectedColumn(column)) return data
  return {
    ...data,
    columns: data.columns.filter((col) => col.id !== propertyId),
    items: data.items.map((item) =>
      item.properties[propertyId] === undefined ? item : { ...item, properties: { ...item.properties, [propertyId]: undefined } },
    ),
    views: data.views.map((view) => releaseColumnField(view, propertyId)),
  }
}

/** Batch deletes are destructive, so their undo window stays open longer than an informational toast. */
const COLUMN_DELETE_UNDO_TOAST_MS = 8000

/** The document-level writers of the table's column schema, on the board's one commit path. */
export interface KanbanSchemaOperations {
  addColumn: (name: string, type: KanbanPropertyType) => void
  renameColumn: (propertyId: string, name: string) => void
  changeColumnType: (propertyId: string, type: KanbanPropertyType) => void
  deleteColumn: (propertyId: string) => void
  moveColumn: (propertyId: string, offset: -1 | 1) => void
}

export function useKanbanSchemaOperations(
  commitData: CommitKanbanData,
  undo: () => void,
): KanbanSchemaOperations {
  const addColumn = useCallback(
    (name: string, type: KanbanPropertyType) => commitData((prev) => addPropertyColumn(prev, name, type)),
    [commitData],
  )

  const renameColumn = useCallback(
    (propertyId: string, name: string) => commitData((prev) => renamePropertyColumn(prev, propertyId, name)),
    [commitData],
  )

  // Retyping rewrites the values of every card, so it is undoable on the same terms as a delete.
  const changeColumnType = useCallback(
    (propertyId: string, type: KanbanPropertyType) => {
      commitData((prev) => changePropertyColumnType(prev, propertyId, type))
      toastWithUndo(t('preview.kanban_column_retyped'), undo, { duration: COLUMN_DELETE_UNDO_TOAST_MS })
    },
    [commitData, undo],
  )

  const deleteColumn = useCallback(
    (propertyId: string) => {
      commitData((prev) => removePropertyColumn(prev, propertyId))
      toastWithUndo(t('preview.kanban_column_deleted'), undo, { duration: COLUMN_DELETE_UNDO_TOAST_MS })
    },
    [commitData, undo],
  )

  const moveColumn = useCallback(
    (propertyId: string, offset: -1 | 1) => commitData((prev) => movePropertyColumn(prev, propertyId, offset)),
    [commitData],
  )

  return { addColumn, renameColumn, changeColumnType, deleteColumn, moveColumn }
}
