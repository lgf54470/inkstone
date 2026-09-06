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

interface CommentsSectionProps {
  postId: string
  allowComments?: boolean
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

async function submitCommentRequest(postId: string, fields: CommentFields): Promise<SubmitResult> {
  const name = fields.name.trim()
  const email = fields.email.trim()
  const content = fields.content.trim()
  if (!name || !email || !content) {
    return { kind: 'error', message: '请填写称呼、邮箱与评论内容' }
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
    return { kind: 'error', message: errorText || '提交评论失败，请重试' }
  }
}

function useCommentFetch(postId: string, enabled: boolean) {
  const [comments, setComments] = useState<BlogComment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Closed-comment posts render a static notice; skip the network request entirely.
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

function useCommentForm(postId: string, onPosted?: (comment?: BlogComment) => void) {
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

    const result = await submitCommentRequest(postId, fields)
    if (result.kind === 'success') {
      if (result.comment) {
        setMessage({ type: 'success', text: '评论发布成功！' })
      } else {
        setMessage({
          type: 'success',
          text: '评论提交成功！博主开启了留言审核机制，审核通过后将公开显示。',
        })
      }
      setFields((prev) => ({ ...prev, content: '' }))
      onPosted?.(result.comment)
    } else {
      setMessage({ type: 'error', text: result.message })
    }

    setSubmitting(false)
  }

  return { fields, submitting, message, updateField, handleSubmit }
}

export default function CommentsSection({ postId, allowComments = true }: CommentsSectionProps) {
  const { comments, loading, appendComment } = useCommentFetch(postId, allowComments)
  const form = useCommentForm(postId, appendComment)

  if (!allowComments) {
    return <CommentsDisabled />
  }

  return (
    <section className="my-12 pt-8 border-t border-[var(--border-default)]" id="comments">
      <CommentsHeader count={comments.length} />
      {form.message && <MessageBanner message={form.message} />}
      <CommentForm
        fields={form.fields}
        submitting={form.submitting}
        onFieldChange={form.updateField}
        onSubmit={form.handleSubmit}
      />
      <CommentList comments={comments} loading={loading} />
    </section>
  )
}

function CommentsDisabled() {
  return (
    <div className="my-10 p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-center text-xs text-[var(--text-tertiary)]">
      博主已关闭此文章的评论功能
    </div>
  )
}

function CommentsHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <MessageSquare className="w-5 h-5 text-[var(--accent)]" />
      <h3 className="text-lg font-bold text-[var(--text-primary)]">评论与讨论 ({count})</h3>
    </div>
  )
}

function MessageBanner({ message }: { message: { type: 'success' | 'error'; text: string } }) {
  const isSuccess = message.type === 'success'
  return (
    <div
      className={`mb-6 p-4 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
        isSuccess
          ? 'bg-[var(--accent-softer)] border-[var(--accent)] text-[var(--accent)]'
          : 'bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger)]'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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

const META_FIELD_CONFIGS: MetaFieldConfig[] = [
  { key: 'name', label: '称呼', type: 'text', placeholder: '如何称呼您', icon: User, required: true },
  { key: 'email', label: '邮箱', type: 'email', placeholder: '不公开，用于接收回复', icon: Mail, required: true },
  { key: 'url', label: '网址 (选填)', type: 'url', placeholder: 'https://', icon: Globe },
]

function CommentForm({
  fields,
  submitting,
  onFieldChange,
  onSubmit,
}: {
  fields: CommentFields
  submitting: boolean
  onFieldChange: (key: CommentFieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mb-8 p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4"
    >
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">发表看法</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {META_FIELD_CONFIGS.map((cfg) => (
          <CommentInput
            key={cfg.key}
            config={cfg}
            value={fields[cfg.key]}
            onChange={onFieldChange(cfg.key)}
          />
        ))}
      </div>
      <CommentContentField value={fields.content} onChange={onFieldChange('content')} />
      <CommentFormActions submitting={submitting} />
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
      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
        {config.label}
        {config.required && <span className="text-[var(--accent)]"> *</span>}
      </label>
      <div className="relative flex items-center">
        <Icon className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-quaternary)]" />
        <input
          type={config.type}
          required={config.required}
          value={value}
          onChange={onChange}
          placeholder={config.placeholder}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>
    </div>
  )
}

function CommentContentField({
  value,
  onChange,
}: {
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
        评论内容 <span className="text-[var(--accent)]">*</span>
      </label>
      <textarea
        required
        rows={3}
        value={value}
        onChange={onChange}
        placeholder="写下您的见解或疑问..."
        className="w-full p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-y leading-relaxed"
      />
    </div>
  )
}

function CommentFormActions({ submitting }: { submitting: boolean }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-[11px] text-[var(--text-quaternary)]">文明发言，严谨交流</span>
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-xs"
      >
        {submitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>提交中...</span>
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            <span>发表评论</span>
          </>
        )}
      </button>
    </div>
  )
}

function CommentList({ comments, loading }: { comments: BlogComment[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
        <span>加载评论中...</span>
      </div>
    )
  }
  if (comments.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-[var(--text-quaternary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
        暂无评论，来发表第一条评论吧！
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {comments.map((item) => (
        <CommentItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function CommentItem({ item }: { item: BlogComment }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[var(--accent-softer)] text-[var(--accent)] font-bold flex items-center justify-center text-xs">
            {item.authorName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            {item.authorUrl ? (
              <a
                href={item.authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
              >
                {item.authorName}
              </a>
            ) : (
              <span className="font-semibold text-[var(--text-primary)]">{item.authorName}</span>
            )}
          </div>
        </div>
        <time className="text-[11px] text-[var(--text-quaternary)]">
          {new Date(item.createdAt).toLocaleString()}
        </time>
      </div>
      <p className="text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed pl-9">
        {item.content}
      </p>
    </div>
  )
}
