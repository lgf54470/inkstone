import { BarChart3, ChevronRight, ExternalLink } from 'lucide-react'
import type { BlogGlobalAnalytics } from '@shared/types'
import { IconButton } from '../../../components/primitives'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'

interface TopPostsCardProps {
  posts: BlogGlobalAnalytics['topPosts']
  frontendBase: string
  /** A way into one post's own analytics (FEA-09); absent when the surface offers no drilldown. */
  onSelectPost?: (postId: string) => void
}

export function TopPostsCard({ posts, frontendBase, onSelectPost }: TopPostsCardProps) {
  const maxViews = posts[0]?.views || 1
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-[var(--sp-4)] shadow-[var(--shadow-soft)]'>
      <div className='flex items-center justify-between pb-[var(--sp-3)] border-b border-[var(--border-subtle)]'>
        <h3 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)] flex items-center gap-[var(--sp-1-5)]'>
          <BarChart3 size={15} className='text-[var(--accent)]' />
          {t('blog.top_posts_title')}
        </h3>
        <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('blog.top_posts_limit')}
        </span>
      </div>

      <div className='divide-y divide-[var(--border-subtle)] pt-[var(--sp-1)]'>
        {posts.length === 0 ? (
          <p className='py-[var(--sp-6)] text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
            {t('blog.no_visit_data')}
          </p>
        ) : (
          posts.map((post, index) => (
            <TopPostRow
              key={post.postId}
              post={post}
              index={index}
              maxViews={maxViews}
              frontendBase={frontendBase}
              onSelect={onSelectPost}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TopPostRow({ post, index, maxViews, frontendBase, onSelect }: {
  post: BlogGlobalAnalytics['topPosts'][number]
  index: number
  maxViews: number
  frontendBase: string
  onSelect?: (postId: string) => void
}) {
  const pct = Math.max(2, Math.round((post.views / maxViews) * 100))
  return (
    <div className='flex items-center gap-[var(--sp-3)] py-[var(--sp-2-5)] hover:bg-[var(--bg-hover)] -mx-2 px-[var(--sp-2)] rounded-[var(--r-md)] transition-colors'>
      <span className={cn('flex h-[var(--sp-5)] w-[var(--sp-5)] items-center justify-center rounded-full text-[length:var(--text-10)] font-bold', index < 3 ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-[var(--bg-base)] text-[var(--text-tertiary)]')}>
        {index + 1}
      </span>

      <div className='flex-1 min-w-0'>
        <div className='flex items-center justify-between text-[length:var(--text-12)]'>
          <span className='truncate font-medium text-[var(--text-primary)]'>{post.title}</span>
          <span className='font-mono font-semibold text-[var(--text-primary)] ml-[var(--sp-2)] whitespace-nowrap'>
            {post.views}{' '}
            <span className='text-[length:var(--text-10)] font-normal text-[var(--text-tertiary)]'>
              {t('blog.col_views')}
            </span>
          </span>
        </div>
        <div className='mt-[var(--sp-1)] h-[var(--sp-1-5)] w-full rounded-full bg-[var(--bg-base)] overflow-hidden'>
          <div className='h-full rounded-full bg-[var(--accent)] transition-all' style={{ width: `${pct}%` }} />
        </div>
      </div>

      <a href={`${frontendBase}/posts/${post.slug}`} target='_blank' rel='noopener noreferrer' className='p-[var(--sp-1)] text-[var(--text-quaternary)] hover:text-[var(--accent)] transition-colors' title={t('blog.view_in_blog')}>
        <ExternalLink size={13} />
      </a>

      {onSelect && (
        <IconButton size='sm' label={t('blog.view_post_analytics')} onClick={() => onSelect(post.postId)}>
          <ChevronRight size={14} />
        </IconButton>
      )}
    </div>
  )
}
