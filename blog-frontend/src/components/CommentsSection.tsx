import { useState, useEffect, type SyntheticEvent, type ChangeEvent } from 'react'
import {
  MessageSquare,
  Send,
  User,
  Mail,
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import type { BlogComment } from '../lib/types'
import { t, formatDate, DEFAULT_LOCALE, isSupportedLocale, type BlogLocale } from '../lib/i18n'

interface CommentsSectionProps {
  postId: string
  allowComments?: boolean
  initialLocale?: BlogLocale
}

type CommentFieldKey = 'name' | 'email' | 'url' | 'content'

interface CommentFields {
  name: string
  email: string
  url: string
  content: string
}

const EMPTY_FIELDS: CommentFields = { name: '', email: '', url: '', content: '' }

type SubmitResult = { kind: 'success'; comment?: BlogComment } | { kind: 'error'; message: string }

function useCurrentLocale(propLocale?: BlogLocale): BlogLocale {
  const [locale, setLocale] = useState<BlogLocale>(() => {
    if (propLocale) return propLocale
    if (typeof document !== 'undefined') {
      const docLang = document.documentElement.getAttribute('lang')
      if (isSupportedLocale(docLang)) return docLang
    }
    return DEFAULT_LOCALE
  })

  useEffect(() => {
    const handleLocaleChange = (e: Event) => {
      const custom = e as CustomEvent<BlogLocale>
      if (isSupportedLocale(custom.detail)) setLocale(custom.detail)
    }
    window.addEventListener('inkstone-locale-change', handleLocaleChange)
    return () => window.removeEventListener('inkstone-locale-change', handleLocaleChange)
  }, [])

  return propLocale || locale
}

async function submitCommentRequest(
  postId: string,
  fields: CommentFields,
  locale: BlogLocale
): Promise<SubmitResult> {
  const name = fields.name.trim()
  const email = fields.email.trim()
  const content = fields.content.trim()
  if (!name || !email || !content) {
    return { kind: 'error', message: t('comments.error_required', {}, locale) }
  }
  try {
    const res = await api.submitComment({
      postId,
      authorName: name,
      authorEmail: email,
      authorUrl: fields.url.trim() || undefined,
      content,
    })
    const approved = res.comment && res.comment.status === 'approved' ? res.comment : undefined
    return { kind: 'success', comment: approved }
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err)
    return { kind: 'error', message: errorText || t('comments.error_generic', {}, locale) }
  }
}

function useCommentFetch(postId: string, enabled: boolean) {
  const [comments, setComments] = useState<BlogComment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setComments([])
      setLoading(false)
      return
    }
    let ignore = false
    async function fetchComments() {
      setLoading(true)
      try {
        const list = await api.getComments(postId)
        if (!ignore) {
          setComments(list.filter((c) => c.status === 'approved'))
        }
      } catch (err) {
        console.error('Failed to load comments:', err)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    fetchComments()
    return () => {
      ignore = true
    }
  }, [postId, enabled])

  const appendComment = (comment?: BlogComment) => {
    if (comment) {
      setComments((prev) => [...prev, comment])
    }
  }

  return { comments, loading, appendComment }
}

function useCommentForm(
  postId: string,
  locale: BlogLocale,
  onPosted?: (comment?: BlogComment) => void
) {
  const [fields, setFields] = useState<CommentFields>(EMPTY_FIELDS)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const updateField = (key: CommentFieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const result = await submitCommentRequest(postId, fields, locale)
    if (result.kind === 'success') {
      const successText = result.comment
        ? t('comments.success_approved', {}, locale)
        : t('comments.success_moderated', {}, locale)
      setMessage({ type: 'success', text: successText })
      setFields((prev) => ({ ...prev, content: '' }))
      onPosted?.(result.comment)
    } else {
      setMessage({ type: 'error', text: result.message })
    }

    setSubmitting(false)
  }

  return { fields, submitting, message, updateField, handleSubmit }
}

export default function CommentsSection({
  postId,
  allowComments = true,
  initialLocale,
}: CommentsSectionProps) {
  const locale = useCurrentLocale(initialLocale)
  const { comments, loading, appendComment } = useCommentFetch(postId, allowComments)
  const form = useCommentForm(postId, locale, appendComment)

  if (!allowComments) {
    return <CommentsDisabled locale={locale} />
  }

  return (
    <section className='my-12 pt-8 border-t border-[var(--border-default)]' id='comments'>
      <CommentsHeader count={comments.length} locale={locale} />
      {form.message && <MessageBanner message={form.message} />}
      <CommentForm
        fields={form.fields}
        submitting={form.submitting}
        locale={locale}
        onFieldChange={form.updateField}
        onSubmit={form.handleSubmit}
      />
      <CommentList comments={comments} loading={loading} locale={locale} />
    </section>
  )
}

function CommentsDisabled({ locale }: { locale: BlogLocale }) {
  return (
    <div className='my-10 p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-center text-xs text-[var(--text-tertiary)]'>
      {t('comments.disabled', {}, locale)}
    </div>
  )
}

function CommentsHeader({ count, locale }: { count: number; locale: BlogLocale }) {
  return (
    <div className='flex items-center gap-2 mb-6'>
      <MessageSquare className='w-5 h-5 text-[var(--accent)]' />
      <h3 className='text-lg font-bold text-[var(--text-primary)]'>
        {t('comments.title', { count }, locale)}
      </h3>
    </div>
  )
}

