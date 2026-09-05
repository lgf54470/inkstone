import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { ShareInfo } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { useShareStore } from '../share-store'
import { ShareGridCard } from './card'

export function ShareGridView({
  shares,
  onOpenQr,
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
  const toggleShare = useShareStore((s) => s.toggleShare)
  const togglePin = useShareStore((s) => s.togglePin)
  const toggleStar = useShareStore((s) => s.toggleStar)
  const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
  const batchToggle = useShareStore((s) => s.batchToggle)

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const handleCopy = async (url: string, slug: string) => {
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
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {shares.map((share) => {
        const isSelected = selectedNoteIds.has(share.noteId)
        return (
          <ShareGridCard
            key={share.noteId}
            share={share}
            isSelected={isSelected}
            folders={folders}
            copiedSlug={copiedSlug}
            onToggleSelect={() => toggleSelect(share.noteId)}
            onTogglePin={() => void togglePin(share.noteId)}
            onToggleStar={() => void toggleStar(share.noteId)}
            onToggleShare={(checked) => void toggleShare(share.noteId, checked)}
            onCopy={handleCopy}
            onOpenQr={() => onOpenQr(share)}
            onOpenAnalytics={() => onOpenAnalytics(share)}
            onOpenEdit={() => onOpenEdit(share)}
            onMoveToFolder={(folderId) => void handleMoveToFolder(share.noteId, folderId)}
            onRevoke={() => void handleRevoke(share)}
          />
        )
      })}
    </div>
  )
}

