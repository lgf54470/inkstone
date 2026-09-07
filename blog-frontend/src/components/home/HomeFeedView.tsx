import { useState, useRef, useMemo, type ReactElement } from 'react'
import { X, Sparkles } from 'lucide-react'
import HomePostCard from './HomePostCard'
import HomePagination from './HomePagination'
import HomeSidebar from './HomeSidebar'
import { api } from '../../lib/api'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'
import type { BlogPost, BlogCategory, BlogTag, BlogSiteInfo, CalendarDayPost } from '../../lib/types'

export interface HomeFeedViewProps {
  initialPosts: BlogPost[]
  initialTotal: number
  initialPage: number
  initialLimit: number
  initialTotalPages: number
  categories: BlogCategory[]
  tags: BlogTag[]
  calendarDays: CalendarDayPost[]
  siteInfo: BlogSiteInfo
  locale?: BlogLocale
  initialTag?: string | null
}

function updateUrlParams(tag: string | null, page: number, limit: number): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (tag) url.searchParams.set('tag', tag)
    else url.searchParams.delete('tag')
    if (page > 1) url.searchParams.set('page', String(page))
    else url.searchParams.delete('page')
    if (limit !== 10) url.searchParams.set('limit', String(limit))
    else url.searchParams.delete('limit')
    window.history.replaceState(null, '', url.pathname + url.search)
  } catch {
    // ignore
  }
}

function FeedHeader({
  total,
  selectedTag,
  locale,
  onClearTag,
}: {
  total: number
  selectedTag: string | null
  locale: BlogLocale
  onClearTag: () => void
}): ReactElement {
  return (
    <div className='space-y-3 pb-2 border-b border-[var(--border-subtle)]'>
      <div className='flex items-center justify-between'>
        <h2 className='text-base font-bold text-[var(--text-primary)] flex items-center gap-2'>
          <Sparkles size={16} className='text-[var(--accent)]' aria-hidden='true' />
          <span>{t('home.featured_posts', {}, locale)}</span>
          <span className='text-xs font-normal text-[var(--text-tertiary)]'>
            {t('home.posts_count', { count: total }, locale)}
          </span>
        </h2>
      </div>

      {selectedTag && (
        <div className='flex items-center justify-between rounded-xl border border-[var(--accent-muted)]/40 bg-[var(--accent-softer)]/60 px-3.5 py-2 text-xs'>
          <div className='flex items-center gap-2 text-[var(--accent)] font-medium'>
            <span>{t('filter.tag_active', {}, locale)}:</span>
            <span className='rounded-md bg-[var(--accent)] px-2 py-0.5 text-[length:var(--text-11)] font-semibold text-white shadow-2xs'>
              #{selectedTag}
            </span>
          </div>
          <button
            type='button'
            onClick={onClearTag}
            className='flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer'
          >
            <span>{t('filter.clear', {}, locale)}</span>
            <X size={13} aria-hidden='true' />
          </button>
        </div>
      )}
    </div>
  )
}

