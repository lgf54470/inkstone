import { useEffect, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import type { UiState } from '../../../store/ui'
import { KEEP_CURRENT_EXPIRY, expiresInForSelection, needsNewSharePasscode } from '../share-form'
import { useShareStore } from '../share-store'

export function useShareEditModal({
  open,
  onClose,
  share: initialShare,
  noteId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  share?: ShareInfo | null
  noteId: string
  onSaved?: () => void
}) {
  const toast = useUi((s) => s.toast)
  const openPanel = useUi((s) => s.openPanel)
  const shareFolders = useShareStore((s) => s.folders)

  const { share, isLoadingShare } = useShareEditShare(open, initialShare, noteId)
  const fields = useShareEditFields(open, share)
  const slug = useCustomSlugCheck(open, fields.shouldUseCustomSlug, fields.customSlug, share?.slug ?? null, noteId)

  const [isSaving, setIsSaving] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)

  const handleCopyLink = () => copyEditLinkFlow(share, setIsCopied, toast)
  const handleAddTag = () => addEditTagFlow(fields.newTagInput, fields.shareTags, fields.setShareTags, fields.setNewTagInput)
  const handleRemoveTag = (tagName: string) => fields.setShareTags(fields.shareTags.filter((tag) => tag !== tagName))
  const handleSave = () => saveEditShareFlow({
    share, noteId, fields, slug, setIsSaving, toast, onSaved, onClose,
  })
  const handleRevoke = () => revokeEditShareFlow({ noteId, setIsRevoking, toast, onSaved, onClose })

  return {
    openPanel,
    shareFolders,
    share,
    isLoadingShare,
    ...fields,
    ...slug,
    isSaving,
    isRevoking,
    isCopied,
    isAnalyticsOpen,
    setIsAnalyticsOpen,
    isQrOpen,
    setIsQrOpen,
    EXPIRY_OPTIONS: buildExpiryOptions(),
    handleCopyLink,
    handleAddTag,
    handleRemoveTag,
    handleSave,
    handleRevoke,
  }
}

function useShareEditShare(open: boolean, initialShare: ShareInfo | null | undefined, noteId: string) {
  const loadFolders = useShareStore((s) => s.loadFolders)
  const loadTags = useShareStore((s) => s.loadTags)
  const [share, setShare] = useState<ShareInfo | null>(initialShare ?? null)
  const [isLoadingShare, setIsLoadingShare] = useState(false)
  useEffect(() => {
    if (!open) return
    void loadFolders()
    void loadTags()
    if (initialShare !== undefined) {
      setShare(initialShare)
    } else {
      setIsLoadingShare(true)
      void loadNoteShare(noteId, setShare, setIsLoadingShare)
    }
  }, [open, initialShare, noteId, loadFolders, loadTags])
  return { share, isLoadingShare }
}

