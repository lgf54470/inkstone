import { memo, useMemo, useRef } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useClickOutside } from '../../../../components/overlay'
import { t } from '../../../i18n'
import type { KanbanFilter, KanbanFilterOperator, KanbanProperty } from '../types'

interface KanbanFilterPopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  columns: KanbanProperty[]
  filters: KanbanFilter[]
  onChangeFilters: (filters: KanbanFilter[]) => void
}

function FilterHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] pb-2'>
      <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
        {t('preview.kanban_filter_rules')}
      </span>
      <button
        type='button'
        onClick={onClose}
        className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_clear_selection')}
      >
        <X size={14} />
      </button>
    </div>
  )
}

interface FilterRowProps {
  filter: KanbanFilter
  index: number
  columns: KanbanProperty[]
  operators: { id: KanbanFilterOperator; label: string }[]
  onUpdate: (index: number, patch: Partial<KanbanFilter>) => void
  onRemove: (index: number) => void
}

function FilterRow({ filter, index, columns, operators, onUpdate, onRemove }: FilterRowProps) {
  const needsValueInput = !['is_empty', 'is_not_empty'].includes(filter.operator)

  return (
    <div className='flex items-center gap-1.5'>
      <select
        value={filter.propertyId}
        onChange={(e) => onUpdate(index, { propertyId: e.target.value })}
        className='h-7 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-1 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none'
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={filter.operator}
        onChange={(e) => onUpdate(index, { operator: e.target.value as KanbanFilterOperator })}
        className='h-7 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-1 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none'
      >
        {operators.map((op) => (
          <option key={op.id} value={op.id}>
            {op.label}
          </option>
        ))}
      </select>

      {needsValueInput && (
        <input
          type='text'
          value={filter.value ?? ''}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          placeholder={t('preview.kanban_value_placeholder')}
          className='h-7 min-w-0 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-1.5 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none'
        />
      )}

      <button
        type='button'
        onClick={() => onRemove(index)}
        className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
        aria-label={t('preview.kanban_delete_rule')}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function FilterAddButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type='button'
      onClick={onAdd}
      className='flex items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border-default)] p-1.5 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
    >
      <Plus size={13} />
      <span>{t('preview.kanban_add_condition')}</span>
    </button>
  )
}

function FilterList({
  filters,
  columns,
  operators,
  onUpdate,
  onRemove,
}: {
  filters: KanbanFilter[]
  columns: KanbanProperty[]
  operators: { id: KanbanFilterOperator; label: string }[]
  onUpdate: (index: number, patch: Partial<KanbanFilter>) => void
  onRemove: (index: number) => void
}) {
  if (filters.length === 0) {
    return (
      <p className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {t('preview.kanban_no_filter_rules')}
      </p>
    )
  }

  return (
    <div className='flex max-h-60 flex-col gap-2 overflow-y-auto'>
      {filters.map((filter, index) => (
        <FilterRow
          key={index}
          filter={filter}
          index={index}
          columns={columns}
          operators={operators}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

export const KanbanFilterPopover = memo(function KanbanFilterPopover({
  open,
  onClose,
  anchorRef,
  columns,
  filters,
  onChangeFilters,
}: KanbanFilterPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)

  const operators = useMemo<{ id: KanbanFilterOperator; label: string }[]>(
    () => [
      { id: 'equals', label: t('preview.kanban_op_equals') },
      { id: 'not_equals', label: t('preview.kanban_op_not_equals') },
      { id: 'contains', label: t('preview.kanban_op_contains') },
      { id: 'not_contains', label: t('preview.kanban_op_not_contains') },
      { id: 'is_empty', label: t('preview.kanban_op_is_empty') },
      { id: 'is_not_empty', label: t('preview.kanban_op_is_not_empty') },
    ],
    [],
  )

  if (!open) return null

  const handleAddFilter = () => {
    const defaultProp = columns[0]?.id ?? 'title'
    onChangeFilters([...filters, { propertyId: defaultProp, operator: 'contains', value: '' }])
  }

  const handleUpdate = (index: number, patch: Partial<KanbanFilter>) => {
    const next = [...filters]
    next[index] = { ...next[index]!, ...patch }
    onChangeFilters(next)
  }

  return (
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_filter_rules')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1.5 flex w-80 flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-pop)]'
    >
      <FilterHeader onClose={onClose} />
      <FilterList
        filters={filters}
        columns={columns}
        operators={operators}
        onUpdate={handleUpdate}
        onRemove={(i) => onChangeFilters(filters.filter((_, idx) => idx !== i))}
      />
      <FilterAddButton onAdd={handleAddFilter} />
    </div>
  )
})
