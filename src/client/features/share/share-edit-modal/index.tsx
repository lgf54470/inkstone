import { Globe } from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { ShareNoteAnalyticsModal } from '../share-note-analytics-modal'
import { ShareQrModal } from '../share-qr-modal'
import { useShareEditModal } from './use-share-edit-modal'
import { EditModalFooter, ShareExpiryCard, ShareFolderCard, ShareLinkCard, SharePasswordCard, ShareSlugCard, ShareStatusCard, ShareTagsCard } from './sections'

export function ShareEditModal({
  open,
  onClose,
  share: initialShare,
  noteId,
  noteTitle,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  share?: ShareInfo | null
  noteId: string
  noteTitle: string
  onSaved?: () => void
}) {
  const b = useShareEditModal({ open, onClose, share: initialShare, noteId, onSaved })
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--accent)]" />
            <span>{b.share ? t('share.edit_share_settings') : t('share.create_new_share')}</span>
          </div>
        }
        description={noteTitle}
        width={500}
        footer={<EditModalFooter b={b} onClose={onClose} />}
      >
        <div className="flex flex-col gap-3.5 py-1">
          <ShareLinkCard b={b} onClose={onClose} />
          <ShareStatusCard b={b} />
          <ShareFolderCard b={b} />
          <ShareTagsCard b={b} />
          <ShareSlugCard b={b} />
          <SharePasswordCard b={b} />
          <ShareExpiryCard b={b} />
        </div>
      </Modal>

      {b.isAnalyticsOpen && b.share && (
        <ShareNoteAnalyticsModal open={b.isAnalyticsOpen} onClose={() => b.setIsAnalyticsOpen(false)} noteId={noteId} />
      )}

      {b.isQrOpen && b.share && (
        <ShareQrModal open={b.isQrOpen} onClose={() => b.setIsQrOpen(false)} url={b.share.url} title={noteTitle} slug={b.share.slug} />
      )}
    </>
  )
}