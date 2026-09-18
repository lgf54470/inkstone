import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanFile, KanbanItem, KanbanProperty, KanbanPropertyType } from '../types'
import { KanbanFilesCell } from './kanban-files-cell'

const EMPTY_VALUE_MARK = '-'

export const KANBAN_TITLE_COLUMN: KanbanProperty = { id: 'title', name: 'Title', type: 'title' }

// Attachments live on the item, not in `properties`, so the table always has a
// column for them even when the document schema does not declare one.
export const KANBAN_FILES_COLUMN: KanbanProperty = { id: 'files', name: 'Files', type: 'files' }

export function kanbanTitleColumn(columns: KanbanProperty[]): KanbanProperty {
  return columns.find((col) => col.type === 'title' || col.id === 'title') ?? KANBAN_TITLE_COLUMN
}

export function kanbanPropertyColumns(columns: KanbanProperty[]): KanbanProperty[] {
  const declared = columns.filter((col) => col.type !== 'title' && col.id !== 'title')
  return declared.some((col) => col.type === 'files') ? declared : [...declared, KANBAN_FILES_COLUMN]
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

function PlainValue({ text }: { text: string }) {
  if (!text) {
    return <span className='text-[var(--text-quaternary)]'>{EMPTY_VALUE_MARK}</span>
  }
  return <span className='truncate text-[var(--text-primary)]'>{text}</span>
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

function MultiSelectValue({ column, values }: { column: KanbanProperty; values: string[] }) {
  if (values.length === 0) return <PlainValue text='' />
  return (
    <div className='flex flex-wrap items-center gap-1 py-1.5'>
      {values.map((val) => {
        const color = resolveKanbanTagColor(val, column.options)
        const label = column.options?.find((opt) => opt.id === val || opt.label === val)?.label ?? val
        return (
          <span
            key={val}
            style={getKanbanTagStyle(color)}
            className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold'
          >
            {formatKanbanOptionLabel(label, column.id)}
          </span>
        )
      })}
    </div>
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
  onUpdateFiles: (itemId: string, files: KanbanFile[]) => void
}

function CellContent({ column, item, onUpdateProperty, onUpdateFiles }: KanbanPropertyCellProps) {
  const value = item.properties[column.id]
  const write = (next: unknown) => onUpdateProperty(item.id, column.id, next)

  if (column.type === 'select') {
    return <SelectValue column={column} value={value} onChange={write} />
  }
  if (column.type === 'multi-select') {
    return <MultiSelectValue column={column} values={readValues(value)} />
  }
  if (column.type === 'checkbox') {
    return <CheckboxValue column={column} checked={Boolean(value)} onChange={write} />
  }
  if (column.type === 'files') {
    return <KanbanFilesCell files={item.files} onChangeFiles={(files) => onUpdateFiles(item.id, files)} />
  }
  return <PlainValue text={readPlainText(value)} />
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

export function KanbanTableHeaderCell({ column }: { column: KanbanProperty }) {
  return (
    <div
      data-kanban-column={column.id}
      className={`border-l border-[var(--border-subtle)] px-3 py-2 ${column.type === 'checkbox' || column.type === 'files' ? 'text-center' : ''} ${kanbanColumnWidth(column)}`}
    >
      <span>{formatKanbanPropertyName(column)}</span>
    </div>
  )
}
