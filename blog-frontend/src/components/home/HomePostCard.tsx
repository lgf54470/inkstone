import type { ReactElement } from 'react'
import type { BlogPost, BlogCategory } from '../../lib/types'
import { isSvgCoverUrl } from '../../lib/content'
import { categoryChipStyle } from '../../lib/category-style'
import { t, formatDate, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'

export interface HomePostCardProps {
  post: BlogPost
  category?: BlogCategory
  locale?: BlogLocale
  onTagClick?: (tag: string) => void
}

function PostCover({ post }: { post: BlogPost }): ReactElement | null {
  if (!post.coverUrl) return null
  const isSvg = isSvgCoverUrl(post.coverUrl)
  return (
    <a
      href={`/posts/${post.slug}`}
      className='sm:w-48 sm:h-36 w-full h-44 shrink-0 rounded-xl overflow-hidden bg-[var(--bg-sunken)] relative flex items-center justify-center'
      tabIndex={-1}
      aria-hidden='true'
    >
      <img
        src={post.coverUrl}
        alt={post.title}
        loading='lazy'
        className={
          isSvg
            ? 'w-auto h-auto max-w-[80%] max-h-[80%] object-contain p-2 group-hover:scale-105 transition-transform duration-[var(--dur-slow)]'
            : 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-[var(--dur-slow)]'
        }
      />
    </a>
  )
}

function PostMetaRow({
  post,
  category,
  locale,
}: {
  post: BlogPost
  category?: BlogCategory
  locale: BlogLocale
}): ReactElement {
  const formattedDate = formatDate(post.publishedAt || post.createdAt, locale)
  return (
    <div className='flex items-center gap-2 mb-2 flex-wrap'>
      {post.isPinned && (
        <span className='inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--accent)] text-white shadow-2xs'>
          {t('post.pinned', {}, locale)}
        </span>
      )}
      {category && (
        <a
          href={`/categories/${category.slug}`}
          className='inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors'
          style={categoryChipStyle(category.color)}
        >
          {category.name}
        </a>
      )}
      <time className='text-xs text-[var(--text-quaternary)]'>{formattedDate}</time>
    </div>
  )
}

function PostFooterRow({
  post,
  onTagClick,
}: {
  post: BlogPost
  onTagClick?: (tag: string) => void
}): ReactElement {
  return (
    <div className='flex items-center justify-between gap-4 pt-2 border-t border-[var(--border-subtle)]/50 text-xs text-[var(--text-tertiary)] flex-wrap'>
      <div className='flex items-center gap-1.5 flex-wrap'>
        {post.tags?.slice(0, 3).map((tag) => (
          <button
            key={tag}
            type='button'
            onClick={() => onTagClick?.(tag)}
            className='px-2 py-0.5 rounded-md text-[11px] bg-[var(--bg-sunken)] hover:bg-[var(--accent-softer)] hover:text-[var(--accent)] transition-colors cursor-pointer'
          >
            #{tag}
          </button>
        ))}
      </div>

      <div className='flex items-center gap-3 text-[11px] text-[var(--text-quaternary)] shrink-0'>
        {typeof post.views === 'number' && (
          <span className='flex items-center gap-1'>
            <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' />
            </svg>
            <span>{post.views}</span>
          </span>
        )}
        {typeof post.commentsCount === 'number' && (
          <span className='flex items-center gap-1'>
            <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
            </svg>
            <span>{post.commentsCount}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default function HomePostCard({
  post,
  category,
  locale = DEFAULT_LOCALE,
  onTagClick,
}: HomePostCardProps): ReactElement {
  return (
    <article className='group relative flex flex-col sm:flex-row gap-5 p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-muted)] hover:shadow-[var(--shadow-hover)] transition-all duration-[var(--dur-base)]'>
      <PostCover post={post} />
      <div className='flex-1 flex flex-col justify-between'>
        <div>
          <PostMetaRow post={post} category={category} locale={locale} />
          <h3 className='text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 mb-2 leading-snug'>
            <a href={`/posts/${post.slug}`}>{post.title}</a>
          </h3>
          {post.excerpt && (
            <p className='text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-3'>
              {post.excerpt}
            </p>
          )}
        </div>
        <PostFooterRow post={post} onTagClick={onTagClick} />
      </div>
    </article>
  )
}
