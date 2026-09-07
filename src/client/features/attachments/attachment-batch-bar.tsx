import { Download, FolderClosed, Star, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'


interface AttachmentBatchBarProps {
  selectedCount: number
  onClearSelection: () => void
  onBatchDownload: () => void
  onBatchMove: () => void
  onBatchStar: () => void
  onBatchDelete: () => void
}

type BatchButton = {
  key: 'attachments.batch_download' | 'attachments.batch_move' | 'attachments.star' | 'common.delete'
  icon: ReactNode
  variant: 'secondary' | 'danger'
  onClick: () => void
}

export function AttachmentBatchBar(props: AttachmentBatchBarProps) {
  const { selectedCount, onClearSelection, onBatchDownload, onBatchMove, onBatchStar, onBatchDelete } = props
  if (selectedCount === 0) return null

  const buttons: BatchButton[] = [
    { key: 'attachments.batch_download', icon: <Download size={13} />, variant: 'secondary', onClick: onBatchDownload },
    { key: 'attachments.batch_move', icon: <FolderClosed size={13} />, variant: 'secondary', onClick: onBatchMove },
    { key: 'attachments.star', icon: <Star size={13} />, variant: 'secondary', onClick: onBatchStar },
    { key: 'common.delete', icon: <Trash2 size={13} />, variant: 'danger', onClick: onBatchDelete },
  ]

  return (
    <div className='anim-pop absolute bottom-4 left-1/2 -translate-x-1/2 z-[var(--z-float)] flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-[var(--shadow-modal)]'>
      <div className='flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3'>
        <span className="text-[length:var(--text-12\\.5)] font-semibold text-[var(--text-primary)]">
          {t('attachments.selected_count', { value0: selectedCount })}
        </span>
        <IconButton label={t('common.clear_selection')} size='sm' onClick={onClearSelection}>
          <X size={13} />
        </IconButton>
      </div>
      <div className='flex items-center gap-1.5'>
        {buttons.map((b) => (
          <Button key={b.key} size='sm' variant={b.variant} icon={b.icon} onClick={b.onClick}>
            {t(b.key)}
          </Button>
        ))}
      </div>
    </div>
  )
}