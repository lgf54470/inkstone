import {
  FileText,
  Eye,
  MessageSquare,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useBlogStore, type BlogTab } from './blog-store'

export function BlogDashboardView({
  onSwitchTab,
  onOpenNewPost,
}: {
  onSwitchTab: (tab: BlogTab) => void
  onOpenNewPost: () => void
}) {
  const stats = useBlogStore((s) => s.stats)
  const posts = useBlogStore((s) => s.posts)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const pendingComments = comments.filter((c) => c.status === 'pending')
  const recentPosts = posts.slice(0, 5)

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[12.5px]">
      {/* Welcome & quick action banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-[var(--r-xl)] border border-[var(--border-default)] bg-gradient-to-r from-[var(--bg-surface)] to-[var(--bg-sunken)] p-5">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
            {settings?.siteName || t('blog.hub_title')}
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">
            {settings?.subtitle || t('blog.default_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={frontendBase}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ExternalLink size={13} />
            <span>{t('blog.visit_frontend')}</span>
          </a>
          <Button variant="primary" size="sm" onClick={onOpenNewPost}>
            {t('blog.new_post')}
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Posts */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center justify-between text-[var(--text-quaternary)]">
            <span className="text-[12px] font-medium">{t('blog.total_posts')}</span>
            <FileText size={16} className="text-[var(--accent)]" />
          </div>
          <div className="mt-2 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
            {stats?.totalPosts ?? posts.length}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
            <span>{t('blog.published')}: {stats?.publishedPosts ?? 0}</span>
            <span>·</span>
            <span>{t('blog.draft')}: {stats?.draftPosts ?? 0}</span>
          </div>
        </div>

        {/* Total Views */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center justify-between text-[var(--text-quaternary)]">
            <span className="text-[12px] font-medium">{t('blog.total_views')}</span>
            <Eye size={16} className="text-[var(--warning)]" />
          </div>
          <div className="mt-2 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
            {stats?.totalViews ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            {t('blog.total_views_desc')}
          </div>
        </div>

        {/* Total Comments */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center justify-between text-[var(--text-quaternary)]">
            <span className="text-[12px] font-medium">{t('blog.total_comments')}</span>
            <MessageSquare size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="mt-2 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
            {stats?.totalComments ?? comments.length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            {t('blog.total_comments_desc')}
          </div>
        </div>

        {/* Pending Comments */}
        <div
          onClick={() => onSwitchTab('comments')}
          className="group cursor-pointer rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-all hover:border-[var(--accent)] hover:shadow-sm"
        >
          <div className="flex items-center justify-between text-[var(--text-quaternary)]">
            <span className="text-[12px] font-medium">{t('blog.pending_comments')}</span>
            <AlertCircle size={16} className="text-[var(--danger)] group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[24px] font-bold tracking-tight text-[var(--danger)]">
              {stats?.pendingComments ?? pendingComments.length}
            </span>
            {(stats?.pendingComments || 0) > 0 && (
              <span className="text-[11px] font-medium text-[var(--danger)] bg-[var(--danger-subtle)] px-1.5 py-0.5 rounded">
                {t('blog.pending_status')}
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-tertiary)] group-hover:text-[var(--accent)]">
            {t('blog.go_to_moderation')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Comments List */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-[var(--danger)]" />
              <h3 className="font-semibold text-[var(--text-primary)]">
                {t('blog.pending_comments')}
              </h3>
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.2 text-[10.5px] font-medium text-[var(--accent)]">
                {pendingComments.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('comments')}
              className="text-[11px] text-[var(--accent)] hover:underline"
            >
              {t('blog.all_pending_review')} ({comments.length})
            </button>
          </div>

          <div className="flex-1 mt-3 space-y-2.5 overflow-y-auto max-h-[300px]">
            {pendingComments.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-[var(--text-quaternary)]">
                <CheckCircle size={24} className="text-[var(--success)] mb-1 opacity-80" />
                <span>{t('blog.all_comments_reviewed')}</span>
              </div>
            ) : (
              pendingComments.slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{c.authorName}</span>
                      <span className="text-[11px] text-[var(--text-quaternary)]">
                        {t('blog.commented_on', { value0: c.postTitle })}
                      </span>
                    </div>
                    <span className="text-[10.5px] text-[var(--text-quaternary)]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2">
                    {c.content}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'rejected')}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--danger)] hover:underline"
                    >
                      <XCircle size={12} /> {t('blog.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'approved')}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--success)] hover:underline font-medium"
                    >
                      <CheckCircle size={12} /> {t('blog.approve')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Posts */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-[var(--accent)]" />
              <h3 className="font-semibold text-[var(--text-primary)]">
                {t('blog.recent_posts')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('posts')}
              className="text-[11px] text-[var(--accent)] hover:underline"
            >
              {t('blog.manage_posts_count')} ({posts.length})
            </button>
          </div>

          <div className="flex-1 mt-3 space-y-2 overflow-y-auto max-h-[300px]">
            {recentPosts.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[var(--text-quaternary)]">
                {t('blog.no_posts')}
              </div>
            ) : (
              recentPosts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {p.title}
                      </span>
                      {p.isPublished ? (
                        <span className="rounded bg-[var(--success)]/10 px-1 py-0.2 text-[10px] text-[var(--success)]">
                          {t('blog.published')}
                        </span>
                      ) : (
                        <span className="rounded bg-[var(--border-default)] px-1 py-0.2 text-[10px] text-[var(--text-quaternary)]">
                          {t('blog.draft')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-quaternary)]">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(p.publishedAt).toLocaleDateString()}
                      </span>
                      <span>{t('blog.reads_label')} {p.views}</span>
                      <span>{t('blog.comments_label')} {p.commentsCount ?? 0}</span>
                    </div>
                  </div>

                  <a
                    href={`${frontendBase}/posts/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-[var(--text-quaternary)] hover:text-[var(--accent)]"
                    title={t('blog.view_in_blog')}
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