function FeedPostsList({
  posts,
  loading,
  categoryMap,
  locale,
  onTagClick,
}: {
  posts: BlogPost[]
  loading: boolean
  categoryMap: Map<string, BlogCategory>
  locale: BlogLocale
  onTagClick: (tag: string) => void
}): ReactElement {
  if (posts.length === 0 && !loading) {
    return (
      <div className='py-16 text-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]'>
        <p className='text-sm text-[var(--text-tertiary)]'>{t('filter.no_matched', {}, locale)}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
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

interface UseFeedStateOptions {
  initialPosts: BlogPost[]
  initialTotal: number
  initialPage: number
  initialLimit: number
  initialTotalPages: number
  initialTag?: string | null
  onScrollToTop?: () => void
}

function useFeedState({
  initialPosts,
  initialTotal,
  initialPage,
  initialLimit,
  initialTotalPages,
  initialTag = null,
  onScrollToTop,
}: UseFeedStateOptions) {
  const [tag, setTag] = useState<string | null>(initialTag)
  const [page, setPage] = useState<number>(initialPage)
  const [pageSize, setPageSize] = useState<number>(initialLimit)
  const [data, setData] = useState({
    posts: initialPosts,
    total: initialTotal,
    totalPages: initialTotalPages,
    loading: false,
  })

  const fetchAndApply = async (targetTag: string | null, targetPage: number, targetLimit: number) => {
    setData((prev) => ({ ...prev, loading: true }))
    try {
      const res = await api.getPosts({ tag: targetTag || undefined, page: targetPage, limit: targetLimit })
      setData({ posts: res.posts, total: res.total, totalPages: res.totalPages, loading: false })
    } finally {
      setData((prev) => ({ ...prev, loading: false }))
      onScrollToTop?.()
    }
  }

  const queryPosts = (nextTag: string | null, nextPage: number, nextLimit: number) => {
    setTag(nextTag)
    setPage(nextPage)
    setPageSize(nextLimit)
    updateUrlParams(nextTag, nextPage, nextLimit)
    fetchAndApply(nextTag, nextPage, nextLimit)
  }

  const handleTagToggle = (next: string) => queryPosts(tag === next ? null : next, 1, pageSize)
  const handlePageChange = (p: number) => queryPosts(tag, p, pageSize)
  const handlePageSizeChange = (s: number) => queryPosts(tag, 1, s)

  return { selectedTag: tag, page, pageSize, ...data, handleTagToggle, handlePageChange, handlePageSizeChange }
}

interface FeedMainColumnProps {
  scrollRef: React.RefObject<HTMLElement | null>
  total: number
  selectedTag: string | null
  locale?: BlogLocale
  posts: BlogPost[]
  loading: boolean
  categoryMap: Map<string, BlogCategory>
  page: number
  totalPages: number
  pageSize: number
  onTagToggle: (tag: string) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

function FeedMainColumn({
  scrollRef,
  total,
  selectedTag,
  locale = DEFAULT_LOCALE,
  posts,
  loading,
  categoryMap,
  page,
  totalPages,
  pageSize,
  onTagToggle,
  onPageChange,
  onPageSizeChange,
}: FeedMainColumnProps): ReactElement {
  return (
    <section className='lg:col-span-8 flex flex-col h-full min-h-0'>
      <FeedHeader
        total={total}
        selectedTag={selectedTag}
        locale={locale}
        onClearTag={() => onTagToggle(selectedTag!)}
      />
      <div
        ref={scrollRef as React.RefObject<HTMLDivElement>}
        className='flex-1 min-h-0 overflow-y-auto py-2.5 pr-0 lg:pr-2 scrollbar-thin space-y-4'
      >
        <FeedPostsList
          posts={posts}
          loading={loading}
          categoryMap={categoryMap}
          locale={locale}
          onTagClick={onTagToggle}
        />
      </div>
      <footer className='shrink-0 mt-auto pt-2.5 pb-1 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]'>
        <HomePagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          locale={locale}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </footer>
    </section>
  )
}

export default function HomeFeedView(props: HomeFeedViewProps): ReactElement {
  const leftScrollRef = useRef<HTMLDivElement>(null)
  const categoryMap = useMemo(() => new Map(props.categories.map((c) => [c.id, c])), [props.categories])

  const scrollToTop = () => {
    if (typeof leftScrollRef.current?.scrollTo === 'function') {
      leftScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const state = useFeedState({ ...props, onScrollToTop: scrollToTop })

  return (
    <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch h-full min-h-0'>
      <FeedMainColumn
        scrollRef={leftScrollRef}
        total={state.total}
        selectedTag={state.selectedTag}
        locale={props.locale}
        posts={state.posts}
        loading={state.loading}
        categoryMap={categoryMap}
        page={state.page}
        totalPages={state.totalPages}
        pageSize={state.pageSize}
        onTagToggle={state.handleTagToggle}
        onPageChange={state.handlePageChange}
        onPageSizeChange={state.handlePageSizeChange}
      />
      <div className='lg:col-span-4 h-full min-h-0 overflow-y-auto scrollbar-none'>
        <HomeSidebar
          siteInfo={props.siteInfo}
          categories={props.categories}
          tags={props.tags}
          calendarDays={props.calendarDays}
          selectedTag={state.selectedTag}
          totalPosts={props.initialTotal}
          locale={props.locale}
          onTagSelect={state.handleTagToggle}
        />
      </div>
    </div>
  )
}
