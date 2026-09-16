import { memo } from 'react'
import { Trash2, X } from 'lucide-react'
import { t } from '../../../i18n'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanProperty } from '../types'

interface KanbanBatchBarProps {
  selectedCount: number
  statusColumn?: KanbanProperty
  onBatchStatusChange: (statusId: string) => void
  onBatchDelete: () => void
  onClearSelection: () => void
}

interface BatchStatusSelectProps {
  statusColumn: KanbanProperty
  onBatchStatusChange: (statusId: string) => void
}

function BatchStatusSelect({ statusColumn, onBatchStatusChange }: BatchStatusSelectProps) {
  if (!statusColumn.options) return null
  return (
    <select
      defaultValue=''
      onChange={(e) => {
        if (e.target.value) {
          onBatchStatusChange(e.target.value)
          e.target.value = ''
        }
      }}
      className='h-7 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
    >
      <option value='' disabled>
        {t('preview.kanban_batch_change_status')}
      </option>
      {statusColumn.options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {formatKanbanOptionLabel(opt, 'status')}
        </option>
      ))}
    </select>
  )
}

export const KanbanBatchBar = memo(function KanbanBatchBar({
  selectedCount,
  statusColumn,
  onBatchStatusChange,
  onBatchDelete,
  onClearSelection,
}: KanbanBatchBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className='absolute bottom-6 left-1/2 z-[var(--z-float)] flex -translate-x-1/2 items-center gap-3 rounded-[var(--r-xl)] border border-[var(--border-strong)] bg-[var(--bg-overlay)] px-4 py-2.5 shadow-[var(--shadow-modal)]'>
      <span className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {t('preview.kanban_batch_selected')} {selectedCount} {t('preview.kanban_batch_items')}
      </span>

      {statusColumn && (
        <BatchStatusSelect
          statusColumn={statusColumn}
          onBatchStatusChange={onBatchStatusChange}
        />
      )}

      <button
        type='button'
        onClick={onBatchDelete}
        className='flex items-center gap-1 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--danger)] hover:bg-[var(--bg-hover)]'
      >
        <Trash2 size={13} />
        <span>{t('preview.kanban_batch_delete')}</span>
      </button>

      <button
        type='button'
        onClick={onClearSelection}
        className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        aria-label={t('preview.kanban_clear_selection')}
      >
        <X size={15} />
      </button>
    </div>
  )
})
