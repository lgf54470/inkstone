import { memo, useRef } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { t, useLocaleRepaint } from '../../../i18n'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanProperty, KanbanSort } from '../types'

interface KanbanSortPopoverProps {
  open: boolean
  panelId: string
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  columns: KanbanProperty[]
  sorts: KanbanSort[]
  onChangeSorts: (sorts: KanbanSort[]) => void
}

function SortHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] pb-2'>
      <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
        {t('preview.kanban_sort_rules')}
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

function SortRow({
  sort,
  index,
  columns,
  onUpdate,
  onRemove,
}: {
  sort: KanbanSort
  index: number
  columns: KanbanProperty[]
  onUpdate: (index: number, patch: Partial<KanbanSort>) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className='flex items-center gap-1.5'>
      <select
        value={sort.propertyId}
        onChange={(e) => onUpdate(index, { propertyId: e.target.value })}
        aria-label={t('preview.kanban_sort_property')}
        className='h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-1 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none'
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {formatKanbanPropertyName(c)}
          </option>
        ))}
      </select>

      <select
        value={sort.direction}
        onChange={(e) => onUpdate(index, { direction: e.target.value as 'asc' | 'desc' })}
        aria-label={t('preview.kanban_sort_direction')}
        className='h-7 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-1 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none'
      >
        <option value='asc'>{t('preview.kanban_sort_asc')}</option>
        <option value='desc'>{t('preview.kanban_sort_desc')}</option>
      </select>

      <button
        type='button'
        onClick={() => onRemove(index)}
        className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
        aria-label={t('preview.kanban_delete_sort')}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function SortList({
  sorts,
  columns,
  onUpdate,
  onRemove,
}: {
  sorts: KanbanSort[]
  columns: KanbanProperty[]
  onUpdate: (index: number, patch: Partial<KanbanSort>) => void
  onRemove: (index: number) => void
}) {
  if (sorts.length === 0) {
    return (
      <p className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-tertiary)]'>
        {t('preview.kanban_no_sort_rules')}
      </p>
    )
  }

  return (
    <div className='flex max-h-60 flex-col gap-2 overflow-y-auto'>
      {sorts.map((sort, index) => (
        <SortRow
          key={index}
          sort={sort}
          index={index}
          columns={columns}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

export const KanbanSortPopover = memo(function KanbanSortPopover({
  open,
  panelId,
  onClose,
  anchorRef,
  columns,
  sorts,
  onChangeSorts,
}: KanbanSortPopoverProps) {
  useLocaleRepaint()
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)
  useEscape(open, onClose)

  if (!open) return null

  const handleAddSort = () => {
    const defaultProp = columns[0]?.id ?? 'title'
    onChangeSorts([...sorts, { propertyId: defaultProp, direction: 'asc' }])
  }

  const handleUpdate = (index: number, patch: Partial<KanbanSort>) => {
    const next = [...sorts]
    next[index] = { ...next[index]!, ...patch }
    onChangeSorts(next)
  }

  return (
    <div
      id={panelId}
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_sort_rules')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1.5 flex w-72 flex-col gap-2 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-pop)]'
    >
      <SortHeader onClose={onClose} />
      <SortList
        sorts={sorts}
        columns={columns}
        onUpdate={handleUpdate}
        onRemove={(i) => onChangeSorts(sorts.filter((_, idx) => idx !== i))}
      />
      <button
        type='button'
        onClick={handleAddSort}
        className='flex items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border-default)] p-1.5 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      >
        <Plus size={13} />
        <span>{t('preview.kanban_add_sort')}</span>
      </button>
    </div>
  )
})
