import { useEffect, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
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
  const loadFolders = useShareStore((s) => s.loadFolders)
  const loadTags = useShareStore((s) => s.loadTags)

  const [share, setShare] = useState<ShareInfo | null>(initialShare ?? null)
  const [isLoadingShare, setIsLoadingShare] = useState(false)

  const [shouldUseCustomSlug, setShouldUseCustomSlug] = useState(false)
  const [customSlug, setCustomSlug] = useState('')
  const [isSlugChecking, setIsSlugChecking] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [shouldUsePassword, setShouldUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
  const [isEnabled, setIsEnabled] = useState(share ? share.isEnabled : true)
  const [shareFolderId, setShareFolderId] = useState<string | null>(null)
  const [shareTags, setShareTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const [isQrOpen, setIsQrOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void loadFolders()
      void loadTags()
      if (initialShare !== undefined) {
        setShare(initialShare)
      } else {
        setIsLoadingShare(true)
        void (async () => {
          const res = await api.share.getNoteShare(noteId).catch(() => null)
          if (res) setShare(res.share)
          setIsLoadingShare(false)
        })()
      }
    }
  }, [open, initialShare, noteId, loadFolders, loadTags])

  useEffect(() => {
    if (open) {
      const isCustom = Boolean(share?.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug))
      setShouldUseCustomSlug(isCustom)
      setCustomSlug(isCustom ? share?.slug || '' : '')
      setSlugAvailable(null)
      setSlugError(null)
      setShouldUsePassword(Boolean(share?.hasPassword))
      setPassword('')
      setExpiry(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
      setIsEnabled(share ? share.isEnabled : true)
      setShareFolderId(share?.shareFolderId ?? share?.folderId ?? null)
      setShareTags(share?.shareTags ?? share?.tags ?? [])
      setNewTagInput('')
    }
  }, [open, share])

  useEffect(() => {
    if (!shouldUseCustomSlug || !customSlug.trim()) {
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

    if (share?.slug === trimmed) {
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
  }, [shouldUseCustomSlug, customSlug, noteId, share?.slug])

  const EXPIRY_OPTIONS = [
    { value: '0', label: t('share.never_expires') },
    { value: String(24 * 3600000), label: t('share.1_day') },
    { value: String(7 * 24 * 3600000), label: t('share.7_days') },
    { value: String(30 * 24 * 3600000), label: t('share.30_days') },
  ]

  const handleCopyLink = async () => {
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

  const handleAddTag = () => {
    const trimmed = newTagInput.trim()
    if (trimmed && !shareTags.includes(trimmed)) {
      setShareTags([...shareTags, trimmed])
      setNewTagInput('')
    }
  }

  const handleRemoveTag = (tagName: string) => {
    setShareTags(shareTags.filter((t) => t !== tagName))
  }

  const handleSave = async () => {
    if (shouldUsePassword && password.length > 0 && password.length < 4) {
      toast({ title: t('share.passcode_too_short'), tone: 'danger' })
      return
    }
    if (needsNewSharePasscode(shouldUsePassword, Boolean(share?.hasPassword), password)) {
      toast({ title: t('share.enter_a_passcode'), tone: 'danger' })
      return
    }
    if (shouldUseCustomSlug && slugAvailable === false) {
      toast({ title: slugError || t('share.custom_slug_invalid'), tone: 'danger' })
      return
    }

    setIsSaving(true)
    try {
      await api.share.create(noteId, {
        password: shouldUsePassword ? password || undefined : null,
        expiresIn: expiresInForSelection(expiry),
        customSlug: shouldUseCustomSlug && customSlug.trim() ? customSlug.trim() : undefined,
        isEnabled,
        folderId: shareFolderId,
        tags: shareTags,
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

  const handleRevoke = async () => {
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


  return {
openPanel,
shareFolders,
share,
isLoadingShare,
shouldUseCustomSlug,
setShouldUseCustomSlug,
customSlug,
setCustomSlug,
isSlugChecking,
slugAvailable,
slugError,
shouldUsePassword,
setShouldUsePassword,
password,
setPassword,
expiry,
setExpiry,
isEnabled,
setIsEnabled,
shareFolderId,
setShareFolderId,
shareTags,
newTagInput,
setNewTagInput,
isSaving,
isRevoking,
isCopied,
isAnalyticsOpen,
setIsAnalyticsOpen,
isQrOpen,
setIsQrOpen,
EXPIRY_OPTIONS,
handleCopyLink,
handleAddTag,
handleRemoveTag,
handleSave,
handleRevoke,
  };
}
