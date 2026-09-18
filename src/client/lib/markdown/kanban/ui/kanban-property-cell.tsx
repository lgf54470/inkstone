import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanFile, KanbanItem, KanbanOption, KanbanProperty, KanbanPropertyType, KanbanSort } from '../types'
import { KanbanDatePicker } from './kanban-date-picker'
import { KanbanFilesCell } from './kanban-files-cell'
import { KanbanTagPicker } from './kanban-tag-picker'

export const KANBAN_TITLE_COLUMN: KanbanProperty = { id: 'title', name: 'Title', type: 'title' }

// Attachments live on the item, not in `properties`, so the table always has a
// column for them even when the document schema does not declare one.
export const KANBAN_FILES_COLUMN: KanbanProperty = { id: 'files', name: 'Files', type: 'files' }

export function kanbanTitleColumn(columns: KanbanProperty[]): KanbanProperty {
  return columns.find((col) => col.type === 'title' || col.id === 'title') ?? KANBAN_TITLE_COLUMN
}

// The view's hidden list only reaches property columns: the title column is not
// part of this list at all, so no document can hide it.
export function kanbanPropertyColumns(columns: KanbanProperty[], hidden?: string[]): KanbanProperty[] {
  const declared = columns.filter((col) => col.type !== 'title' && col.id !== 'title')
  const withFiles = declared.some((col) => col.type === 'files') ? declared : [...declared, KANBAN_FILES_COLUMN]
  return hidden ? withFiles.filter((col) => !hidden.includes(col.id)) : withFiles
}

const COLUMN_WIDTH: Record<KanbanPropertyType, string> = {
  title: 'flex-1 min-w-48',
  select: 'w-36 shrink-0',
  'multi-select': 'w-44 shrink-0',
  date: 'w-32 shrink-0',
  text: 'w-36 shrink-0',
  number: 'w-24 shrink-0',
  checkbox: 'w-16 shrink-0',
  person: 'w-36 shrink-0',
  files: 'w-40 shrink-0',
}

export function kanbanColumnWidth(column: KanbanProperty): string {
  return COLUMN_WIDTH[column.type] ?? COLUMN_WIDTH.text
}

function readValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (value === undefined || value === null || value === '') return []
  return [String(value)]
}

function readPlainText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  return String(value)
}

function readNumber(text: string): number | '' {
  return text.trim() === '' ? '' : Number(text)
}

interface EditableValueProps {
  label: string
  text: string
  numberType?: boolean
  onSubmit: (next: string) => void
}

function EditableValue({ label, text, numberType = false, onSubmit }: EditableValueProps) {
  const [draft, setDraft] = useState(text)
  const [committed, setCommitted] = useState(text)
  if (text !== committed) {
    setCommitted(text)
    setDraft(text)
  }

  const submit = () => {
    if (draft === committed) return
    setCommitted(draft)
    onSubmit(draft)
  }

  return (
    <input
      type={numberType ? 'number' : 'text'}
      value={draft}
      data-owns-escape='true'
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') setDraft(committed)
      }}
      className='h-7 w-full rounded-[var(--r-sm)] border border-transparent bg-transparent px-1.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none hover:border-[var(--border-subtle)] focus:border-[var(--accent)]'
    />
  )
}

