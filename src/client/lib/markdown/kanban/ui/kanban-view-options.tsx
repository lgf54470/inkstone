import { memo, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Columns3, Pencil, Plus, Settings2, Sliders, Trash2 } from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { t, useLocaleRepaint } from '../../../i18n'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanProperty, KanbanPropertyType } from '../types'
import {
  formatKanbanColumnTypeLabel,
  KANBAN_EDITABLE_TYPES,
  type KanbanSchemaOperations,
} from './kanban-column-hooks'
import { kanbanPropertyColumns } from './kanban-property-cell'

export type CardSize = 'small' | 'medium' | 'large'

interface KanbanViewOptionsProps {
  open: boolean
  panelId: string
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  columns: KanbanProperty[]
  groupBy?: string
  cardSize?: CardSize
  hiddenColumns?: string[]
  onChangeGroupBy?: (propId: string) => void
  onChangeCardSize?: (size: CardSize) => void
  onToggleHiddenColumn?: (propertyId: string) => void
  schemaOps?: KanbanSchemaOperations
}

const CARD_SIZES: { id: CardSize; labelKey: 'preview.kanban_card_size_small' | 'preview.kanban_card_size_medium' | 'preview.kanban_card_size_large' }[] = [
  { id: 'small', labelKey: 'preview.kanban_card_size_small' },
  { id: 'medium', labelKey: 'preview.kanban_card_size_medium' },
  { id: 'large', labelKey: 'preview.kanban_card_size_large' },
]

function GroupBySection({
  groupBy,
  columns,
  onChangeGroupBy,
}: {
  groupBy: string
  columns: KanbanProperty[]
  onChangeGroupBy: (propId: string) => void
}) {
  const eligibleColumns = columns.filter((c) => c.id !== 'title')
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Sliders size={13} />
        <span>{t('preview.kanban_group_by')}</span>
      </div>
      <select
        value={groupBy}
        onChange={(e) => onChangeGroupBy(e.target.value)}
        className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      >
        {eligibleColumns.map((col) => (
          <option key={col.id} value={col.id}>
            {formatKanbanPropertyName(col)}
          </option>
        ))}
      </select>
    </div>
  )
}

