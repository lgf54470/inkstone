import { useState } from 'react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { ShareInfo } from '@shared/types'
import { confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useShareStore, type ShareStoreState } from './share-store'

export function useShareList() {
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

  const handleCopy = (url: string, slug: string) => copyShareLink(url, slug, setCopiedSlug)
  const handleMoveToFolder = (noteId: string, folderId: string | null) => moveShareToFolder(noteId, folderId, batchMoveToFolder, toast)
  const handleRevoke = (share: ShareInfo) => revokeShareFlow(share, batchToggle)

  return {
    folders, selectedNoteIds, toggleSelect, toggleSelectAll,
    toggleShare, togglePin, toggleStar, copiedSlug,
    handleCopy, handleMoveToFolder, handleRevoke,
  }
}

async function copyShareLink(
  url: string,
  slug: string,
  setCopiedSlug: (slug: string | null) => void,
): Promise<void> {
  try {
    const full = typeof window !== 'undefined' ? new URL(url, window.location.origin).href : url
    await navigator.clipboard.writeText(full)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), COPY_FEEDBACK_MS)
  } catch (error) {
    console.warn('[share] failed to copy link', error)
  }
}

async function moveShareToFolder(
  noteId: string,
  folderId: string | null,
  batchMoveToFolder: ShareStoreState['batchMoveToFolder'],
  toast: UiState['toast'],
): Promise<void> {
  const ok = await batchMoveToFolder([noteId], folderId)
  if (ok) {
    toast({ title: t('share.batch_move_success', { count: 1 }), tone: 'success' })
  }
}

async function revokeShareFlow(share: ShareInfo, batchToggle: ShareStoreState['batchToggle']): Promise<void> {
  const ok = await confirm({
    title: t('share.revoke_this_public_link'),
    description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
    confirmLabel: t('share.revoke_link'),
    tone: 'danger',
  })
  if (!ok) return
  await batchToggle('revoke', [share.noteId])
}