function SelectValue({
  column,
  value,
  onChange,
}: {
  column: KanbanProperty
  value: unknown
  onChange: (val: unknown) => void
}) {
  const options = column.options ?? []
  const current = options.find((opt) => opt.id === value || opt.label === value)
  return (
    <select
      value={current?.id ?? String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      style={getKanbanTagStyle(current?.color)}
      className='h-7 w-full cursor-pointer rounded-[var(--r-sm)] border-none px-2 text-[length:var(--text-11)] font-bold outline-none'
    >
      {options.map((opt) => (
        <option key={opt.id} value={opt.id} className='bg-[var(--bg-surface)] text-[var(--text-primary)]'>
          {formatKanbanOptionLabel(opt, column.id)}
        </option>
      ))}
    </select>
  )
}

function CheckboxValue({
  column,
  checked,
  onChange,
}: {
  column: KanbanProperty
  checked: boolean
  onChange: (val: unknown) => void
}) {
  return (
    <input
      type='checkbox'
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={formatKanbanPropertyName(column)}
      className='size-3.5 rounded-[var(--r-xs)] accent-[var(--accent)]'
    />
  )
}

interface KanbanPropertyCellProps {
  column: KanbanProperty
  item: KanbanItem
  onUpdateProperty: (itemId: string, propertyId: string, value: unknown) => void
  onUpdateMultiSelect: (itemId: string, columnId: string, values: string[], newOption?: KanbanOption) => void
  onUpdateFiles: (itemId: string, files: KanbanFile[]) => void
}

function CellContent({
  column,
  item,
  onUpdateProperty,
  onUpdateMultiSelect,
  onUpdateFiles,
}: KanbanPropertyCellProps) {
  const value = item.properties[column.id]
  const write = (next: unknown) => onUpdateProperty(item.id, column.id, next)

  if (column.type === 'select') {
    return <SelectValue column={column} value={value} onChange={write} />
  }
  if (column.type === 'multi-select') {
    return (
      <KanbanTagPicker
        tags={readValues(value)}
        options={column.options}
        onChangeTags={(next, newOption) => onUpdateMultiSelect(item.id, column.id, next, newOption)}
      />
    )
  }
  if (column.type === 'checkbox') {
    return <CheckboxValue column={column} checked={Boolean(value)} onChange={write} />
  }
  if (column.type === 'files') {
    return <KanbanFilesCell files={item.files} onChangeFiles={(files) => onUpdateFiles(item.id, files)} />
  }
  if (column.type === 'date') {
    return (
      <KanbanDatePicker
        propertyName={formatKanbanPropertyName(column)}
        value={readPlainText(value)}
        onChange={write}
      />
    )
  }
  return (
    <EditableValue
      label={formatKanbanPropertyName(column)}
      text={readPlainText(value)}
      numberType={column.type === 'number'}
      onSubmit={(next) => write(column.type === 'number' ? readNumber(next) : next)}
    />
  )
}

export function KanbanPropertyCell(props: KanbanPropertyCellProps) {
  return (
    <div
      data-kanban-column={props.column.id}
      className={`border-l border-[var(--border-subtle)] px-2.5 py-1.5 text-[length:var(--text-12)] text-[var(--text-secondary)] ${kanbanColumnWidth(props.column)}`}
    >
      <CellContent {...props} />
    </div>
  )
}

export function KanbanTableHeaderCell({
  column,
  sort,
  onSort,
}: {
  column: KanbanProperty
  sort?: KanbanSort
  onSort?: (propertyId: string) => void
}) {
  const label = formatKanbanPropertyName(column)
  // Sorts read `properties[columnId]`, which attachments are not stored in, so
  // the files column stays a plain label.
  const sortable = column.type !== 'files' && onSort !== undefined
  const ariaLabel = !sort
    ? t('preview.kanban_sort_by_column', { column: label })
    : t(sort.direction === 'asc' ? 'preview.kanban_sorted_ascending' : 'preview.kanban_sorted_descending', { column: label })
  return (
    <div
      data-kanban-column={column.id}
      className={`border-l border-[var(--border-subtle)] px-3 py-2 ${column.type === 'checkbox' || column.type === 'files' ? 'text-center' : ''} ${kanbanColumnWidth(column)}`}
    >
      {sortable ? (
        <button
          type='button'
          onClick={() => onSort(column.id)}
          aria-label={ariaLabel}
          className='flex w-full items-center gap-1 rounded-[var(--r-sm)] text-left text-inherit outline-none hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
        >
          <span>{label}</span>
          {sort && (sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
      ) : (
        <span>{label}</span>
      )}
    </div>
  )
}
