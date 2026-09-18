import { RotateCcw, RotateCw } from 'lucide-react'
import { t } from '../../../i18n'

interface KanbanWriteStatusProps {
  unsaved?: boolean
  onRetry?: () => void
  onDiscard?: () => void
}

export function KanbanWriteStatus({ unsaved, onRetry, onDiscard }: KanbanWriteStatusProps) {
  if (!unsaved || !onRetry) return null
  return (
    <span
      data-kanban-write-status
      role='status'
      className='inline-flex items-center gap-1 rounded-[var(--r-md)] bg-[var(--bg-sunken)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)]'
    >
      <span>{t('preview.kanban_unsaved')}</span>
      <button
        type='button'
        onClick={onRetry}
        className='inline-flex size-5 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        aria-label={t('common.retry')}
        title={t('common.retry')}
      >
        <RotateCw size={12} />
      </button>
      {onDiscard && (
        <button
          type='button'
          onClick={onDiscard}
          className='inline-flex size-5 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
          aria-label={t('preview.kanban_discard_changes')}
          title={t('preview.kanban_discard_changes')}
        >
          <RotateCcw size={12} />
        </button>
      )}
    </span>
  )
}
