import { BarChart3, ExternalLink } from 'lucide-react'
import type { BlogGlobalAnalytics } from '@shared/types'
import { t } from '../../../lib/i18n'

interface TopPostsCardProps {
    posts: BlogGlobalAnalytics['topPosts']
    frontendBase: string
}

export function TopPostsCard({ posts, frontendBase }: TopPostsCardProps) {
    return (<><div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <BarChart3 size={15} className="text-[var(--accent)]" />
              {t('blog.top_posts_title')}
            </h3>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">{'TOP 10'}</span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] pt-1">
            {posts.length === 0 ? (
              <p className="py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
                {t('blog.no_visit_data')}
              </p>
            ) : (
              posts.map((post, index) => {
                const maxVal = posts[0]?.views || 1
                const pct = Math.max(2, Math.round((post.views / maxVal) * 100))
                return (
                  <div
                    key={post.postId}
                    className="flex items-center gap-3 py-2.5 hover:bg-[var(--bg-hover)] -mx-2 px-2 rounded-[var(--r-md)] transition-colors"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[length:var(--text-10)] font-bold ${
                        index < 3
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-base)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[length:var(--text-12)]">
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {post.title}
                        </span>
                        <span className="font-mono font-semibold text-[var(--text-primary)] ml-2 whitespace-nowrap">
                          {post.views}{' '}
                          <span className="text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]">
                            {'PV'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--bg-base)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <a
                      href={`${frontendBase}/posts/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-[var(--text-quaternary)] hover:text-[var(--accent)] transition-colors"
                      title={t('blog.view_in_blog')}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )
              })
            )}
          </div>
        </div></>);
}
