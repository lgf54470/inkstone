import { useEffect, useState } from 'react'
import {
  BarChart3,
  Check,
  Copy,
  Dices,
  ExternalLink,
  FolderClosed,
  Globe,
  Hash,
  LayoutGrid,
  Plus,
  QrCode,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { ShareInfo } from '@shared/types'
import { Modal, confirm } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Input, Segmented, Switch } from '../../components/form'
import { useUi } from '../../store/ui'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { KEEP_CURRENT_EXPIRY, expiresInForSelection, needsNewSharePasscode } from './share-form'
import { generateRandomSlug } from './share-helpers'
import { ShareNoteAnalyticsModal } from './ShareNoteAnalyticsModal'
import { ShareQrModal } from './ShareQrModal'
import { useShareStore } from './share-store'

export function ShareEditModal({
  open,
  onClose,
  share: initialShare,
  noteId,
  noteTitle,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  share?: ShareInfo | null
  noteId: string
  noteTitle: string
  onSaved?: () => void
}) {
  const toast = useUi((s) => s.toast)
  const openPanel = useUi((s) => s.openPanel)

  const shareFolders = useShareStore((s) => s.folders)
  const loadFolders = useShareStore((s) => s.loadFolders)
  const loadTags = useShareStore((s) => s.loadTags)

  const [share, setShare] = useState<ShareInfo | null>(initialShare ?? null)
  const [loadingShare, setLoadingShare] = useState(false)

  const [useCustomSlug, setUseCustomSlug] = useState(false)
  const [customSlug, setCustomSlug] = useState('')
  const [slugChecking, setSlugChecking] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
  const [isEnabled, setIsEnabled] = useState(share ? share.isEnabled : true)
  const [shareFolderId, setShareFolderId] = useState<string | null>(null)
  const [shareTags, setShareTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')

  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)

  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void loadFolders()
      void loadTags()
      if (initialShare !== undefined) {
        setShare(initialShare)
      } else {
        setLoadingShare(true)
        void api.share.getNoteShare(noteId)
          .then((res) => {
            setShare(res.share)
          })
          .catch(() => {})
          .finally(() => setLoadingShare(false))
      }
    }
  }, [open, initialShare, noteId, loadFolders, loadTags])

  useEffect(() => {
    if (open) {
      const isCustom = Boolean(share?.slug && !/^[0-9a-hjkmnp-tv-z]{20}$/.test(share.slug))
      setUseCustomSlug(isCustom)
      setCustomSlug(isCustom ? share?.slug || '' : '')
      setSlugAvailable(null)
      setSlugError(null)
      setUsePassword(Boolean(share?.hasPassword))
      setPassword('')
      setExpiry(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
      setIsEnabled(share ? share.isEnabled : true)
      setShareFolderId(share?.shareFolderId ?? share?.folderId ?? null)
      setShareTags(share?.shareTags ?? share?.tags ?? [])
      setNewTagInput('')
    }
  }, [open, share])

  useEffect(() => {
    if (!useCustomSlug || !customSlug.trim()) {
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
      setSlugChecking(true)
      try {
        const res = await api.share.checkSlug(trimmed, noteId)
        setSlugAvailable(res.available)
        setSlugError(res.available ? null : t('share.custom_slug_taken'))
      } catch {
        setSlugAvailable(null)
      } finally {
        setSlugChecking(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [useCustomSlug, customSlug, noteId, share?.slug])

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
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
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
    if (usePassword && password.length > 0 && password.length < 4) {
      toast({ title: t('share.passcode_too_short'), tone: 'danger' })
      return
    }
    if (needsNewSharePasscode(usePassword, Boolean(share?.hasPassword), password)) {
      toast({ title: t('share.enter_a_passcode'), tone: 'danger' })
      return
    }
    if (useCustomSlug && slugAvailable === false) {
      toast({ title: slugError || t('share.custom_slug_invalid'), tone: 'danger' })
      return
    }

    setSaving(true)
    try {
      await api.share.create(noteId, {
        password: usePassword ? password || undefined : null,
        expiresIn: expiresInForSelection(expiry),
        customSlug: useCustomSlug && customSlug.trim() ? customSlug.trim() : undefined,
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
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    } finally {
      setSaving(false)
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

    setRevoking(true)
    try {
      await api.share.remove(noteId)
      toast({ title: t('share.link_revoked'), tone: 'default' })
      void useShareStore.getState().loadShares()
      onSaved?.()
      onClose()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setRevoking(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--accent)]" />
            <span>{share ? t('share.edit_share_settings') : t('share.create_new_share')}</span>
          </div>
        }
        description={noteTitle}
        width={500}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {share ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                icon={<Trash2 size={13} />}
                loading={revoking}
                disabled={saving}
                onClick={() => void handleRevoke()}
              >
                {t('share.revoke_link')}
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={onClose} disabled={saving || revoking}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" variant="primary" loading={saving} disabled={revoking || loadingShare} onClick={() => void handleSave()}>
                {share ? t('share.update_settings') : t('share.publish')}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3.5 py-1">
          {/* Public link display and quick actions */}
          {share?.url && (
            <div className="rounded-[var(--r-md)] border border-[var(--accent-subtle)] bg-[var(--accent-subtle)]/20 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={share.url}
                  className="flex-1 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[11.5px] text-[var(--text-primary)] select-all outline-hidden"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
                  onClick={() => void handleCopyLink()}
                >
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
                <a
                  href={share.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center justify-center rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                  title={t('share.open_link')}
                >
                  <ExternalLink size={13} />
                </a>
              </div>

              {/* Core action triggers: analytics, qr code, share hub */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-subtle)]/60">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<BarChart3 size={13} className="text-[var(--accent)]" />}
                  onClick={() => setAnalyticsOpen(true)}
                >
                  {t('share.note_analytics_title')}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<QrCode size={13} />}
                  onClick={() => setQrOpen(true)}
                >
                  {t('share.qr_code_title')}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  icon={<LayoutGrid size={13} />}
                  onClick={() => {
                    onClose()
                    openPanel('share-hub')
                  }}
                  className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs"
                >
                  {t('share.manage_shares')}
                </Button>
              </div>
            </div>
          )}

          {/* Share status switch */}
          <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div>
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                {t('share.share_status')}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {isEnabled ? t('share.status_active_desc') : t('share.status_paused_desc')}
              </div>
            </div>
            <Switch checked={isEnabled} onChange={setIsEnabled} />
          </div>

          {/* Folder selection */}
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5 pb-1.5">
              <FolderClosed size={14} className="text-[var(--text-tertiary)]" />
              <span>{t('share.folders_isolation')}</span>
            </div>
            <select
              value={shareFolderId ?? ''}
              onChange={(e) => setShareFolderId(e.target.value ? e.target.value : null)}
              className="w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">{t('navigation.unfiled')}</option>
              {shareFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tag selection */}
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2">
            <div className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <Hash size={14} className="text-[var(--text-tertiary)]" />
              <span>{t('share.tags_isolation')}</span>
            </div>

            {/* Tag chips */}
            <div className="flex flex-wrap items-center gap-1.5 min-h-6">
              {shareTags.length === 0 ? (
                <span className="text-[11px] text-[var(--text-quaternary)]">{t('share.no_tags')}</span>
              ) : (
                shareTags.map((tagName) => (
                  <span
                    key={tagName}
                    className="inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-hover)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                  >
                    <Hash size={10} className="text-[var(--accent)]" />
                    <span>{tagName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tagName)}
                      className="text-[var(--text-quaternary)] hover:text-[var(--danger)]"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add tag input */}
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder={t('tags.new_placeholder')}
                className="flex-1 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2.5 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={handleAddTag}>
                {t('tags.create')}
              </Button>
            </div>
          </div>

          {/* Custom slug */}
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center justify-between pb-2">
              <div>
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  {t('share.custom_slug')}
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t('share.custom_slug_hint')}
                </div>
              </div>
              <Switch checked={useCustomSlug} onChange={setUseCustomSlug} />
            </div>

            {useCustomSlug && (
              <div className="pt-2">
                <div className="flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1.5 focus-within:border-[var(--accent)]">
                  <span className="text-[12px] font-mono text-[var(--text-quaternary)]">{'/s/'}</span>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    placeholder={t('share.custom_slug_placeholder')}
                    className="flex-1 bg-transparent text-[12px] font-mono text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomSlug(generateRandomSlug(6))}
                    className="flex items-center gap-1 rounded bg-[var(--bg-card)] px-2 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
                    title={t('share.generate_random_slug')}
                  >
                    <Dices size={12} />
                    <span>{t('share.random_slug_btn')}</span>
                  </button>
                  {slugChecking && <span className="text-[10px] text-[var(--text-quaternary)]">{t('common.checking')}</span>}
                  {!slugChecking && slugAvailable === true && (
                    <Check size={14} className="text-[var(--success)]" />
                  )}
                  {!slugChecking && slugAvailable === false && (
                    <ShieldAlert size={14} className="text-[var(--danger)]" />
                  )}
                </div>
                {slugError && <p className="pt-1 text-[11px] text-[var(--danger)]">{slugError}</p>}
              </div>
            )}
          </div>

          {/* Access passcode */}
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="flex items-center justify-between pb-2">
              <div>
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  {t('share.access_password')}
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t('share.password_hint')}
                </div>
              </div>
              <Switch checked={usePassword} onChange={setUsePassword} />
            </div>

            {usePassword && (
              <div className="pt-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    share?.hasPassword
                      ? t('share.leave_blank_to_keep_passcode')
                      : t('share.enter_a_passcode')
                  }
                  maxLength={LIMITS.passwordMaxLength}
                />
              </div>
            )}
          </div>

          {/* Expiration */}
          <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="text-[13px] font-medium text-[var(--text-primary)] pb-1.5">
              {t('share.expiration_title')}
            </div>
            <Segmented
              options={
                share?.expiresAt
                  ? [
                      { value: KEEP_CURRENT_EXPIRY, label: t('share.keep_current') },
                      ...EXPIRY_OPTIONS,
                    ]
                  : EXPIRY_OPTIONS
              }
              value={expiry}
              onChange={setExpiry}
            />
          </div>
        </div>
      </Modal>

      {/* Note analytics modal */}
      {analyticsOpen && share && (
        <ShareNoteAnalyticsModal
          open={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          noteId={noteId}
        />
      )}

      {/* QR code modal */}
      {qrOpen && share && (
        <ShareQrModal
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          url={share.url}
          title={noteTitle}
          slug={share.slug}
        />
      )}
    </>
  )
}
