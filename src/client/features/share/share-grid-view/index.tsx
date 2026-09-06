import { Share2 } from 'lucide-react'
import type { ShareInfo } from '@shared/types'
import { t } from '../../../lib/i18n'
import { useShareList } from '../use-share-list'
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
    const list = useShareList()

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
            {shares.map((share) => (
                <ShareGridCard
                    key={share.noteId}
                    share={share}
                    isSelected={list.selectedNoteIds.has(share.noteId)}
                    folders={list.folders}
                    copiedSlug={list.copiedSlug}
                    onToggleSelect={() => list.toggleSelect(share.noteId)}
                    onTogglePin={() => void list.togglePin(share.noteId)}
                    onToggleStar={() => void list.toggleStar(share.noteId)}
                    onToggleShare={(checked) => void list.toggleShare(share.noteId, checked)}
                    onCopy={list.handleCopy}
                    onOpenQr={() => onOpenQr(share)}
                    onOpenAnalytics={() => onOpenAnalytics(share)}
                    onOpenEdit={() => onOpenEdit(share)}
                    onMoveToFolder={(folderId) => void list.handleMoveToFolder(share.noteId, folderId)}
                    onRevoke={() => void list.handleRevoke(share)}
                />
            ))}
        </div>
    )
}