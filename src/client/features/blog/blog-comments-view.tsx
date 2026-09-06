import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle, ExternalLink, Inbox, RefreshCw, Search, ShieldCheck, Trash2, User, XCircle } from 'lucide-react'
import type { BlogComment, BlogCommentStatus } from '@shared/types'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { t } from '../../lib/i18n'
import { useBlogCommentsView } from './use-blog-comments-view'

export function BlogCommentsView() {
    const view = useBlogCommentsView()

    return (
        <div className="flex flex-1 flex-col overflow-hidden text-[length:var(--text-12\.5)]">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {view.filteredComments.length > 0 && (
                    <div className="flex items-center gap-2 px-1 pb-1">
                        <input type="checkbox" checked={view.isAllSelected} onChange={view.handleToggleSelectAll} className="size-3.5 rounded accent-[var(--accent)] cursor-pointer" />
                        <span className="text-[length:var(--text-11)] text-[var(--text-tertiary)] select-none">{t('blog.select_all_list')} ({view.filteredComments.length})</span>
                    </div>
                )}

                {view.filteredComments.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2">
                        <Inbox size={32} className="opacity-40" />
                        <p>{t('blog.no_comments')}</p>
                    </div>
                ) : (
                    view.filteredComments.map((comment) => <CommentCard key={comment.id} bundle={commentCardBundle(view, comment)} />)
                )}
            </div>
        </div>
    )
}

function commentCardBundle(view: ReturnType<typeof useBlogCommentsView>, comment: BlogComment): CommentCardBundle {
    return {
        comment,
        frontendBase: view.frontendBase,
        isSelected: view.selectedCommentIds.has(comment.id),
        onToggleSelect: () => view.toggleSelectComment(comment.id),
        onStatusChange: view.updateCommentStatus,
        onDelete: view.handleDeleteSingle,
    }
}

interface StatusCounts {
    all: number
    pending: number
    approved: number
    rejected: number
    spam: number
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
    statusCounts: StatusCounts
    search: string
    setSearch: (v: string) => void
    loading: boolean
    onRefresh: () => void
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5">
            <CommentStatusTabs
                active={commentStatusFilter}
                counts={statusCounts}
                onSelect={setCommentStatusFilter}
            />

            <div className="flex items-center gap-2">
                <div className="relative w-[180px] md:w-[220px]">
                    <Input
                        leading={<Search size={13} className="text-[var(--text-quaternary)]" />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('blog.search_comments_placeholder')}
                        className="h-8 text-[length:var(--text-12)]"
                    />
                </div>

