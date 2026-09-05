import React, { useState, useEffect } from 'react'
import { MessageSquare, Send, User, Mail, Globe, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import type { BlogComment } from '../lib/types'

interface CommentsSectionProps {
  postId: string
  allowComments?: boolean
}

export default function CommentsSection({ postId, allowComments = true }: CommentsSectionProps) {
  const [comments, setComments] = useState<BlogComment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
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
  }, [postId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !content.trim()) {
      setMessage({ type: 'error', text: '请填写称呼、邮箱与评论内容' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await api.submitComment({
        postId,
        authorName: name.trim(),
        authorEmail: email.trim(),
        authorUrl: url.trim() || undefined,
        content: content.trim(),
      })

      if (res.comment && res.comment.status === 'approved') {
        setComments((prev) => [...prev, res.comment!])
        setMessage({ type: 'success', text: '评论发布成功！' })
      } else {
        setMessage({
          type: 'success',
          text: '评论提交成功！博主开启了留言审核机制，审核通过后将公开显示。',
        })
      }

      setContent('')
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err)
      setMessage({ type: 'error', text: errorText || '提交评论失败，请重试' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowComments) {
    return (
      <div className="my-10 p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-center text-xs text-[var(--text-tertiary)]">
        博主已关闭此文章的评论功能
      </div>
    )
  }

  return (
    <section className="my-12 pt-8 border-t border-[var(--border-default)]" id="comments">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-[var(--accent)]" />
        <h3 className="text-lg font-bold text-[var(--text-primary)]">
          评论与讨论 ({comments.length})
        </h3>
      </div>

      {/* Message alert */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-[var(--accent-softer)] border-[var(--accent)] text-[var(--accent)]'
              : 'bg-[var(--danger-soft)] border-[var(--danger-border)] text-[var(--danger)]'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Submit Form */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-4"
      >
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">发表看法</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              称呼 <span className="text-[var(--accent)]">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-quaternary)]" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如何称呼您"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              邮箱 <span className="text-[var(--accent)]">*</span>
            </label>
            <div className="relative flex items-center">
              <Mail className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-quaternary)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="不公开，用于接收回复"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              网址 (选填)
            </label>
            <div className="relative flex items-center">
              <Globe className="w-3.5 h-3.5 absolute left-2.5 text-[var(--text-quaternary)]" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
            评论内容 <span className="text-[var(--accent)]">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下您的见解或疑问..."
            className="w-full p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-y leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--text-quaternary)]">
            文明发言，严谨交流
          </span>
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
      </form>

      {/* Comments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-8 text-center text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>加载评论中...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-quaternary)] bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
            暂无评论，来发表第一条评论吧！
          </div>
        ) : (
          comments.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs space-y-2"
            >
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
                      <span className="font-semibold text-[var(--text-primary)]">
                        {item.authorName}
                      </span>
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
          ))
        )}
      </div>
    </section>
  )
}
