import { useState, useMemo } from 'react'
import {
  CheckCircle,
  XCircle,
  Trash2,
  AlertTriangle,
  Search,
  ExternalLink,
  ShieldCheck,
  Inbox,
  User,
  RefreshCw,
} from 'lucide-react'
import type { BlogCommentStatus } from '@shared/types'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'

export function BlogCommentsView() {
  const toast = useUi((s) => s.toast)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const loading = useBlogStore((s) => s.loading)
  const loadComments = useBlogStore((s) => s.loadComments)
  const commentStatusFilter = useBlogStore((s) => s.commentStatusFilter)
  const setCommentStatusFilter = useBlogStore((s) => s.setCommentStatusFilter)
  const selectedCommentIds = useBlogStore((s) => s.selectedCommentIds)
  const toggleSelectComment = useBlogStore((s) => s.toggleSelectComment)
  const selectAllComments = useBlogStore((s) => s.selectAllComments)
  const clearCommentSelection = useBlogStore((s) => s.clearCommentSelection)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)
  const deleteComment = useBlogStore((s) => s.deleteComment)
  const batchComments = useBlogStore((s) => s.batchComments)
  const batchBusy = useBlogStore((s) => s.batchBusy)

  const [search, setSearch] = useState('')

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')

  const statusCounts = useMemo(() => {
    const counts = { all: comments.length, pending: 0, approved: 0, rejected: 0, spam: 0 }
    for (const c of comments) {
      if (c.status in counts) counts[c.status as BlogCommentStatus]++
    }
    return counts
  }, [comments])

  const filteredComments = useMemo(() => {
    let list = comments
    if (commentStatusFilter !== 'all') {
      list = list.filter((c) => c.status === commentStatusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.authorName.toLowerCase().includes(q) ||
          c.authorEmail.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          (c.postTitle && c.postTitle.toLowerCase().includes(q)),
      )
    }
    return list
  }, [comments, commentStatusFilter, search])

  const isAllSelected =
    filteredComments.length > 0 &&
    filteredComments.every((c) => selectedCommentIds.has(c.id))

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      clearCommentSelection()
    } else {
      selectAllComments(filteredComments.map((c) => c.id))
    }
  }

  const handleDeleteSingle = async (id: string) => {
    const ok = await confirm({
      title: t('blog.delete_comment'),
      description: t('blog.confirm_delete_comment'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteComment(id)
    toast({ title: t('blog.comment_deleted'), tone: 'default' })
  }

  const handleBatch = async (action: 'approve' | 'reject' | 'spam' | 'delete') => {
    if (selectedCommentIds.size === 0) return
    if (action === 'delete') {
      const ok = await confirm({
        title: t('blog.batch_delete'),
        description: t('blog.confirm_batch_delete_comments', { value0: selectedCommentIds.size }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
      })
      if (!ok) return
    }
    await batchComments(action)
    toast({ title: t('blog.batch_action_success'), tone: 'success' })
  }

  const getStatusBadge = (status: BlogCommentStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            {t('blog.status_pending')}
          </span>
        )
      case 'approved':
        return (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            {t('blog.status_approved')}
          </span>
        )
      case 'rejected':
        return (
          <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            {t('blog.status_rejected')}
          </span>
        )
      case 'spam':
        return (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
            {t('blog.status_spam')}
          </span>
        )
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden text-[12.5px]">
      {/* Top filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5">
        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {(
            [
              { key: 'all', label: t('blog.status_all'), count: statusCounts.all, alert: false },
              { key: 'pending', label: t('blog.status_pending'), count: statusCounts.pending, alert: statusCounts.pending > 0 },
              { key: 'approved', label: t('blog.status_approved'), count: statusCounts.approved, alert: false },
              { key: 'rejected', label: t('blog.status_rejected'), count: statusCounts.rejected, alert: false },
              { key: 'spam', label: t('blog.status_spam'), count: statusCounts.spam, alert: false },
            ] as const
          ).map((tab) => {
            const active = commentStatusFilter === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCommentStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1 font-medium transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.1 text-[10px] ${
                    active
                      ? 'bg-black/20 text-[var(--accent-contrast)]'
                      : tab.alert
                      ? 'bg-[var(--danger)] text-white font-bold'
                      : 'bg-[var(--bg-sunken)] text-[var(--text-tertiary)]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative w-[180px] md:w-[220px]">
            <Input
              leading={<Search size={13} className="text-[var(--text-quaternary)]" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('blog.search_comments_placeholder')}
              className="h-8 text-[12px]"
            />
          </div>

          <IconButton
            size="sm"
            label={t('common.refresh')}
            disabled={loading}
            onClick={() => void loadComments()}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Batch action bar if items selected */}
      {selectedCommentIds.size > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-2 text-[12px]">
          <div className="flex items-center gap-2 text-[var(--accent)] font-medium">
            <ShieldCheck size={15} />
            <span>{t('blog.selected_comments_count', { value0: selectedCommentIds.size })}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={batchBusy}
              onClick={() => void handleBatch('approve')}
            >
              <CheckCircle size={12} className="mr-1 text-[var(--success)]" />
              {t('blog.batch_approve')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={batchBusy}
              onClick={() => void handleBatch('reject')}
            >
              <XCircle size={12} className="mr-1 text-[var(--text-tertiary)]" />
              {t('blog.batch_reject')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={batchBusy}
              onClick={() => void handleBatch('spam')}
            >
              <AlertTriangle size={12} className="mr-1 text-[var(--warning)]" />
              {t('blog.status_spam')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={batchBusy}
              onClick={() => void handleBatch('delete')}
            >
              <Trash2 size={12} className="mr-1" />
              {t('blog.batch_delete')}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearCommentSelection}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredComments.length > 0 && (
          <div className="flex items-center gap-2 px-1 pb-1">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleToggleSelectAll}
              className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-[11px] text-[var(--text-tertiary)] select-none">
              {t('blog.select_all_list')} ({filteredComments.length})
            </span>
          </div>
        )}

        {filteredComments.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2">
            <Inbox size={32} className="opacity-40" />
            <p>{t('blog.no_comments')}</p>
          </div>
        ) : (
          filteredComments.map((comment) => {
            const isSelected = selectedCommentIds.has(comment.id)
            const postUrl = comment.postSlug ? `${frontendBase}/posts/${comment.postSlug}` : '#'

            return (
              <div
                key={comment.id}
                className={`rounded-[var(--r-lg)] border p-4 transition-colors ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                }`}
              >
                {/* Comment Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectComment(comment.id)}
                      className="mt-1 size-3.5 rounded accent-[var(--accent)] cursor-pointer"
                    />

                    {/* Avatar */}
                    {comment.authorAvatar ? (
                      <img
                        src={comment.authorAvatar}
                        alt={comment.authorName}
                        className="size-8 rounded-full bg-[var(--bg-sunken)] object-cover border border-[var(--border-subtle)]"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                        <User size={14} />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {comment.authorName}
                        </span>
                        {getStatusBadge(comment.status)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--text-quaternary)]">
                        <span>{comment.authorEmail}</span>
                        {comment.ip && <span>{`· ${t('blog.comment_ip')} ${comment.ip}`}</span>}
                        <span>· {new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Article reference link */}
                  {comment.postTitle && (
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:inline-flex items-center gap-1 text-[11.5px] text-[var(--accent)] hover:underline max-w-[200px] truncate"
                      title={comment.postTitle}
                    >
                      <span className="truncate">{comment.postTitle}</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  )}
                </div>

                {/* Comment Content */}
                <div className="mt-3 ml-6 rounded-[var(--r-md)] bg-[var(--bg-base)] p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  {comment.content}
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  {comment.status !== 'approved' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void updateCommentStatus(comment.id, 'approved')}
                      className="text-[var(--success)] hover:bg-[var(--success)]/10"
                    >
                      <CheckCircle size={12} className="mr-1" />
                      {t('blog.approve')}
                    </Button>
                  )}

                  {comment.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void updateCommentStatus(comment.id, 'rejected')}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      <XCircle size={12} className="mr-1" />
                      {t('blog.reject')}
                    </Button>
                  )}

                  {comment.status !== 'spam' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void updateCommentStatus(comment.id, 'spam')}
                      className="text-[var(--warning)] hover:bg-[var(--warning)]/10"
                    >
                      <AlertTriangle size={12} className="mr-1" />
                      {t('blog.status_spam')}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDeleteSingle(comment.id)}
                    className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                  >
                    <Trash2 size={12} className="mr-1" />
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
