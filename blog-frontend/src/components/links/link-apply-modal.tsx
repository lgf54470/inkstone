import { useState } from 'react'
import { Check, Copy, Loader2, Sparkles, X } from 'lucide-react'
import { submitPublicLinkRequest } from '../../lib/api'
import { t, useCurrentLocale } from '../../lib/i18n'

export interface LinkApplyModalProps {
  isOpen: boolean
  onClose: () => void
  siteName: string
  siteUrl: string
  siteDescription: string
  siteAvatar: string
  onToast: (message: string) => void
}

export function LinkApplyModal(props: LinkApplyModalProps) {
  const formState = useApplyModalForm(props)

  if (!props.isOpen) return null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-200'>
      <div
        className='relative w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader onClose={props.onClose} />
        <SiteInfoBanner
          name={props.siteName}
          url={props.siteUrl}
          desc={props.siteDescription}
          avatar={props.siteAvatar}
          copied={formState.copied}
          onCopy={formState.handleCopySiteInfo}
        />
        <ApplyForm
          form={formState.form}
          onChange={formState.setForm}
          onFetchFavicon={formState.handleFetchFavicon}
          onSubmit={formState.handleSubmit}
          onCancel={props.onClose}
          isSubmitting={formState.isSubmitting}
        />
      </div>
    </div>
  )
}

