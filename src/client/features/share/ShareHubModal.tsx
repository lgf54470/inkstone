import { useEffect, useState } from 'react'
import { Share2, X } from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'
import { ShareHubSidebar } from './ShareHubSidebar'
import { ShareHubToolbar } from './ShareHubToolbar'
import { ShareTableView } from './ShareTableView'
import { ShareGridView } from './ShareGridView'
import { ShareDashboardView } from './ShareDashboardView'
import { ShareBatchBar } from './ShareBatchBar'
import { ShareQrModal } from './ShareQrModal'
import { ShareEditModal } from './ShareEditModal'
import { ShareNoteAnalyticsModal } from './ShareNoteAnalyticsModal'
import { ShareVisitLogsModal } from './ShareVisitLogsModal'
import { ShareSettingsModal } from './ShareSettingsModal'

export function ShareHubModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const category = useShareStore((s) => s.category)
  const viewMode = useShareStore((s) => s.viewMode)
  const shares = useShareStore((s) => s.shares)
  const loading = useShareStore((s) => s.loading)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const clearSelection = useShareStore((s) => s.clearSelection)
  const loadShares = useShareStore((s) => s.loadShares)

  const [qrShare, setQrShare] = useState<{ url: string; title: string; slug: string } | null>(null)
  const [editShare, setEditShare] = useState<{ share: ShareInfo | null; noteId: string; title: string } | null>(null)
  const [analyticsNoteId, setAnalyticsNoteId] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void loadShares()
    } else {
      clearSelection()
      setQrShare(null)
      setEditShare(null)
      setAnalyticsNoteId(null)
    }
  }, [open, loadShares, clearSelection])

  useEffect(() => {
    if (open && initialNoteId) {
      const match = shares.find((s) => s.noteId === initialNoteId)
      if (match) {
        setEditShare({
          share: match,
          noteId: match.noteId,
          title: match.noteTitle || '',
        })
      }
    }
  }, [open, initialNoteId, shares])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={1300}
        className="h-[84vh] min-h-[580px] max-h-[880px] p-0 overflow-hidden flex flex-col"
        bodyClassName="p-0 flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-[var(--accent)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t('share.hub_title')}
            </h2>
          </div>
          <IconButton label={t('common.close')} size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div className="flex min-h-0 flex-1">
          <ShareHubSidebar />

          <div className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]">
            {category === 'dashboard' ? (
              <ShareDashboardView
                onSelectNoteAnalytics={(noteId) => setAnalyticsNoteId(noteId)}
                onOpenLogs={() => setLogsOpen(true)}
              />
            ) : (
              <>
                <ShareHubToolbar
                  onOpenLogs={() => setLogsOpen(true)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
                <div className="flex-1 overflow-y-auto">
                  {loading && shares.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-[12px] text-[var(--text-quaternary)]">
                      {t('common.loading')}
                    </div>
                  ) : viewMode === 'table' ? (
                    <ShareTableView
                      shares={shares}
                      onOpenQr={(s) =>
                        setQrShare({
                          url: s.url,
                          title: s.noteTitle || '',
                          slug: s.slug,
                        })
                      }
                      onOpenAnalytics={(s) => setAnalyticsNoteId(s.noteId)}
                      onOpenEdit={(s) =>
                        setEditShare({
                          share: s.slug ? s : null,
                          noteId: s.noteId,
                          title: s.noteTitle || '',
                        })
                      }
                    />
                  ) : (
                    <ShareGridView
                      shares={shares}
                      onOpenQr={(s) =>
                        setQrShare({
                          url: s.url,
                          title: s.noteTitle || '',
                          slug: s.slug,
                        })
                      }
                      onOpenAnalytics={(s) => setAnalyticsNoteId(s.noteId)}
                      onOpenEdit={(s) =>
                        setEditShare({
                          share: s.slug ? s : null,
                          noteId: s.noteId,
                          title: s.noteTitle || '',
                        })
                      }
                    />
                  )}
                </div>

                <ShareBatchBar
                  selectedCount={selectedNoteIds.size}
                  onClearSelection={clearSelection}
                />
              </>
            )}
          </div>
        </div>
      </Modal>

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

      {analyticsNoteId && (
        <ShareNoteAnalyticsModal
          open={Boolean(analyticsNoteId)}
          onClose={() => setAnalyticsNoteId(null)}
          noteId={analyticsNoteId}
          onOpenQr={(url, title, slug) => setQrShare({ url, title, slug })}
        />
      )}

      {logsOpen && (
        <ShareVisitLogsModal
          open={logsOpen}
          onClose={() => setLogsOpen(false)}
        />
      )}

      {settingsOpen && (
        <ShareSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  )
}
