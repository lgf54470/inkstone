import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle, ExternalLink, Inbox, RefreshCw, Reply, Search, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import type { BlogComment, BlogCommentsCounts, BlogCommentStatus } from '@shared/types'
import { Badge, Button, IconButton } from '../../components/primitives'
import { Checkbox, Input, Segmented } from '../../components/form'
import { resolveAvatarSource } from '../../lib/avatar'
import { t } from '../../lib/i18n'
import { fullTime } from '../../lib/time'
import { useBlogCommentsView } from './use-blog-comments-view'
import { BlogLoadFailure } from './blog-load-failure'
import { CommentReplyComposer } from './blog-comment-reply'

/** The comment avatar's rendered size, also declared as its intrinsic size so the row reserves it. */
const AVATAR_SIZE_PX = 32

/** The server caps the list at 500 rows; the DOM does not need all of them at once. */
const COMMENTS_RENDER_STEP = 100

export function BlogCommentsView() {
  const view = useBlogCommentsView()

  return (
    <div className='flex flex-1 flex-col overflow-hidden text-[length:var(--text-12-5)]'>
      <CommentsToolbar
        commentStatusFilter={view.commentStatusFilter}
        setCommentStatusFilter={view.setCommentStatusFilter}
        statusCounts={view.statusCounts}
        search={view.search}
        setSearch={view.setSearch}
        loading={view.loading}
        onRefresh={() => void view.loadComments()}
      />

      {view.selectedCommentIds.size > 0 && (
        <CommentsBatchBar
          selectedCount={view.selectedCommentIds.size}
          busy={view.batchBusy}
          onBatch={view.handleBatch}
          onClear={view.clearCommentSelection}
        />
      )}

      <CommentsList view={view} />
    </div>
  )
}

function CommentsList({ view }: { view: ReturnType<typeof useBlogCommentsView> }) {
  const [renderLimit, setRenderLimit] = useState(COMMENTS_RENDER_STEP)
  // A different filter or search term is a different list: start it from its own top.
  useEffect(() => {
    setRenderLimit(COMMENTS_RENDER_STEP)
  }, [view.commentStatusFilter, view.search])

  const visibleComments = view.comments.slice(0, renderLimit)

  return (
    <div className='flex-1 overflow-y-auto p-4 space-y-3'>
      {view.isTruncated && (
        <p className='px-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {t('blog.comment_list_truncated', { value0: view.comments.length })}
        </p>
      )}

      {view.comments.length > 0 && (
        <div className='flex items-center gap-2 px-1 pb-1'>
          <Checkbox
            checked={view.isAllSelected}
            onChange={view.handleToggleSelectAll}
            aria-label={t('blog.select_all_list')}
            className='min-h-0'
          />
          <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)] select-none'>{t('blog.select_all_list')} ({view.comments.length})</span>
        </div>
      )}

      {view.comments.length === 0 ? (
        <CommentsEmptyState view={view} />
      ) : (
        visibleComments.map((comment) => <CommentCard key={comment.id} bundle={commentCardBundle(view, comment)} />)
      )}

      {visibleComments.length < view.comments.length && (
        <div className='flex justify-center pt-1'>
          <Button variant='secondary' size='sm' onClick={() => setRenderLimit((limit) => limit + COMMENTS_RENDER_STEP)}>
            {t('blog.list_show_more', { value0: visibleComments.length, value1: view.comments.length })}
          </Button>
        </div>
      )}
    </div>
  )
}

function CommentsEmptyState({ view }: { view: ReturnType<typeof useBlogCommentsView> }) {
  if (view.loadFailed) return <BlogLoadFailure onRetry={() => void view.loadComments()} />
  return (
    <div className='flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2'>
      <Inbox size={32} className='opacity-40' />
      <p>{t('blog.no_comments')}</p>
    </div>
  )
}

function commentCardBundle(view: ReturnType<typeof useBlogCommentsView>, comment: BlogComment): CommentCardBundle {
  return {
    comment,
    frontendBase: view.frontendBase,
    isSelected: view.selectedCommentIds.has(comment.id),
    isStatusBusy: view.statusBusyIds.has(comment.id),
    onToggleSelect: () => view.toggleSelectComment(comment.id),
    onStatusChange: view.handleStatusChange,
    onDelete: view.handleDeleteSingle,
    isReplyOpen: view.replyTargetId === comment.id,
    replyDraft: view.replyDraft,
    replyBusy: view.replyBusy,
    onOpenReply: () => view.handleOpenReply(comment.id),
    onCancelReply: view.handleCancelReply,
    onReplyDraft: view.setReplyDraft,
    onSubmitReply: view.handleSubmitReply,
  }
}