function useApplyModalForm(props: LinkApplyModalProps) {
  const locale = useCurrentLocale()
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', desc: '', avatar: '', email: '' })

  const handleCopySiteInfo = () => {
    navigator.clipboard
      .writeText(formatSiteInfo(props, locale))
      .then(() => {
        setCopied(true)
        props.onToast(t('links.my_info_copied', {}, locale))
        setTimeout(() => setCopied(false), 2000)
      })
      .catch((err) => {
        void err
      })
  }

  const handleFetchFavicon = () => {
    if (!form.url.trim()) return
    setForm((prev) => ({ ...prev, avatar: computeFaviconUrl(form.url) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) return
    setIsSubmitting(true)
    try {
      await submitPublicLinkRequest({
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.desc.trim() || undefined,
        avatar: form.avatar.trim() || undefined,
        email: form.email.trim() || undefined,
      })
      props.onToast(t('links.form_success', {}, locale))
      setForm({ name: '', url: '', desc: '', avatar: '', email: '' })
      props.onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submit failed'
      props.onToast(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return { copied, isSubmitting, form, setForm, handleCopySiteInfo, handleFetchFavicon, handleSubmit }
}

function ModalHeader({ onClose }: { onClose: () => void }) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]'>
      <div className='space-y-0.5'>
        <h3 className='text-base font-bold text-[var(--text-primary)]'>
          {t('links.apply_modal_title', {}, locale)}
        </h3>
        <p className='text-xs text-[var(--text-tertiary)]'>
          {t('links.apply_modal_subtitle', {}, locale)}
        </p>
      </div>
      <button
        type='button'
        onClick={onClose}
        className='p-1 rounded-lg text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
      >
        <X className='size-4' />
      </button>
    </div>
  )
}

function SiteInfoBanner({
  name,
  url,
  desc,
  avatar,
  copied,
  onCopy,
}: {
  name: string
  url: string
  desc: string
  avatar: string
  copied: boolean
  onCopy: () => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-2'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-semibold text-[var(--text-secondary)]'>
          {t('links.my_info_title', {}, locale)}
        </span>
        <button
          type='button'
          onClick={onCopy}
          className='inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer'
        >
          {copied ? <Check className='size-3.5 text-emerald-500' /> : <Copy className='size-3.5' />}
          <span>{copied ? t('interactive.copied', {}, locale) : t('links.copy_my_info', {}, locale)}</span>
        </button>
      </div>
      <div className='flex items-center gap-3'>
        {avatar ? (
          <img src={avatar} alt={name} className='size-9 rounded-lg object-cover bg-[var(--bg-sunken)] shrink-0' />
        ) : (
          <div className='size-9 rounded-lg bg-[var(--accent-softer)] text-[var(--accent)] font-bold flex items-center justify-center text-xs shrink-0'>
            {name.charAt(0)}
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-bold text-[var(--text-primary)] truncate'>{name}</p>
          <p className='text-xs text-[var(--text-tertiary)] truncate'>{desc}</p>
          <p className='text-xs text-[var(--text-quaternary)] truncate'>{url}</p>
        </div>
      </div>
    </div>
  )
}

function ApplyForm({
  form,
  onChange,
  onFetchFavicon,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  form: { name: string; url: string; desc: string; avatar: string; email: string }
  onChange: React.Dispatch<React.SetStateAction<{ name: string; url: string; desc: string; avatar: string; email: string }>>
  onFetchFavicon: () => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const locale = useCurrentLocale()
  return (
    <form onSubmit={onSubmit} className='space-y-3 pt-1'>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
        <FormField
          label={t('links.form_name', {}, locale)}
          value={form.name}
          placeholder='My Blog'
          required
          onChange={(v) => onChange((p) => ({ ...p, name: v }))}
        />
        <FormField
          label={t('links.form_url', {}, locale)}
          value={form.url}
          placeholder='https://example.com'
          required
          onChange={(v) => onChange((p) => ({ ...p, url: v }))}
        />
      </div>
      <FormAvatarInput
        value={form.avatar}
        url={form.url}
        onChange={(v) => onChange((p) => ({ ...p, avatar: v }))}
        onFetchFavicon={onFetchFavicon}
      />
      <FormField
        label={t('links.form_desc', {}, locale)}
        value={form.desc}
        placeholder='Tech, thoughts, and lifestyle'
        onChange={(v) => onChange((p) => ({ ...p, desc: v }))}
      />
      <FormField
        label={t('links.form_email', {}, locale)}
        value={form.email}
        placeholder='contact@example.com'
        onChange={(v) => onChange((p) => ({ ...p, email: v }))}
      />
      <FormSubmitButtons
        isSubmitting={isSubmitting}
        canSubmit={Boolean(form.name.trim() && form.url.trim())}
        onCancel={onCancel}
      />
    </form>
  )
}

function FormAvatarInput({
  value,
  url,
  onChange,
  onFetchFavicon,
}: {
  value: string
  url: string
  onChange: (v: string) => void
  onFetchFavicon: () => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='space-y-1'>
      <div className='flex items-center justify-between'>
        <label className='text-xs font-medium text-[var(--text-secondary)]'>
          {t('links.form_avatar', {}, locale)}
        </label>
        <button
          type='button'
          onClick={onFetchFavicon}
          disabled={!url.trim()}
          className='inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
        >
          <Sparkles className='size-3' />
          <span>{t('links.form_fetch_favicon', {}, locale)}</span>
        </button>
      </div>
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='https://example.com/avatar.png'
        className='w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-hidden'
      />
    </div>
  )
}

function FormSubmitButtons({
  isSubmitting,
  canSubmit,
  onCancel,
}: {
  isSubmitting: boolean
  canSubmit: boolean
  onCancel: () => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]'>
      <button
        type='button'
        onClick={onCancel}
        className='px-4 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
      >
        {t('appearance.close', {}, locale)}
      </button>
      <button
        type='submit'
        disabled={isSubmitting || !canSubmit}
        className='inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
      >
        {isSubmitting ? <Loader2 className='size-3.5 animate-spin' /> : null}
        <span>{isSubmitting ? t('links.form_submitting', {}, locale) : t('links.form_submit', {}, locale)}</span>
      </button>
    </div>
  )
}

function FormField({
  label,
  value,
  placeholder,
  required,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  required?: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className='space-y-1'>
      <label className='block text-xs font-medium text-[var(--text-secondary)]'>
        {label}
      </label>
      <input
        type='text'
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-hidden'
      />
    </div>
  )
}

function formatSiteInfo(props: LinkApplyModalProps, locale: string) {
  return `${t('links.form_name', {}, locale).replace(' *', '')}: ${props.siteName}
${t('links.form_url', {}, locale).replace(' *', '')}: ${props.siteUrl}
${t('links.form_desc', {}, locale)}: ${props.siteDescription}
${t('links.form_avatar', {}, locale)}: ${props.siteAvatar}`
}

function computeFaviconUrl(rawUrl: string) {
  const targetUrl = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`
  return `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=${encodeURIComponent(targetUrl)}`
}

