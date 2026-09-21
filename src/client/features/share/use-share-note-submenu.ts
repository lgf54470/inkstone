import { useEffect, useMemo, useState } from 'react'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { api, ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { promptWipePassword } from '../../lib/wipe-password-prompt'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useShareStore } from './share-store'

export type ShareNoteSubmenuBundle = ReturnType<typeof useShareNoteSubmenu>

export function useShareNoteSubmenu({
  noteId,
  noteTitle,
  share: initialShare,
  closeMenu,
  onOpenQr,
  onOpenAnalytics,
}: {
  noteId: string
  noteTitle: string
  share?: ShareInfo | null
  closeMenu: () => void
  onOpenQr: (url: string, title: string, slug: string) => void
  onOpenAnalytics: (share: ShareInfo) => void
}) {
  const toast = useUi((s) => s.toast)
  const shares = useShareStore((s) => s.shares)
  const shareFolders = useShareStore((s) => s.folders)
  const shareTags = useShareStore((s) => s.tags)
  const loadFolders = useShareStore((s) => s.loadFolders)
  const loadTags = useShareStore((s) => s.loadTags)

  const currentShare = useMemo(() => {
    return shares.find((s) => s.noteId === noteId) ?? initialShare ?? null
  }, [shares, noteId, initialShare])

  const [view, setView] = useState<'main' | 'folder' | 'tags'>('main')
  const [folderQuery, setFolderQuery] = useState('')
  const [newTagInput, setNewTagInput] = useState('')
  const [, setBusy] = useState(false)

  useEffect(() => {
    void loadFolders(); void loadTags()
  }, [loadFolders, loadTags])

  const filteredFolders = useMemo(() => {
    const q = folderQuery.trim().toLowerCase()
    if (!q) return shareFolders
    return shareFolders.filter((f) => f.name.toLowerCase().includes(q))
  }, [shareFolders, folderQuery])

  const currentTags = currentShare?.shareTags ?? []
  const availableSuggestedTags = useMemo(() => {
    const currentSet = new Set(currentTags)
    return shareTags.filter((t) => !currentSet.has(t.name))
  }, [shareTags, currentTags])

  const currentFolder = shareFolders.find((f) => f.id === currentShare?.shareFolderId)

  const actions = noteSubmenuActions({
    noteId, noteTitle, currentShare, folders: shareFolders, setBusy, toast,
    closeMenu, onOpenQr, onOpenAnalytics, setNewTagInput,
  })

  return {
    view, setView, folderQuery, setFolderQuery, newTagInput, setNewTagInput,
    currentShare, currentFolder, currentTags, filteredFolders, availableSuggestedTags,
    ...actions,
  }
}

/**
 * The commands the submenu can issue, kept out of the hook that derives what to draw: every one
 * of them takes the share as it stands at the moment of the click, closes the menu and reports
 * through the same toast, which is the whole of what they have in common.
 */
function noteSubmenuActions(params: {
  noteId: string
  noteTitle: string
  currentShare: ShareInfo | null
  folders: ShareFolder[]
  setBusy: (v: boolean) => void
  toast: UiState['toast']
  closeMenu: () => void
  onOpenQr: (url: string, title: string, slug: string) => void
  onOpenAnalytics: (share: ShareInfo) => void
  setNewTagInput: (v: string) => void
}) {
  const { noteId, noteTitle, currentShare, folders, setBusy, toast, closeMenu, setNewTagInput } = params
  return {
    handleOpenQr: () => openQrFlow(noteId, noteTitle, currentShare, setBusy, toast, closeMenu, params.onOpenQr),
    handleCopyLink: () => copyLinkFlow(noteId, currentShare, setBusy, toast, closeMenu),
    handleOpenAnalytics: () => openAnalyticsFlow(noteId, currentShare, setBusy, toast, closeMenu, params.onOpenAnalytics),
    handleSelectFolder: (folderId: string | null) => selectFolderFlow(noteId, currentShare, folderId, folders, setBusy, toast, closeMenu),
    handleAddTag: (tagName: string) => addTagFlow(noteId, tagName, currentShare, setBusy, setNewTagInput, toast),
    handleRemoveTag: (tagToRemove: string) => removeTagFlow(noteId, tagToRemove, currentShare, setBusy, toast),
    handleRevoke: () => revokeShareFlow(noteId, setBusy, toast, closeMenu),
    handleClearVisits: () => clearNoteVisitsFlow(noteId, setBusy, toast, closeMenu),
  }
}

/**
 * Deleting one link's visitor history is the same kind of act as revoking it — nothing brings it
 * back — so it asks twice (a danger confirm, then the account password the endpoint demands) and
 * reloads the list afterwards, because the row counts on screen come from the rows just deleted.
 */
async function clearNoteVisitsFlow(
  noteId: string,
  setBusy: (v: boolean) => void,
  toast: UiState['toast'],
  closeMenu: () => void,
): Promise<void> {
  closeMenu()
  const ok = await confirm({
    title: t('share.clear_note_visits_title'),
    description: t('share.clear_note_visits_confirm'),
    confirmLabel: t('share.clean_now'),
    tone: 'danger',
  })
  if (!ok) return
  const password = await promptWipePassword(t('share.verify_password_clear_note'))
  if (password === null) return
  setBusy(true)
  try {
    const res = await api.share.cleanVisitsForNote(noteId, password)
    toast({
      title: res.deleted > 0
        ? t('share.clear_note_visits_success', { count: res.deleted })
        : t('share.clear_note_visits_none'),
      tone: res.deleted > 0 ? 'success' : 'warning',
    })
    await useShareStore.getState().loadShares()
  } catch (error) {
    toast({
      title: error instanceof ApiError ? error.message : t('common.action_failed'),
      tone: 'danger',
    })
  } finally {
    setBusy(false)
  }
}