function CommentsToolbar({
  commentStatusFilter,
  setCommentStatusFilter,
  statusCounts,
  search,
  setSearch,
  loading,
  onRefresh,
}: {
  commentStatusFilter: BlogCommentStatus | 'all'
  setCommentStatusFilter: (status: BlogCommentStatus | 'all') => void
  statusCounts: BlogCommentsCounts | null
  search: string
  setSearch: (v: string) => void
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5'>
      <CommentStatusTabs
        active={commentStatusFilter}
        counts={statusCounts}
        onSelect={setCommentStatusFilter}
      />

      <div className='flex items-center gap-2'>
        <div className='relative w-45 md:w-55'>
          <Input
            leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('blog.search_comments_placeholder')}
            className='h-8 text-[length:var(--text-12)]'
          />
        </div>

        <IconButton
          size='sm'
          label={t('common.refresh')}
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

const STATUS_TABS = [
  { key: 'all', label: () => t('blog.status_all') },
  { key: 'pending', label: () => t('blog.status_pending') },
  { key: 'approved', label: () => t('blog.status_approved') },
  { key: 'rejected', label: () => t('blog.status_rejected') },
  { key: 'spam', label: () => t('blog.status_spam') },
] as const

function CommentStatusTabs({
  active,
  counts,
  onSelect,
}: {
  active: BlogCommentStatus | 'all'
  counts: BlogCommentsCounts | null
  onSelect: (status: BlogCommentStatus | 'all') => void
}) {
  return (
    <Segmented
      size='sm'
      label={t('blog.comment_status_filter_label')}
      value={active}
      onChange={onSelect}
      options={STATUS_TABS.map((tab) => {
        const alert = tab.key === 'pending' && Boolean(counts && counts.pending > 0)
        return {
          value: tab.key,
          label: (
            <span className='inline-flex items-center gap-1.5'>
              {tab.label()}
              {counts && (
                <span
                  className={`rounded-full px-1.5 py-0.1 text-[length:var(--text-10)] ${
                    alert
                      ? 'bg-[var(--danger)] text-[var(--danger-on)] font-bold'
                      : 'bg-[var(--bg-sunken)] text-[var(--text-tertiary)]'
                  }`}
                >
                  {counts[tab.key]}
                </span>
              )}
            </span>
          ),
        }
      })}
    />
  )
}

function CommentsBatchBar({
  selectedCount,
  busy,
  onBatch,
  onClear,
}: {
  selectedCount: number
  busy: boolean
  onBatch: (action: 'approve' | 'reject' | 'spam' | 'delete') => void
  onClear: () => void
}) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-2 text-[length:var(--text-12)]'>
      <div className='flex items-center gap-2 text-[var(--accent)] font-medium'>
        <ShieldCheck size={15} />
        <span>{t('blog.selected_comments_count', { value0: selectedCount })}</span>
      </div>

      <div className='flex items-center gap-2'>
        <BatchActionButton icon={<CheckCircle size={12} className='mr-1 text-[var(--success)]' />} label={t('blog.batch_approve')} busy={busy} onClick={() => onBatch('approve')} />
        <BatchActionButton icon={<XCircle size={12} className='mr-1 text-[var(--text-tertiary)]' />} label={t('blog.batch_reject')} busy={busy} onClick={() => onBatch('reject')} />
        <BatchActionButton icon={<AlertTriangle size={12} className='mr-1 text-[var(--warning)]' />} label={t('blog.status_spam')} busy={busy} onClick={() => onBatch('spam')} />
        <BatchActionButton icon={<Trash2 size={12} className='mr-1' />} label={t('blog.batch_delete')} busy={busy} danger onClick={() => onBatch('delete')} />
        <Button size='sm' variant='ghost' onClick={onClear}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

function BatchActionButton({
  icon,
  label,
  busy,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  busy: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <Button size='sm' variant={danger ? 'danger' : 'secondary'} loading={busy} onClick={onClick}>
      {icon}
      {label}
    </Button>
  )
}

interface CommentCardBundle {
  comment: BlogComment
  frontendBase: string
  isSelected: boolean
  isStatusBusy: boolean
  onToggleSelect: () => void
  onStatusChange: (id: string, status: BlogCommentStatus) => Promise<void>
  onDelete: (id: string) => void
  isReplyOpen: boolean
  replyDraft: string
  replyBusy: boolean
  onOpenReply: () => void
  onCancelReply: () => void
  onReplyDraft: (value: string) => void
  onSubmitReply: () => void
}

function CommentCard({ bundle }: { bundle: CommentCardBundle }) {
  const { comment } = bundle

  return (
    <div
      data-comment-id={comment.id}
      className={`rounded-[var(--r-lg)] border p-4 transition-colors ${
        bundle.isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
      }`}
    >
      <CommentCardHeader bundle={bundle} />

      <div className='mt-3 ml-6 rounded-[var(--r-md)] bg-[var(--bg-base)] p-3 text-[length:var(--text-12-5)] leading-relaxed text-[var(--text-secondary)]'>
        {comment.content}
      </div>

      {comment.parentId && (
        <p className='mt-2 ml-6 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('blog.comment_is_reply')}
        </p>
      )}

      {bundle.isReplyOpen && (
        <CommentReplyComposer
          value={bundle.replyDraft}
          busy={bundle.replyBusy}
          onChange={bundle.onReplyDraft}
          onCancel={bundle.onCancelReply}
          onSubmit={bundle.onSubmitReply}
        />
      )}

      <CommentCardActions bundle={bundle} />
    </div>
  )
}

function CommentCardHeader({ bundle }: { bundle: CommentCardBundle }) {
  const { comment, frontendBase, isSelected, onToggleSelect } = bundle
  const postUrl = comment.postSlug ? `${frontendBase}/posts/${comment.postSlug}` : '#'

  return (
    <div className='flex items-start justify-between gap-3'>
      <div className='flex items-start gap-2.5'>
        <Checkbox checked={isSelected} onChange={onToggleSelect} aria-label={comment.authorName} className='mt-1 min-h-0' />
        <CommentAuthorAvatar comment={comment} />

        <div>
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-[var(--text-primary)]'>{comment.authorName}</span>
            <StatusBadge status={comment.status} />
            {comment.isOwner && <Badge tone='accent'>{t('blog.comment_by_author')}</Badge>}
            {Boolean(comment.spamScore) && (
              <Badge tone='warning'>{t('blog.comment_spam_score', { value0: comment.spamScore })}</Badge>
            )}
          </div>
          <div className='mt-0.5 flex flex-wrap items-center gap-x-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            <span>{comment.authorEmail}</span>
            {comment.ip && <span>{`· ${t('blog.comment_ip')} ${comment.ip}`}</span>}
            <span>· {fullTime(comment.createdAt)}</span>
          </div>
        </div>
      </div>

      <CommentPostLink comment={comment} postUrl={postUrl} />
    </div>
  )
}

function CommentAuthorAvatar({ comment }: { comment: BlogComment }) {
  // The picture comes from a reader's own form, so the source is whatever this app will render:
  // an image URL that passed the allowlist, or an avatar drawn locally from the name. A comment
  // stores no third-party default any more, because fetching one would put every reader's browser
  // (and this admin's) on someone else's server for a name they typed.
  const src = resolveAvatarSource(comment.authorAvatar, comment.authorName)
  return (
    <img
      src={src}
      alt={comment.authorName}
      loading='lazy'
      decoding='async'
      width={AVATAR_SIZE_PX}
      height={AVATAR_SIZE_PX}
      className='size-8 rounded-full bg-[var(--bg-sunken)] object-cover border border-[var(--border-subtle)]'
    />
  )
}

function CommentPostLink({ comment, postUrl }: { comment: BlogComment; postUrl: string }) {
  if (!comment.postTitle) return null
  return (
    <a
      href={postUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='hidden sm:inline-flex items-center gap-1 text-[length:var(--text-11-5)] text-[var(--accent)] hover:underline max-w-50 truncate'
      title={comment.postTitle}
    >
      <span className='truncate'>{comment.postTitle}</span>
      <ExternalLink size={11} className='shrink-0' />
    </a>
  )
}

function StatusBadge({ status }: { status: BlogCommentStatus }) {
  switch (status) {
    case 'pending':
      return <Badge tone='warning'>{t('blog.status_pending')}</Badge>
    case 'approved':
      return <Badge tone='success'>{t('blog.status_approved')}</Badge>
    case 'rejected':
      return <Badge>{t('blog.status_rejected')}</Badge>
    case 'spam':
      return <Badge tone='danger'>{t('blog.status_spam')}</Badge>
  }
}

function CommentCardActions({ bundle }: { bundle: CommentCardBundle }) {
  const { comment, isStatusBusy, onStatusChange, onDelete, onOpenReply } = bundle

  return (
    <div className='mt-3 flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]'>
      {comment.status === 'approved' && !comment.isOwner && (
        <CommentActionButton icon={<Reply size={12} className='mr-1' />} label={t('blog.comment_reply')} disabled={isStatusBusy} onClick={onOpenReply} />
      )}

      {comment.status !== 'approved' && (
        <CommentActionButton icon={<CheckCircle size={12} className='mr-1' />} label={t('blog.approve')} disabled={isStatusBusy} onClick={() => void onStatusChange(comment.id, 'approved')} className='text-[var(--success)] hover:bg-[var(--success)]/10' />
      )}

      {comment.status !== 'rejected' && (
        <CommentActionButton icon={<XCircle size={12} className='mr-1' />} label={t('blog.reject')} disabled={isStatusBusy} onClick={() => void onStatusChange(comment.id, 'rejected')} className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]' />
      )}

      {comment.status !== 'spam' && (
        <CommentActionButton icon={<AlertTriangle size={12} className='mr-1' />} label={t('blog.status_spam')} disabled={isStatusBusy} onClick={() => void onStatusChange(comment.id, 'spam')} className='text-[var(--warning)] hover:bg-[var(--warning)]/10' />
      )}

      <CommentActionButton icon={<Trash2 size={12} className='mr-1' />} label={t('common.delete')} onClick={() => onDelete(comment.id)} className='text-[var(--danger)] hover:bg-[var(--danger-soft)]' />
    </div>
  )
}

function CommentActionButton({
  icon,
  label,
  onClick,
  className,
  disabled,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  className?: string
  disabled?: boolean
}) {
  return (
    <Button size='sm' variant='ghost' onClick={onClick} className={className} disabled={disabled}>
      {icon}
      {label}
    </Button>
  )
}