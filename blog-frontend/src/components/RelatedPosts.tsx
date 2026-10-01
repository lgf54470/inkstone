import { BookOpen } from 'lucide-react'
import type { BlogPost } from '../lib/types'
import { t, formatDate, type BlogLocale } from '../lib/i18n'

/**
 * 文章页底部的「相关文章」：关系由服务端给出（共同标签优先、其次同分类），这里只负责画。
 * 列表为空就整段不渲染——没有关系时不应出现一段「随便找几篇」的假相关。
 */
export default function RelatedPosts({ posts, locale }: { posts: BlogPost[]; locale: BlogLocale }) {
  if (posts.length === 0) return null
  return (
    <section className='mt-10 pt-8 border-t border-[var(--border-default)]' aria-labelledby='related-posts-title'>
      <h2
        id='related-posts-title'
        className='flex items-center gap-2 text-lg font-bold text-[var(--text-primary)] mb-4'
      >
        <BookOpen className='w-4 h-4 text-[var(--accent)]' />
        {t('post.related_title', {}, locale)}
      </h2>
      <ul className='grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0'>
        {posts.map((post) => (
          <li key={post.id}>
            <a
              href={`/posts/${post.slug}`}
              className='block h-full p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-softer)] transition-colors no-underline'
            >
              <span className='block font-semibold text-sm text-[var(--text-primary)] leading-snug'>
                {post.title}
              </span>
              <time className='block mt-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
                {formatDate(post.publishedAt || post.createdAt, locale)}
              </time>
              {post.excerpt && (
                <p className='mt-2 text-xs text-[var(--text-tertiary)] line-clamp-2 leading-relaxed'>
                  {post.excerpt}
                </p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
