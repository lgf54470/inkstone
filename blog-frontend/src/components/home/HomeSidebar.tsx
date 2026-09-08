import type { ReactElement } from 'react'
import CalendarWidget from '../CalendarWidget'
import { categoryDotStyle } from '../../lib/category-style'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'
import type { BlogSiteInfo, BlogCategory, BlogTag, CalendarDayPost } from '../../lib/types'

export interface HomeSidebarProps {
  siteInfo: BlogSiteInfo
  categories: BlogCategory[]
  tags: BlogTag[]
  calendarDays: CalendarDayPost[]
  selectedTag: string | null
  totalPosts: number
  locale?: BlogLocale
  onTagSelect: (tag: string) => void
}

function AuthorCard({
  siteInfo,
  totalPosts,
  categoryCount,
  tagCount,
  locale,
}: {
  siteInfo: BlogSiteInfo
  totalPosts: number
  categoryCount: number
  tagCount: number
  locale: BlogLocale
}): ReactElement {
  return (
    <div className='p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'>
      <div className='flex items-center gap-3'>
        {siteInfo.authorAvatar ? (
          <img
            src={siteInfo.authorAvatar}
            alt={siteInfo.authorName}
            className='w-10 h-10 rounded-full object-cover border border-[var(--border-subtle)] shrink-0'
          />
        ) : (
          <div className='w-10 h-10 rounded-full bg-[var(--accent)] text-white font-serif font-bold text-base flex items-center justify-center shadow-[var(--shadow-xs)] shrink-0'>
            {siteInfo.authorName.slice(0, 1)}
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <h3 className='font-bold text-xs text-[var(--text-primary)] truncate'>{siteInfo.authorName}</h3>
          <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)] truncate'>{siteInfo.bio || t('home.author_role', {}, locale)}</p>
        </div>
        <div className='flex items-center gap-2 text-center text-[length:var(--text-10)] text-[var(--text-quaternary)] shrink-0 pl-2.5 border-l border-[var(--border-subtle)]'>
          <div>
            <div className='font-bold text-xs text-[var(--text-primary)]'>{totalPosts}</div>
            <div>{t('home.stat_posts', {}, locale)}</div>
          </div>
          <div>
            <div className='font-bold text-xs text-[var(--text-primary)]'>{categoryCount}</div>
            <div>{t('home.stat_categories', {}, locale)}</div>
          </div>
          <div>
            <div className='font-bold text-xs text-[var(--text-primary)]'>{tagCount}</div>
            <div>{t('home.stat_tags', {}, locale)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoriesBox({
  categories,
  locale,
}: {
  categories: BlogCategory[]
  locale: BlogLocale
}): ReactElement | null {
  if (categories.length === 0) return null
  return (
    <div className='p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'>
      <div className='flex items-center justify-between mb-2'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]'>
          {t('home.category_topics', {}, locale)}
        </h3>
        <a href='/categories' className='text-xs text-[var(--accent)] hover:underline'>
          {t('home.view_all_categories', {}, locale)}
        </a>
      </div>
      <div className='space-y-1'>
        {categories.slice(0, 5).map((cat) => (
          <a
            key={cat.id}
            href={`/categories/${cat.slug}`}
            className='flex items-center justify-between p-1.5 rounded-lg text-xs hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors'
          >
            <div className='flex items-center gap-2'>
              <span className='w-2 h-2 rounded-full' style={categoryDotStyle(cat.color)} />
              <span>{cat.name}</span>
            </div>
            <span className='text-[length:var(--text-10)] px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-quaternary)]'>
              {cat.postsCount || 0}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function TagsBox({
  tags,
  selectedTag,
  locale,
  onTagSelect,
}: {
  tags: BlogTag[]
  selectedTag: string | null
  locale: BlogLocale
  onTagSelect: (tag: string) => void
}): ReactElement | null {
  if (tags.length === 0) return null
  return (
    <div className='p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xs)]'>
      <div className='flex items-center justify-between mb-2.5'>
        <h3 className='text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]'>
          {t('home.tag_cloud', {}, locale)}
        </h3>
        <a href='/tags' className='text-xs text-[var(--accent)] hover:underline'>
          {t('home.all_tags', {}, locale)}
        </a>
      </div>
      <div className='flex flex-wrap gap-1.5'>
        {tags.slice(0, 10).map((tag) => {
          const isActive = selectedTag === tag.name
          return (
            <button
              key={tag.name}
              type='button'
              onClick={() => onTagSelect(tag.name)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-xs font-semibold'
                  : 'bg-[var(--bg-sunken)] hover:bg-[var(--accent-softer)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
              }`}
            >
              <span>#{tag.name}</span>
              <span className={`text-[length:var(--text-10)] ${isActive ? 'text-white/80' : 'text-[var(--text-quaternary)]'}`}>
                {tag.postsCount}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function HomeSidebar({
  siteInfo,
  categories,
  tags,
  calendarDays,
  selectedTag,
  totalPosts,
  locale = DEFAULT_LOCALE,
  onTagSelect,
}: HomeSidebarProps): ReactElement {
  return (
    <aside className='flex flex-col gap-3'>
      <AuthorCard
        siteInfo={siteInfo}
        totalPosts={totalPosts}
        categoryCount={categories.length}
        tagCount={tags.length}
        locale={locale}
      />
      <div>
        <CalendarWidget initialDays={calendarDays} initialLocale={locale} />
      </div>
      <CategoriesBox categories={categories} locale={locale} />
      <TagsBox
        tags={tags}
        selectedTag={selectedTag}
        locale={locale}
        onTagSelect={onTagSelect}
      />
    </aside>
  )
}

