import { Download, FolderClosed, Star, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'

export function AttachmentBatchBar({
  selectedCount,
  onClearSelection,
  onBatchDownload,
  onBatchMove,
  onBatchStar,
  onBatchDelete,
}: {
  selectedCount: number
  onClearSelection: () => void
  onBatchDownload: () => void
  onBatchMove: () => void
  onBatchStar: () => void
  onBatchDelete: () => void
}) {
  if (selectedCount === 0) return null

  return (
    <div className="anim-pop absolute bottom-4 left-1/2 -translate-x-1/2 z-[var(--z-float)] flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-[var(--shadow-modal)]">
      <div className="flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3">
        <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
          {t('attachments.selected_count', { value0: selectedCount })}
        </span>
        <IconButton
          label={t('common.clear_selection')}
          size="sm"
          onClick={onClearSelection}
        >
          <X size={13} />
        </IconButton>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon={<Download size={13} />}
          onClick={onBatchDownload}
        >
          {t('attachments.batch_download')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FolderClosed size={13} />}
          onClick={onBatchMove}
        >
          {t('attachments.batch_move')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Star size={13} />}
          onClick={onBatchStar}
        >
          {t('attachments.star')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={13} />}
          onClick={onBatchDelete}
        >
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )
}