function CardSizeSection({
  cardSize,
  onChangeCardSize,
}: {
  cardSize: CardSize
  onChangeCardSize: (size: CardSize) => void
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Settings2 size={13} />
        <span>{t('preview.kanban_card_size')}</span>
      </div>
      <div className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] p-0.5 bg-[var(--bg-raised)]'>
        {CARD_SIZES.map(({ id, labelKey }) => (
          <button
            key={id}
            type='button'
            onClick={() => onChangeCardSize(id)}
            className={`flex-1 rounded-[var(--r-sm)] py-1 text-center text-[length:var(--text-11)] font-medium transition-colors ${
              cardSize === id
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A schema column has an entry in `data.columns`; the attachments column the table draws does not. */
function isSchemaColumn(columns: KanbanProperty[], column: KanbanProperty): boolean {
  return column.type !== 'title' && column.type !== 'files' && columns.some((col) => col.id === column.id)
}

const EDITOR_ICON_BUTTON = 'inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-tertiary)] outline-none hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-40'
const EDITOR_FIELD = 'h-7 w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-1.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'

function ColumnTypeSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: KanbanPropertyType
  onChange: (type: KanbanPropertyType) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as KanbanPropertyType)}
      className={EDITOR_FIELD}
    >
      {KANBAN_EDITABLE_TYPES.map((type) => (
        <option key={type} value={type}>
          {formatKanbanColumnTypeLabel(type)}
        </option>
      ))}
    </select>
  )
}

// A draft, committed once: every keystroke would put a rewrite of the whole document in the undo
// stack, and typing a name is one edit however long it takes.
function ColumnNameField({
  column,
  onRename,
}: {
  column: KanbanProperty
  onRename: (propertyId: string, name: string) => void
}) {
  const [draft, setDraft] = useState(column.name)
  const commit = () => {
    const next = draft.trim()
    if (next && next !== column.name) onRename(column.id, next)
  }
  return (
    <input
      type='text'
      value={draft}
      data-owns-escape='true'
      aria-label={t('preview.kanban_column_name_field')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(column.name)
      }}
      className={EDITOR_FIELD}
    />
  )
}

function ColumnSchemaEditor({
  editorId,
  column,
  canMoveUp,
  canMoveDown,
  schemaOps,
}: {
  editorId: string
  column: KanbanProperty
  canMoveUp: boolean
  canMoveDown: boolean
  schemaOps: KanbanSchemaOperations
}) {
  return (
    <div
      id={editorId}
      role='group'
      aria-label={formatKanbanPropertyName(column)}
      className='m-1 flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-1.5'
    >
      <ColumnNameField column={column} onRename={schemaOps.renameColumn} />
      <ColumnTypeSelect
        label={t('preview.kanban_column_type')}
        value={column.type}
        onChange={(type) => schemaOps.changeColumnType(column.id, type)}
      />
      <div className='flex items-center gap-1'>
        <button
          type='button'
          aria-label={t('preview.kanban_move_column_up')}
          disabled={!canMoveUp}
          onClick={() => schemaOps.moveColumn(column.id, -1)}
          className={EDITOR_ICON_BUTTON}
        >
          <ArrowUp size={12} />
        </button>
        <button
          type='button'
          aria-label={t('preview.kanban_move_column_down')}
          disabled={!canMoveDown}
          onClick={() => schemaOps.moveColumn(column.id, 1)}
          className={EDITOR_ICON_BUTTON}
        >
          <ArrowDown size={12} />
        </button>
        <button
          type='button'
          aria-label={t('preview.kanban_delete_this_column')}
          onClick={() => schemaOps.deleteColumn(column.id)}
          className={`${EDITOR_ICON_BUTTON} ml-auto hover:text-[var(--danger)]`}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function AddColumnRow({ schemaOps }: { schemaOps: KanbanSchemaOperations }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<KanbanPropertyType>('text')
  const submit = () => {
    const label = name.trim()
    if (!label) return
    schemaOps.addColumn(label, type)
    setName('')
  }
  return (
    <div data-kanban-column-add className='flex items-center gap-1 border-t border-[var(--border-subtle)] pt-1.5'>
      <input
        type='text'
        value={name}
        data-owns-escape='true'
        aria-label={t('preview.kanban_column_name_field')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        className={`${EDITOR_FIELD} flex-1`}
      />
      <div className='w-24 shrink-0'>
        <ColumnTypeSelect label={t('preview.kanban_column_type')} value={type} onChange={setType} />
      </div>
      <button
        type='button'
        aria-label={t('preview.kanban_add_column')}
        disabled={!name.trim()}
        onClick={submit}
        className={EDITOR_ICON_BUTTON}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

function ColumnRow({
  column,
  editable,
  isFirst,
  isLast,
  hiddenColumns,
  onToggleHiddenColumn,
  schemaOps,
}: {
  column: KanbanProperty
  editable: boolean
  isFirst: boolean
  isLast: boolean
  hiddenColumns: string[]
  onToggleHiddenColumn: (propertyId: string) => void
  schemaOps?: KanbanSchemaOperations
}) {
  const editorId = useId()
  const [editing, setEditing] = useState(false)
  const name = formatKanbanPropertyName(column)
  const canEdit = editable && schemaOps !== undefined
  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-1'>
        <label
          className='flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--r-sm)] px-1 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <input
            type='checkbox'
            checked={!hiddenColumns.includes(column.id)}
            onChange={() => onToggleHiddenColumn(column.id)}
            className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
          />
          <span className='truncate'>{name}</span>
        </label>
        {canEdit && (
          <button
            type='button'
            aria-label={t('preview.kanban_edit_column_named', { name })}
            aria-expanded={editing}
            {...(editing ? { 'aria-controls': editorId } : {})}
            onClick={() => setEditing((open) => !open)}
            className={EDITOR_ICON_BUTTON}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {editing && schemaOps && (
        <ColumnSchemaEditor
          editorId={editorId}
          column={column}
          canMoveUp={!isFirst}
          canMoveDown={!isLast}
          schemaOps={schemaOps}
        />
      )}
    </div>
  )
}

function ColumnsSection({
  columns,
  hiddenColumns,
  onToggleHiddenColumn,
  schemaOps,
}: {
  columns: KanbanProperty[]
  hiddenColumns: string[]
  onToggleHiddenColumn: (propertyId: string) => void
  schemaOps?: KanbanSchemaOperations
}) {
  const rows = kanbanPropertyColumns(columns)
  const editableIds = rows.filter((col) => isSchemaColumn(columns, col)).map((col) => col.id)
  return (
    <fieldset className='flex min-w-0 flex-col gap-1.5'>
      <legend className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Columns3 size={13} />
        {t('preview.kanban_columns')}
      </legend>
      <div className='flex max-h-56 flex-col gap-0.5 overflow-auto'>
        {rows.map((column) => (
          <ColumnRow
            key={column.id}
            column={column}
            editable={isSchemaColumn(columns, column)}
            isFirst={editableIds[0] === column.id}
            isLast={editableIds.at(-1) === column.id}
            hiddenColumns={hiddenColumns}
            onToggleHiddenColumn={onToggleHiddenColumn}
            schemaOps={schemaOps}
          />
        ))}
      </div>
      {schemaOps && <AddColumnRow schemaOps={schemaOps} />}
    </fieldset>
  )
}

export const KanbanViewOptions = memo(function KanbanViewOptions({
  open,
  panelId,
  onClose,
  anchorRef,
  columns,
  groupBy,
  cardSize,
  hiddenColumns,
  onChangeGroupBy,
  onChangeCardSize,
  onToggleHiddenColumn,
  schemaOps,
}: KanbanViewOptionsProps) {
  useLocaleRepaint()
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)
  useEscape(open, onClose)

  if (!open) return null

  // Each section renders when the caller wired it: the board gets grouping and
  // card size, the table gets column visibility, neither sees the other's controls.
  return (
    <div
      id={panelId}
      ref={panelRef}
      role='dialog'
      aria-label={t(onToggleHiddenColumn ? 'preview.kanban_columns' : 'preview.kanban_group_by')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1 flex w-60 flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-pop)]'
    >
      {onChangeGroupBy && groupBy !== undefined && (
        <GroupBySection groupBy={groupBy} columns={columns} onChangeGroupBy={onChangeGroupBy} />
      )}
      {onChangeCardSize && cardSize !== undefined && (
        <CardSizeSection cardSize={cardSize} onChangeCardSize={onChangeCardSize} />
      )}
      {onToggleHiddenColumn && (
        <ColumnsSection
          columns={columns}
          hiddenColumns={hiddenColumns ?? []}
          onToggleHiddenColumn={onToggleHiddenColumn}
          schemaOps={schemaOps}
        />
      )}
    </div>
  )
})