async function ensureShare(noteId: string, currentShare: ShareInfo | null, setBusy: (v: boolean) => void, toast: UiState['toast']): Promise<ShareInfo | null> {
  if (currentShare) return currentShare
  setBusy(true)
  try {
    // Since SH-19 a row can be shared without being in the store yet (the
    // startup summary only carries ids): ask the server before publishing.
    const fetched = await api.share.getNoteShare(noteId)
    if (fetched.share) return fetched.share
    const res = await api.share.create(noteId, { isEnabled: true })
    useShareStore.getState().applyServerShare(res.share)
    return res.share
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
    return null
  } finally {
    setBusy(false)
  }
}

async function openQrFlow(
  noteId: string,
  noteTitle: string,
  currentShare: ShareInfo | null,
  setBusy: (v: boolean) => void,
  toast: UiState['toast'],
  closeMenu: () => void,
  onOpenQr: (url: string, title: string, slug: string) => void,
): Promise<void> {
  const s = await ensureShare(noteId, currentShare, setBusy, toast)
  if (!s) return
  closeMenu()
  onOpenQr(s.url, noteTitle, s.slug)
}

async function copyLinkFlow(noteId: string, currentShare: ShareInfo | null, setBusy: (v: boolean) => void, toast: UiState['toast'], closeMenu: () => void): Promise<void> {
  const s = await ensureShare(noteId, currentShare, setBusy, toast)
  if (!s) return
  try {
    await navigator.clipboard.writeText(s.url)
    toast({ title: t('common.copied'), tone: 'success' })
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
  closeMenu()
}

async function openAnalyticsFlow(
  noteId: string,
  currentShare: ShareInfo | null,
  setBusy: (v: boolean) => void,
  toast: UiState['toast'],
  closeMenu: () => void,
  onOpenAnalytics: (share: ShareInfo) => void,
): Promise<void> {
  const s = await ensureShare(noteId, currentShare, setBusy, toast)
  if (!s) return
  closeMenu()
  onOpenAnalytics(s)
}

async function selectFolderFlow(
  noteId: string,
  currentShare: ShareInfo | null,
  folderId: string | null,
  shareFolders: ShareFolderList,
  setBusy: (v: boolean) => void,
  toast: UiState['toast'],
  closeMenu: () => void,
): Promise<void> {
  setBusy(true)
  try {
    if (currentShare) {
      await useShareStore.getState().batchMoveToFolder([noteId], folderId)
    } else {
      const res = await api.share.create(noteId, { isEnabled: true, folderId })
      useShareStore.getState().applyServerShare(res.share)
    }
    const targetFolder = shareFolders.find((f) => f.id === folderId)
    toast({
      title: targetFolder
        ? t('notes.move_to_value0', { value0: targetFolder.name })
        : t('share.batch_move_success', { count: 1 }),
      tone: 'success',
    })
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setBusy(false)
    closeMenu()
  }
}

async function addTagFlow(
  noteId: string,
  tagName: string,
  currentShare: ShareInfo | null,
  setBusy: (v: boolean) => void,
  setNewTagInput: (v: string) => void,
  toast: UiState['toast'],
): Promise<void> {
  const tag = tagName.trim()
  if (!tag) return
  const existingTags = currentShare?.shareTags ?? []
  if (existingTags.includes(tag)) {
    setNewTagInput('')
    return
  }
  const nextTags = [...existingTags, tag]
  setBusy(true)
  try {
    const res = await api.share.create(noteId, { isEnabled: true, tags: nextTags })
    useShareStore.getState().applyServerShare(res.share)
    setNewTagInput('')
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setBusy(false)
  }
}

async function removeTagFlow(
  noteId: string,
  tagToRemove: string,
  currentShare: ShareInfo | null,
  setBusy: (v: boolean) => void,
  toast: UiState['toast'],
): Promise<void> {
  const existingTags = currentShare?.shareTags ?? []
  const nextTags = existingTags.filter((t) => t !== tagToRemove)
  setBusy(true)
  try {
    const res = await api.share.create(noteId, { isEnabled: true, tags: nextTags })
    useShareStore.getState().applyServerShare(res.share)
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setBusy(false)
  }
}

async function revokeShareFlow(noteId: string, setBusy: (v: boolean) => void, toast: UiState['toast'], closeMenu: () => void): Promise<void> {
  const ok = await confirm({
    title: t('share.revoke_this_public_link'),
    description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
    confirmLabel: t('share.cancel_share'),
    tone: 'danger',
  })
  if (!ok) return
  setBusy(true)
  try {
    await api.share.remove(noteId)
    toast({ title: t('share.link_revoked'), tone: 'default' })
    void useShareStore.getState().loadShares()
    closeMenu()
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setBusy(false)
  }
}

type ShareFolderList = ReturnType<typeof useShareStore.getState>['folders']