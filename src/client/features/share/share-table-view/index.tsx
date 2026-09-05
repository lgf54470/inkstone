import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { ShareInfo } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { useShareStore } from '../share-store'
import { ShareTableRow } from './row'

export function ShareTableView({
  shares,
  onOpenQr: onOpenQrModal,
  onOpenAnalytics,
  onOpenEdit,
}: {
  shares: ShareInfo[]
  onOpenQr: (share: ShareInfo) => void
  onOpenAnalytics: (share: ShareInfo) => void
  onOpenEdit: (share: ShareInfo) => void
}) {
  const toast = useUi((s) => s.toast)
  const folders = useShareStore((s) => s.folders)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const toggleSelect = useShareStore((s) => s.toggleSelect)
  const toggleSelectAll = useShareStore((s) => s.toggleSelectAll)
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)
  const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
  const batchToggle = useShareStore((s) => s.batchToggle)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const allSelected = shares.length > 0 && selectedNoteIds.size === shares.length

  const handleCopyLink = async (url: string, slug: string) => {
    try {
      const full = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
      await navigator.clipboard.writeText(full)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), COPY_FEEDBACK_MS)
    } catch (error) {
      console.warn('[share] failed to copy link', error)
    }
  }

  const handleMoveToFolder = async (noteId: string, folderId: string | null) => {
    const ok = await batchMoveToFolder([noteId], folderId)
    if (ok) {
      toast({ title: t('share.batch_move_success', { count: 1 }), tone: 'success' })
    }
  }

  const handleRevoke = async (share: ShareInfo) => {
    const ok = await confirm({
      title: t('share.revoke_this_public_link'),
      description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
      confirmLabel: t('share.revoke_link'),
      tone: 'danger',
    })
    if (!ok) return
    await batchToggle('revoke', [share.noteId])
  }

  if (shares.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <Share2 size={32} className="text-[var(--text-quaternary)]" />
        <p className="text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]">
          {t('share.no_shares_found')}
        </p>
        <p className="text-[length:var(--text-11)] text-[var(--text-tertiary)]">
          {t('share.no_shares_hint')}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-[var(--z-sticky)] bg-[var(--bg-card)] shadow-xs">
          <tr className="border-b border-[var(--border-subtle)] text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]">
            <th className="w-10 px-3 py-2 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-[var(--border-default)] accent-[var(--accent)]"
              />
            </th>
            <th className="px-3 py-2">{t('share.table_note_title')}</th>
            <th className="w-20 px-3 py-2 text-center">{t('share.table_status')}</th>
            <th className="w-48 px-3 py-2">{t('share.table_link')}</th>
            <th className="w-28 px-3 py-2">{t('share.table_security_expiry')}</th>
            <th className="w-24 px-3 py-2 text-right">{t('share.table_pv_uv')}</th>
            <th className="w-28 px-3 py-2 text-right">{t('share.table_last_visit')}</th>
            <th className="w-40 px-3 py-2 text-right">{t('share.table_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {shares.map((share) => {
            const isSelected = selectedNoteIds.has(share.noteId)
            return (
              <ShareTableRow
                key={share.noteId}
                share={share}
                isSelected={isSelected}
                folders={folders}
                copiedSlug={copiedSlug}
                onToggleSelect={() => toggleSelect(share.noteId)}
                onTogglePin={() => void togglePin(share.noteId)}
                onToggleStar={() => void toggleStar(share.noteId)}
                onToggleShare={(checked) => void toggleShare(share.noteId, checked)}
                onCopyLink={handleCopyLink}
                onOpenQrModal={onOpenQrModal}
                onOpenAnalytics={onOpenAnalytics}
                onOpenEdit={onOpenEdit}
                onMoveToFolder={(folderId) => void handleMoveToFolder(share.noteId, folderId)}
                onRevoke={() => void handleRevoke(share)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

