import { AlertCircle, CheckCircle, FileText, XCircle } from 'lucide-react'
import type { BlogComment, BlogCommentStatus } from '@shared/types'
import type { BlogTab } from '../blog-store'
import { t } from '../../../lib/i18n'

interface PendingCommentsCardProps {
    pendingComments: BlogComment[]
    totalComments: number
    totalPosts: number
    onSwitchTab: (tab: BlogTab) => void
    updateCommentStatus: (id: string, status: BlogCommentStatus) => Promise<void>
}

export function PendingCommentsCard({ pendingComments, totalComments, totalPosts, onSwitchTab, updateCommentStatus }: PendingCommentsCardProps) {
    return (<><div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)] flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-[var(--warning)]" />
              <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]">
                {t('blog.pending_comments')}
              </h3>
              {pendingComments.length > 0 && (
                <span className="rounded-full bg-[var(--danger-subtle)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-bold text-[var(--danger)]">
                  {pendingComments.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('comments')}
              className="text-[length:var(--text-11)] text-[var(--accent)] hover:underline"
            >
              {t('blog.all_pending_review')} ({totalComments})
            </button>
          </div>

          <div className="flex-1 mt-3 space-y-2.5 overflow-y-auto max-h-[360px]">
            {pendingComments.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2">
                <CheckCircle size={28} className="text-[var(--success)] opacity-80" />
                <span>{t('blog.all_comments_reviewed')}</span>
                <button
                  type="button"
                  onClick={() => onSwitchTab('posts')}
                  className="mt-2 inline-flex items-center gap-1 text-[length:var(--text-11\.5)] text-[var(--accent)] hover:underline"
                >
                  <FileText size={13} />
                  <span>{t('blog.manage_posts_count')} ({totalPosts})</span>
                </button>
              </div>
            ) : (
              pendingComments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{c.authorName}</span>
                      <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                        {t('blog.commented_on', { value0: c.postTitle })}
                      </span>
                    </div>
                    <span className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[length:var(--text-12)] text-[var(--text-secondary)] line-clamp-2">
                    {c.content}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'rejected')}
                      className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--danger)] hover:underline"
                    >
                      <XCircle size={12} /> {t('blog.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateCommentStatus(c.id, 'approved')}
                      className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--success)] hover:underline font-medium"
                    >
                      <CheckCircle size={12} /> {t('blog.approve')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div></>);
}