                <IconButton
                    size="sm"
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
    counts: StatusCounts
    onSelect: (status: BlogCommentStatus | 'all') => void
}) {
    return (
        <div className="flex items-center gap-1">
            {STATUS_TABS.map((tab) => {
                const isActive = active === tab.key
                const alert = tab.key === 'pending' && counts.pending > 0
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onSelect(tab.key)}
                        className={`flex items-center gap-1.5 rounded-[var(--r-md)] px-2.5 py-1 font-medium transition-colors ${
                            isActive
                                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <span>{tab.label()}</span>
                        <span
                            className={`rounded-full px-1.5 py-0.1 text-[length:var(--text-10)] ${
                                isActive
                                    ? 'bg-black/20 text-[var(--accent-contrast)]'
                                    : alert
                                        ? 'bg-[var(--danger)] text-white font-bold'
                                        : 'bg-[var(--bg-sunken)] text-[var(--text-tertiary)]'
                            }`}
                        >
                            {counts[tab.key]}
                        </span>
                    </button>
                )
            })}
        </div>
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
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-2 text-[length:var(--text-12)]">
            <div className="flex items-center gap-2 text-[var(--accent)] font-medium">
                <ShieldCheck size={15} />
                <span>{t('blog.selected_comments_count', { value0: selectedCount })}</span>
            </div>

            <div className="flex items-center gap-2">
                <BatchActionButton icon={<CheckCircle size={12} className="mr-1 text-[var(--success)]" />} label={t('blog.batch_approve')} busy={busy} onClick={() => onBatch('approve')} />
                <BatchActionButton icon={<XCircle size={12} className="mr-1 text-[var(--text-tertiary)]" />} label={t('blog.batch_reject')} busy={busy} onClick={() => onBatch('reject')} />
                <BatchActionButton icon={<AlertTriangle size={12} className="mr-1 text-[var(--warning)]" />} label={t('blog.status_spam')} busy={busy} onClick={() => onBatch('spam')} />
                <BatchActionButton icon={<Trash2 size={12} className="mr-1" />} label={t('blog.batch_delete')} busy={busy} danger onClick={() => onBatch('delete')} />
                <Button size="sm" variant="ghost" onClick={onClear}>
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
        <Button size="sm" variant={danger ? 'danger' : 'secondary'} loading={busy} onClick={onClick}>
            {icon}
            {label}
        </Button>
    )
}

interface CommentCardBundle {
    comment: BlogComment
    frontendBase: string
    isSelected: boolean
    onToggleSelect: () => void
    onStatusChange: (id: string, status: BlogCommentStatus) => void
    onDelete: (id: string) => void
}

function CommentCard({ bundle }: { bundle: CommentCardBundle }) {
    const { comment } = bundle

    return (
        <div
            className={`rounded-[var(--r-lg)] border p-4 transition-colors ${
                bundle.isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
                    : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
            }`}
        >
            <CommentCardHeader bundle={bundle} />

            <div className="mt-3 ml-6 rounded-[var(--r-md)] bg-[var(--bg-base)] p-3 text-[length:var(--text-12\.5)] leading-relaxed text-[var(--text-secondary)]">
                {comment.content}
            </div>

            <CommentCardActions bundle={bundle} />
        </div>
    )
}

function CommentCardHeader({ bundle }: { bundle: CommentCardBundle }) {
    const { comment, frontendBase, isSelected, onToggleSelect } = bundle
    const postUrl = comment.postSlug ? `${frontendBase}/posts/${comment.postSlug}` : '#'

    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
                <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="mt-1 size-3.5 rounded accent-[var(--accent)] cursor-pointer" />
                <CommentAuthorAvatar comment={comment} />

                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">{comment.authorName}</span>
                        <StatusBadge status={comment.status} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                        <span>{comment.authorEmail}</span>
                        {comment.ip && <span>{`· ${t('blog.comment_ip')} ${comment.ip}`}</span>}
                        <span>· {new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <CommentPostLink comment={comment} postUrl={postUrl} />
        </div>
    )
}

function CommentAuthorAvatar({ comment }: { comment: BlogComment }) {
    if (!comment.authorAvatar) {
        return (
            <div className="flex size-8 items-center justify-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                <User size={14} />
            </div>
        )
    }
    return (
        <img
            src={comment.authorAvatar}
            alt={comment.authorName}
            className="size-8 rounded-full bg-[var(--bg-sunken)] object-cover border border-[var(--border-subtle)]"
        />
    )
}

function CommentPostLink({ comment, postUrl }: { comment: BlogComment; postUrl: string }) {
    if (!comment.postTitle) return null
    return (
        <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-[length:var(--text-11\.5)] text-[var(--accent)] hover:underline max-w-[200px] truncate"
            title={comment.postTitle}
        >
            <span className="truncate">{comment.postTitle}</span>
            <ExternalLink size={11} className="shrink-0" />
        </a>
    )
}

function StatusBadge({ status }: { status: BlogCommentStatus }) {
    switch (status) {
        case 'pending':
            return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[length:var(--text-11)] font-medium text-amber-600 dark:text-amber-400">{t('blog.status_pending')}</span>
        case 'approved':
            return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[length:var(--text-11)] font-medium text-emerald-600 dark:text-emerald-400">{t('blog.status_approved')}</span>
        case 'rejected':
            return <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[length:var(--text-11)] font-medium text-stone-500">{t('blog.status_rejected')}</span>
        case 'spam':
            return <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[length:var(--text-11)] font-medium text-rose-600 dark:text-rose-400">{t('blog.status_spam')}</span>
    }
}

function CommentCardActions({ bundle }: { bundle: CommentCardBundle }) {
    const { comment, onStatusChange, onDelete } = bundle

    return (
        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            {comment.status !== 'approved' && (
                <CommentActionButton icon={<CheckCircle size={12} className="mr-1" />} label={t('blog.approve')} onClick={() => onStatusChange(comment.id, 'approved')} className="text-[var(--success)] hover:bg-[var(--success)]/10" />
            )}

            {comment.status !== 'rejected' && (
                <CommentActionButton icon={<XCircle size={12} className="mr-1" />} label={t('blog.reject')} onClick={() => onStatusChange(comment.id, 'rejected')} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" />
            )}

            {comment.status !== 'spam' && (
                <CommentActionButton icon={<AlertTriangle size={12} className="mr-1" />} label={t('blog.status_spam')} onClick={() => onStatusChange(comment.id, 'spam')} className="text-[var(--warning)] hover:bg-[var(--warning)]/10" />
            )}

            <CommentActionButton icon={<Trash2 size={12} className="mr-1" />} label={t('common.delete')} onClick={() => onDelete(comment.id)} className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]" />
        </div>
    )
}

function CommentActionButton({
    icon,
    label,
    onClick,
    className,
}: {
    icon: ReactNode
    label: string
    onClick: () => void
    className?: string
}) {
    return (
        <Button size="sm" variant="ghost" onClick={onClick} className={className}>
            {icon}
            {label}
        </Button>
    )
}