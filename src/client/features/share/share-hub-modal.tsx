import { useState } from 'react'
import { PanelLeft, Share2, X } from 'lucide-react'
import { Drawer, Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useBreakpoint } from '../../lib/hooks'
import { Z_INDEX } from '../../lib/z-index'
import type { ShareHubModalBundle } from './use-share-hub-modal'
import { useShareHubModal } from './use-share-hub-modal'
import { ShareHubSidebar } from './share-hub-sidebar'
import { ShareQrModal } from './share-qr-modal'
import { ShareEditModal } from './share-edit-modal'
import { ShareNoteAnalyticsModal } from './share-note-analytics-modal'
import { ShareVisitLogsModal } from './share-visit-logs-modal'
import { ShareSettingsModal } from './share-settings-modal'

const MODAL_WIDTH = 1300
const SIDEBAR_DRAWER_WIDTH = 260
const DESKTOP_MODAL_CLASS = 'h-[84vh] min-h-145 max-h-220 p-0 overflow-hidden flex flex-col'
const MOBILE_MODAL_CLASS = 'p-0 overflow-hidden flex flex-col'

export function ShareHubModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const hub = useShareHubModal(open, initialNoteId)
  const isMobile = useBreakpoint() === 'mobile'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const closeSidebar = () => setIsSidebarOpen(false)
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        ariaLabel={t('share.hub_title')}
        width={MODAL_WIDTH}
        variant={isMobile ? 'fullscreen' : 'dialog'}
        className={isMobile ? MOBILE_MODAL_CLASS : DESKTOP_MODAL_CLASS}
        bodyClassName='p-0 flex-1 min-h-0 flex flex-col overflow-hidden'
      >
        <HubHeader onClose={onClose} onOpenSidebar={isMobile ? () => setIsSidebarOpen(true) : undefined} />
        <div className='flex min-h-0 flex-1'>
          {!isMobile && <ShareHubSidebar />}
          <HubContent hub={hub} />
        </div>
      </Modal>
      {open && isSidebarOpen && (
        <Drawer
          open
          onClose={closeSidebar}
          side='left'
          width={SIDEBAR_DRAWER_WIDTH}
          zIndex={Z_INDEX.menuHigh}
          title={t('share.hub_title')}
        >
          <ShareHubSidebar onNavigate={closeSidebar} />
        </Drawer>
      )}
      <HubOverlays hub={hub} />
    </>
  )
}

function HubHeader({ onClose, onOpenSidebar }: {
  onClose: () => void
  onOpenSidebar?: () => void
}) {
  return (
    <div className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]'>
      <div className='flex items-center gap-2'>
        <Share2 size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('share.hub_title')}
        </h2>
      </div>
      <div className='flex items-center gap-1'>
        {onOpenSidebar && (
          <IconButton label={t('share.open_sidebar')} size='sm' onClick={onOpenSidebar}>
            <PanelLeft size={15} />
          </IconButton>
        )}
        <IconButton label={t('common.close')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
    </div>
  )
}

/**
 * The open category's view, whichever it is. The shell hands over the callbacks it can serve and
 * nothing else: what the view paints, and what it needed loaded to paint it, is the view's own
 * declaration (`./share-hub-views`).
 */
function HubContent({ hub }: { hub: ShareHubModalBundle }) {
  const View = hub.view.Component
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)] overflow-hidden'>
      <View {...hub.viewProps} />
    </div>
  )
}

function HubOverlays({ hub }: { hub: ShareHubModalBundle }) {
  const { qrShare, setQrShare, editShare, setEditShare, loadShares } = hub

  return (
    <>
      {qrShare && (
        <ShareQrModal
          open={Boolean(qrShare)}
          onClose={() => setQrShare(null)}
          url={qrShare.url}
          title={qrShare.title}
          slug={qrShare.slug}
        />
      )}

      {editShare && (
        <ShareEditModal
          open={Boolean(editShare)}
          onClose={() => setEditShare(null)}
          share={editShare.share}
          noteId={editShare.noteId}
          noteTitle={editShare.title}
          onSaved={() => void loadShares()}
        />
      )}
      <HubInsightOverlays hub={hub} />
    </>
  )
}

function HubInsightOverlays({ hub }: { hub: ShareHubModalBundle }) {
  const { analyticsNoteId, setAnalyticsNoteId, isLogsOpen, setIsLogsOpen, logsNoteId, setLogsNoteId, isSettingsOpen, setIsSettingsOpen, viewProps, setQrShare } = hub
  return (
    <>
      {analyticsNoteId && (
        <ShareNoteAnalyticsModal
          open={Boolean(analyticsNoteId)}
          onClose={() => setAnalyticsNoteId(null)}
          noteId={analyticsNoteId}
          onOpenQr={(url, title, slug) => setQrShare({ url, title, slug })}
          onOpenLogs={() => viewProps.onOpenLogs(analyticsNoteId)}
        />
      )}

      {isLogsOpen && (
        <ShareVisitLogsModal
          open={isLogsOpen}
          onClose={() => {
            setIsLogsOpen(false)
            setLogsNoteId(null)
          }}
          initialNoteId={logsNoteId ?? undefined}
        />
      )}

      {isSettingsOpen && (
        <ShareSettingsModal
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  )
}