function useShareEditFields(open: boolean, share: ShareInfo | null) {
  const [shouldUseCustomSlug, setShouldUseCustomSlug] = useState(false)
  const [customSlug, setCustomSlug] = useState('')
  const [shouldUsePassword, setShouldUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState('0')
  const [isEnabled, setIsEnabled] = useState(true)
  const [shareFolderId, setShareFolderId] = useState<string | null>(null)
  const [shareTags, setShareTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  useEffect(() => {
    if (!open) return
    syncFieldsFromShare(share, {
      setShouldUseCustomSlug, setCustomSlug, setShouldUsePassword, setPassword,
      setExpiry, setIsEnabled, setShareFolderId, setShareTags, setNewTagInput,
    })
  }, [open, share])
  return {
    shouldUseCustomSlug, setShouldUseCustomSlug, customSlug, setCustomSlug,
    shouldUsePassword, setShouldUsePassword, password, setPassword,
    expiry, setExpiry, isEnabled, setIsEnabled,
    shareFolderId, setShareFolderId, shareTags, setShareTags, newTagInput, setNewTagInput,
  }
}

function useCustomSlugCheck(open: boolean, enabled: boolean, customSlug: string, currentSlug: string | null, noteId: string) {
  const [isSlugChecking, setIsSlugChecking] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    if (!enabled || !customSlug.trim()) {
      setSlugAvailable(null)
      setSlugError(null)
      return
    }
    const trimmed = customSlug.trim()
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) {
      setSlugAvailable(false)
      setSlugError(t('share.custom_slug_invalid'))
      return
    }
    if (currentSlug === trimmed) {
      setSlugAvailable(true)
      setSlugError(null)
      return
    }
    const timer = setTimeout(async () => {
      setIsSlugChecking(true)
      try {
        const res = await api.share.checkSlug(trimmed, noteId)
        setSlugAvailable(res.available)
        setSlugError(res.available ? null : t('share.custom_slug_taken'))
      } catch {
        setSlugAvailable(null)
      } finally {
        setIsSlugChecking(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [open, enabled, customSlug, noteId, currentSlug])
  return { isSlugChecking, slugAvailable, slugError }
}

type SyncSetters = {
  setShouldUseCustomSlug: (value: boolean) => void
  setCustomSlug: (value: string) => void
  setShouldUsePassword: (value: boolean) => void
  setPassword: (value: string) => void
  setExpiry: (value: string) => void
  setIsEnabled: (value: boolean) => void
  setShareFolderId: (value: string | null) => void
  setShareTags: (value: string[]) => void
  setNewTagInput: (value: string) => void
}

function syncFieldsFromShare(share: ShareInfo | null, s: SyncSetters): void {
  const isCustom = Boolean(share?.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug))
  s.setShouldUseCustomSlug(isCustom)
  s.setCustomSlug(isCustom ? share?.slug || '' : '')
  s.setShouldUsePassword(Boolean(share?.hasPassword))
  s.setPassword('')
  s.setExpiry(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
  s.setIsEnabled(share ? share.isEnabled : true)
  s.setShareFolderId(share?.shareFolderId ?? share?.folderId ?? null)
  s.setShareTags(share?.shareTags ?? share?.tags ?? [])
  s.setNewTagInput('')
}

async function loadNoteShare(
  noteId: string,
  setShare: (share: ShareInfo | null) => void,
  setIsLoadingShare: (value: boolean) => void,
): Promise<void> {
  const res = await api.share.getNoteShare(noteId).catch(() => null)
  if (res) setShare(res.share)
  setIsLoadingShare(false)
}

function buildExpiryOptions() {
  return [
    { value: '0', label: t('share.never_expires') },
    { value: String(24 * 3600000), label: t('share.1_day') },
    { value: String(7 * 24 * 3600000), label: t('share.7_days') },
    { value: String(30 * 24 * 3600000), label: t('share.30_days') },
  ]
}

async function copyEditLinkFlow(
  share: ShareInfo | null,
  setIsCopied: (value: boolean) => void,
  toast: UiState['toast'],
): Promise<void> {
  if (!share?.url) return
  try {
    await navigator.clipboard.writeText(share.url)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1500)
    toast({ title: t('common.copied'), tone: 'success' })
  } catch {
    toast({ title: t('preview.could_not_copy'), tone: 'danger' })
  }
}

function addEditTagFlow(
  newTagInput: string,
  shareTags: string[],
  setShareTags: (tags: string[]) => void,
  setNewTagInput: (value: string) => void,
): void {
  const trimmed = newTagInput.trim()
  if (trimmed && !shareTags.includes(trimmed)) {
    setShareTags([...shareTags, trimmed])
    setNewTagInput('')
  }
}

type SaveEditFlow = {
  share: ShareInfo | null
  noteId: string
  fields: ReturnType<typeof useShareEditFields>
  slug: ReturnType<typeof useCustomSlugCheck>
  setIsSaving: (value: boolean) => void
  toast: UiState['toast']
  onSaved?: () => void
  onClose: () => void
}

async function saveEditShareFlow({ share, noteId, fields, slug, setIsSaving, toast, onSaved, onClose }: SaveEditFlow): Promise<void> {
  if (fields.shouldUsePassword && fields.password.length > 0 && fields.password.length < 6) {
    toast({ title: t('share.passcode_too_short'), tone: 'danger' })
    return
  }
  if (needsNewSharePasscode(fields.shouldUsePassword, Boolean(share?.hasPassword), fields.password)) {
    toast({ title: t('share.enter_a_passcode'), tone: 'danger' })
    return
  }
  if (fields.shouldUseCustomSlug && slug.slugAvailable === false) {
    toast({ title: slug.slugError || t('share.custom_slug_invalid'), tone: 'danger' })
    return
  }
  setIsSaving(true)
  try {
    await api.share.create(noteId, {
      password: fields.shouldUsePassword ? fields.password || undefined : null,
      expiresIn: expiresInForSelection(fields.expiry),
      customSlug: fields.shouldUseCustomSlug && fields.customSlug.trim() ? fields.customSlug.trim() : undefined,
      isEnabled: fields.isEnabled,
      folderId: fields.shareFolderId,
      tags: fields.shareTags,
    })
    toast({
      title: share ? t('share.sharing_settings_updated') : t('share.public_link_created'),
      tone: 'success',
    })
    void useShareStore.getState().loadShares()
    onSaved?.()
    onClose()
  } catch (err) {
    toast({
      title: t('common.action_failed'),
      description: errorMessage(err),
      tone: 'danger',
    })
  } finally {
    setIsSaving(false)
  }
}

async function revokeEditShareFlow({ noteId, setIsRevoking, toast, onSaved, onClose }: {
  noteId: string
  setIsRevoking: (value: boolean) => void
  toast: UiState['toast']
  onSaved?: () => void
  onClose: () => void
}): Promise<void> {
  const ok = await confirm({
    title: t('share.revoke_this_public_link'),
    description: t('share.anyone_who_gets_the_link_will_immediately_lose_access'),
    confirmLabel: t('share.revoke_link'),
    tone: 'danger',
  })
  if (!ok) return
  setIsRevoking(true)
  try {
    await api.share.remove(noteId)
    toast({ title: t('share.link_revoked'), tone: 'default' })
    void useShareStore.getState().loadShares()
    onSaved?.()
    onClose()
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setIsRevoking(false)
  }
}
export type ShareEditModalBundle = ReturnType<typeof useShareEditModal>
