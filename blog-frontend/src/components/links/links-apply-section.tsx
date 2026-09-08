import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Globe, Send, Sparkles } from 'lucide-react'
import { submitPublicLinkRequest } from '../../lib/api'
import { t, type BlogLocale } from '../../lib/i18n'
import { useCurrentLocale } from '../../lib/i18n/use-current-locale'

export interface LinksApplySectionProps {
  siteName: string
  siteUrl?: string
  siteDescription?: string
  siteAvatar?: string
  onToast: (msg: string) => void
}

export function LinksApplySection(props: LinksApplySectionProps) {
  const locale = useCurrentLocale()
  const [isFormOpen, setIsFormOpen] = useState(false)

  const handleCopyMyInfo = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const text = [
      `名称：${props.siteName}`,
      `网址：${props.siteUrl || origin}`,
      `描述：${props.siteDescription || 'Inkstone Powered Blog'}`,
      `头像：${props.siteAvatar || `${origin}/favicon.ico`}`,
    ].join('\n')
    if (typeof window !== 'undefined' && window.navigator?.clipboard) {
      void window.navigator.clipboard.writeText(text).then(() => {
        props.onToast(t('links.my_info_copied', {}, locale))
      })
    }
  }

  return (
    <div className='mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 shadow-2xs space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4'>
        <SiteInfoBlock
          siteName={props.siteName}
          siteDescription={props.siteDescription}
          siteAvatar={props.siteAvatar}
          onCopy={handleCopyMyInfo}
        />

        <button
          type='button'
          onClick={() => setIsFormOpen(!isFormOpen)}
          className='inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer'
        >
          <Sparkles className='size-3.5' />
          <span>{t('links.toggle_apply_form', {}, locale)}</span>
          {isFormOpen ? <ChevronUp className='size-3.5' /> : <ChevronDown className='size-3.5' />}
        </button>
      </div>

      {isFormOpen && <ApplyForm onToast={props.onToast} onClose={() => setIsFormOpen(false)} />}
    </div>
  )
}

function SiteInfoBlock({
  siteName,
  siteDescription,
  siteAvatar,
  onCopy,
}: {
  siteName: string
  siteDescription?: string
  siteAvatar?: string
  onCopy: () => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center gap-3.5 min-w-0'>
      {siteAvatar ? (
        <img
          src={siteAvatar}
          alt={siteName}
          className='size-12 rounded-xl object-cover border border-[var(--border-subtle)] bg-[var(--bg-sunken)] shrink-0'
        />
      ) : (
        <div className='size-12 rounded-xl bg-[var(--accent-softer)] text-[var(--accent)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-lg shrink-0'>
          {siteName.charAt(0)}
        </div>
      )}

      <div className='min-w-0 space-y-0.5'>
        <div className='flex items-center gap-2'>
          <h3 className='font-bold text-sm text-[var(--text-primary)] truncate'>{siteName}</h3>
          <button
            type='button'
            onClick={onCopy}
            className='inline-flex items-center gap-1 rounded-md bg-[var(--bg-sunken)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer border border-[var(--border-subtle)]'
            title={t('links.copy_my_info', {}, locale)}
          >
            <Copy className='size-3' />
            <span>{t('links.copy_my_info', {}, locale)}</span>
          </button>
        </div>
        <p className='text-xs text-[var(--text-tertiary)] truncate max-w-sm sm:max-w-md'>
          {siteDescription || t('links.apply_subtitle', {}, locale)}
        </p>
      </div>
    </div>
  )
}

function ApplyForm({ onToast, onClose }: { onToast: (msg: string) => void; onClose: () => void }) {
  const locale = useCurrentLocale()
  const form = useApplyForm(onToast, onClose, locale)

  return (
    <form onSubmit={form.handleSubmit} className='space-y-3 pt-2'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <FormInput label={t('links.form_name', {}, locale)} required value={form.name} onChange={form.setName} placeholder='我的博客' />
        <FormInput label={t('links.form_url', {}, locale)} required type='url' value={form.url} onChange={form.setUrl} placeholder='https://example.com' />
        <FormInput label={t('links.form_desc', {}, locale)} value={form.description} onChange={form.setDescription} placeholder='记录技术与生活的随笔' />
        <AvatarInput value={form.avatar} url={form.url} onChange={form.setAvatar} />
      </div>

      <FormInput label={t('links.form_email', {}, locale)} type='email' value={form.email} onChange={form.setEmail} placeholder='author@example.com' />

      {form.error && <p className='text-xs text-[var(--danger)] font-medium'>{form.error}</p>}
      {form.success && <p className='text-xs text-[var(--success)] font-medium'>{t('links.form_success', {}, locale)}</p>}

      <div className='flex justify-end gap-2 pt-2'>
        <button
          type='button'
          onClick={onClose}
          className='px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
        >
          {t('calendar.close', {}, locale)}
        </button>
        <button
          type='submit'
          disabled={form.submitting || !form.name.trim() || !form.url.trim()}
          className='inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
        >
          <Send className='size-3.5' />
          <span>{form.submitting ? t('links.form_submitting', {}, locale) : t('links.form_submit', {}, locale)}</span>
        </button>
      </div>
    </form>
  )
}

function useApplyForm(onToast: (msg: string) => void, onClose: () => void, locale: BlogLocale) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await submitPublicLinkRequest({
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        avatar: avatar.trim() || undefined,
        email: email.trim() || undefined,
      })
      setSuccess(true)
      onToast(t('links.form_success', {}, locale))
      setTimeout(onClose, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return {
    name, setName, url, setUrl, description, setDescription,
    avatar, setAvatar, email, setEmail, submitting, error, success,
    handleSubmit,
  }
}

function FormInput({
  label, value, onChange, placeholder, required, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <label className='block space-y-1'>
      <span className='block text-xs font-medium text-[var(--text-secondary)]'>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-hidden transition-colors'
      />
    </label>
  )
}

function AvatarInput({ value, url, onChange }: { value: string; url: string; onChange: (v: string) => void }) {
  const locale = useCurrentLocale()
  const handleFetchFavicon = () => {
    if (!url.trim()) return
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
      onChange(`https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`)
    } catch {
      onChange(`https://www.google.com/s2/favicons?domain=${url.trim()}&sz=128`)
    }
  }

  return (
    <label className='block space-y-1'>
      <span className='block text-xs font-medium text-[var(--text-secondary)]'>{t('links.form_avatar', {}, locale)}</span>
      <div className='flex gap-2'>
        <input
          type='url'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='https://...'
          className='h-9 min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-hidden transition-colors'
        />
        <button
          type='button'
          onClick={handleFetchFavicon}
          disabled={!url.trim()}
          className='inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors cursor-pointer shrink-0'
        >
          <Globe className='size-3' />
          <span>{t('links.form_fetch_favicon', {}, locale)}</span>
        </button>
      </div>
    </label>
  )
}
