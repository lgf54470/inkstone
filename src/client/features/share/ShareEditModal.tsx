import { useEffect, useState } from 'react'
import { Check, Dices, Globe, ShieldAlert, Trash2 } from 'lucide-react'
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

export function ShareEditModal({
  open,
  onClose,
  share,
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

  const [useCustomSlug, setUseCustomSlug] = useState(false)
  const [customSlug, setCustomSlug] = useState('')
  const [slugChecking, setSlugChecking] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState(share?.expiresAt ? KEEP_CURRENT_EXPIRY : '0')
  const [isEnabled, setIsEnabled] = useState(share ? share.isEnabled : true)
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)

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
      })
      toast({
        title: share ? t('share.sharing_settings_updated') : t('share.public_link_created'),
        tone: 'success',
      })
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
      onSaved?.()
      onClose()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setRevoking(false)
    }
  }

  return (
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
      width={480}
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
            <Button size="sm" variant="primary" loading={saving} disabled={revoking} onClick={() => void handleSave()}>
              {share ? t('share.update_settings') : t('share.publish')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-2">
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
  )
}