function MessageBanner({ message }: { message: { type: 'success' | 'error'; text: string } }) {
  const isSuccess = message.type === 'success'
  return (
    <div
      className={`mb-6 p-4 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-[var(--dur-base)] ${
        isSuccess
          ? 'bg-[var(--accent-softer)] border-[var(--accent)] text-[var(--accent)]'
          : 'bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger)]'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className='w-4 h-4 shrink-0 mt-0.5' />
      ) : (
        <AlertCircle className='w-4 h-4 shrink-0 mt-0.5' />
      )}
      <span>{message.text}</span>
    </div>
  )
}

interface MetaFieldConfig {
  key: 'name' | 'email' | 'url'
  label: string
  type: string
  placeholder: string
  icon: LucideIcon
  required?: boolean
}

function getFieldConfigs(locale: BlogLocale): MetaFieldConfig[] {
  return [
    {
      key: 'name',
      label: t('comments.field_name', {}, locale),
      type: 'text',
      placeholder: t('comments.field_name_placeholder', {}, locale),
      icon: User,
      required: true,
    },
    {
      key: 'email',
      label: t('comments.field_email', {}, locale),
      type: 'email',
      placeholder: t('comments.field_email_placeholder', {}, locale),
      icon: Mail,
      required: true,
    },
    {
      key: 'url',
      label: t('comments.field_url', {}, locale),
      type: 'url',
      placeholder: t('comments.field_url_placeholder', {}, locale),
      icon: Globe,
    },
  ]
}

function CommentForm({
  fields,
  submitting,
  locale,
  onFieldChange,
  onSubmit,
}: {
  fields: CommentFields
  submitting: boolean
  locale: BlogLocale
  onFieldChange: (key: CommentFieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void
}) {
  const configs = getFieldConfigs(locale)
  return (
    <form
      onSubmit={onSubmit}
      className='mb-8 p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] space-y-4'
    >
      <h4 className='text-sm font-semibold text-[var(--text-primary)]'>
        {t('comments.form_heading', {}, locale)}
      </h4>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        {configs.map((cfg) => (
          <CommentInput
            key={cfg.key}
            config={cfg}
            value={fields[cfg.key]}
            onChange={onFieldChange(cfg.key)}
          />
        ))}
      </div>
      <CommentContentField value={fields.content} locale={locale} onChange={onFieldChange('content')} />
      <CommentFormActions submitting={submitting} locale={locale} />
    </form>
  )
}

function CommentInput({
  config,
  value,
  onChange,
}: {
  config: MetaFieldConfig
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}) {
  const Icon = config.icon
  return (
    <div>
      <label className='block text-[11px] font-medium text-[var(--text-secondary)] mb-1'>
        {config.label}
        {config.required && <span className='text-[var(--accent)]'> *</span>}
      </label>
      <div className='relative flex items-center'>
        <Icon className='w-3.5 h-3.5 absolute left-2.5 text-[var(--text-quaternary)]' />
        <input
          type={config.type}
          required={config.required}
          value={value}
          onChange={onChange}
          placeholder={config.placeholder}
          className='w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
        />
      </div>
    </div>
  )
}

function CommentContentField({
  value,
  locale,
  onChange,
}: {
  value: string
  locale: BlogLocale
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <div>
      <label className='block text-[11px] font-medium text-[var(--text-secondary)] mb-1'>
        {t('comments.field_content', {}, locale)} <span className='text-[var(--accent)]'>*</span>
      </label>
      <textarea
        required
        rows={3}
        value={value}
        onChange={onChange}
        placeholder={t('comments.field_content_placeholder', {}, locale)}
        className='w-full p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-y leading-relaxed'
      />
    </div>
  )
}

function CommentFormActions({ submitting, locale }: { submitting: boolean; locale: BlogLocale }) {
  return (
    <div className='flex items-center justify-between pt-1'>
      <span className='text-[11px] text-[var(--text-quaternary)]'>
        {t('comments.rules_hint', {}, locale)}
      </span>
      <button
        type='submit'
        disabled={submitting}
        className='inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-[var(--shadow-xs)]'
      >
        {submitting ? (
          <>
            <Loader2 className='w-3.5 h-3.5 animate-spin' />
            <span>{t('comments.submitting', {}, locale)}</span>
          </>
        ) : (
          <>
            <Send className='w-3.5 h-3.5' />
            <span>{t('comments.submit', {}, locale)}</span>
          </>
        )}
      </button>
    </div>
  )
}

function CommentList({
  comments,
  loading,
  locale,
}: {
  comments: BlogComment[]
  loading: boolean
  locale: BlogLocale
}) {
  if (loading) {
    return (
      <div className='py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2'>
        <Loader2 className='w-4 h-4 animate-spin text-[var(--accent)]' />
        <span>{t('comments.loading', {}, locale)}</span>
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <div className='py-10 text-center text-xs text-[var(--text-quaternary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]'>
        {t('comments.empty', {}, locale)}
      </div>
    )
  }
  return (
    <div className='space-y-4'>
      {comments.map((item) => (
        <CommentItem key={item.id} item={item} locale={locale} />
      ))}
    </div>
  )
}

function CommentItem({ item, locale }: { item: BlogComment; locale: BlogLocale }) {
  return (
    <div className='p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='w-7 h-7 rounded-full bg-[var(--accent-softer)] text-[var(--accent)] font-bold flex items-center justify-center text-xs'>
            {item.authorName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            {item.authorUrl ? (
              <a
                href={item.authorUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]'
              >
                {item.authorName}
              </a>
            ) : (
              <span className='font-semibold text-[var(--text-primary)]'>{item.authorName}</span>
            )}
          </div>
        </div>
        <time className='text-[11px] text-[var(--text-quaternary)]'>
          {formatDate(item.createdAt, locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <p className='text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed pl-9'>
        {item.content}
      </p>
    </div>
  )
}
