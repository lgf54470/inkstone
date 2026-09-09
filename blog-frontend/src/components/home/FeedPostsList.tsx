import type { ReactElement } from 'react'
import HomePostCard from './HomePostCard'
import { t, type BlogLocale } from '../../lib/i18n'
import type { BlogPost, BlogCategory } from '../../lib/types'

export function PostCardSkeleton({ count }: { count: number }): ReactElement {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden='true'
          className='flex flex-col sm:flex-row gap-5 p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse'
        >
          <div className='sm:w-48 sm:h-36 w-full h-44 shrink-0 rounded-xl bg-[var(--bg-hover)]' />
          <div className='flex-1 space-y-3 py-1'>
            <div className='h-3 w-24 rounded bg-[var(--bg-hover)]' />
            <div className='h-4 w-3/4 rounded bg-[var(--bg-hover)]' />
            <div className='h-3 w-full rounded bg-[var(--bg-hover)]' />
            <div className='h-3 w-5/6 rounded bg-[var(--bg-hover)]' />
            <div className='h-8 w-2/3 rounded-lg bg-[var(--bg-hover)] mt-4' />
          </div>
        </div>
      ))}
    </>
  )
}

export interface FeedPostsListProps {
  posts: BlogPost[]
  loading: boolean
  categoryMap: Map<string, BlogCategory>
  locale: BlogLocale
  onTagClick: (tag: string) => void
}

export default function FeedPostsList({
  posts,
  loading,
  categoryMap,
  locale,
  onTagClick,
}: FeedPostsListProps): ReactElement {
  if (posts.length === 0 && !loading) {
    return (
      <div className='py-16 text-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]'>
        <p className='text-sm text-[var(--text-tertiary)]'>{t('filter.no_matched', {}, locale)}</p>
      </div>
    )
  }

  if (posts.length === 0 && loading) {
    return (
      <div className='space-y-4'>
        <PostCardSkeleton count={3} />
      </div>
    )
  }

  return (
    <div
      className={`space-y-4 transition-opacity duration-200 ${
        loading ? 'opacity-60 pointer-events-none' : 'opacity-100'
      }`}
      aria-busy={loading}
    >
      {posts.map((post) => (
        <HomePostCard
          key={post.id}
          post={post}
          category={post.categoryId ? categoryMap.get(post.categoryId) : undefined}
          locale={locale}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  )
}
