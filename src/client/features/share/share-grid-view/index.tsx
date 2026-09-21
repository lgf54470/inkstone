import { useMemo } from 'react'
import type { ShareInfo } from '@shared/types'
import { useShareList } from '../use-share-list'
import { ShareListEmptyState } from '../share-list-empty'
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
  const folderById = useMemo(() => new Map(list.folders.map((f) => [f.id, f])), [list.folders])

  if (shares.length === 0) {
    return <ShareListEmptyState />
  }

  return (
    <div className='grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3'>
      {shares.map((share) => (
        <ShareGridCard
          key={share.noteId}
          share={share}
          isSelected={list.selectedNoteIds.has(share.noteId)}
          folders={list.folders}
          folderById={folderById}
          copiedSlug={list.copiedSlug}
          onToggleSelect={list.toggleSelect}
          onTogglePin={list.togglePin}
          onToggleStar={list.toggleStar}
          onToggleShare={list.toggleShare}
          onCopy={list.handleCopy}
          onOpenQr={onOpenQr}
          onOpenAnalytics={onOpenAnalytics}
          onOpenEdit={onOpenEdit}
          onMoveToFolder={list.handleMoveToFolder}
          onRevoke={list.handleRevoke}
        />
      ))}
    </div>
  )
}