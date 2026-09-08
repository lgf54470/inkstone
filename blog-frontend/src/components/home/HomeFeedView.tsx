import { useState, useRef, useMemo, useEffect, useCallback, type ReactElement } from 'react'
import { X, Sparkles } from 'lucide-react'
import HomePostCard from './HomePostCard'
import HomePagination from './HomePagination'
import HomeSidebar from './HomeSidebar'
import { parsePositiveInt } from '../../lib/pagination'
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
    // pushState 保留历史条目：浏览器后退/前进可恢复此前的筛选与分页状态
    window.history.pushState(null, '', url.pathname + url.search)
  } catch {
    // URL 构造失败（极少见，如不可解析的 base URL）时放弃同步，不影响页面功能
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

function PostCardSkeleton({ count }: { count: number }): ReactElement {
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
    <div className='space-y-4'>
      {loading ? (
        <PostCardSkeleton count={3} />
      ) : (
        posts.map((post) => (
          <HomePostCard
            key={post.id}
            post={post}
            category={post.categoryId ? categoryMap.get(post.categoryId) : undefined}
            locale={locale}
            onTagClick={onTagClick}
          />
        ))
      )}
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

function useLatestRequest() {
  const seqRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  // 卸载时中止在途请求：避免卸载后 setState 与无谓的网络消耗
  useEffect(() => () => controllerRef.current?.abort(), [])

  const begin = useCallback((): { seq: number; signal: AbortSignal } => {
    // 新请求取代旧请求：中止在途 fetch，seq 守卫保证过期响应不会覆盖新结果
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return { seq: ++seqRef.current, signal: controller.signal }
  }, [])

  const isLatest = useCallback((seq: number): boolean => seq === seqRef.current, [])

  return { begin, isLatest }
}

interface UseFeedQueryOptions {
  initialPosts: BlogPost[]
  initialTotal: number
  initialTotalPages: number
  onScrollToTop?: () => void
}

// 标签/分页筛选请求的客户端缓存：博客文章更新频率低，同一筛选在 TTL 内重复
// 点击（含浏览器前进/后退）直接秒开，不必每次往返远端 API。缓存挂在组件实例上，
// 卸载即失效，避免跨会话/跨测试残留旧数据。
const FEED_CACHE_TTL_MS = 60_000
const FEED_CACHE_MAX_ENTRIES = 60

interface FeedCacheEntry {
  at: number
  posts: BlogPost[]
  total: number
  totalPages: number
}

function feedCacheKey(tag: string | null, page: number, limit: number): string {
  return `${tag ?? ''}|${page}|${limit}`
}

function feedCacheSet(cache: Map<string, FeedCacheEntry>, key: string, entry: FeedCacheEntry): void {
  if (cache.size >= FEED_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, entry)
}

function useFeedQuery({ initialPosts, initialTotal, initialTotalPages, onScrollToTop }: UseFeedQueryOptions) {
  const [data, setData] = useState({
    posts: initialPosts,
    total: initialTotal,
    totalPages: initialTotalPages,
    loading: false,
  })
  const cacheRef = useRef(new Map<string, FeedCacheEntry>())
  const { begin, isLatest } = useLatestRequest()

  const fetchAndApply = async (targetTag: string | null, targetPage: number, targetLimit: number) => {
    const key = feedCacheKey(targetTag, targetPage, targetLimit)
    const cache = cacheRef.current
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < FEED_CACHE_TTL_MS) {
      // 缓存命中：中止在途请求（seq 作废），直接展示缓存结果
      begin()
      setData({ posts: cached.posts, total: cached.total, totalPages: cached.totalPages, loading: false })
      onScrollToTop?.()
      return
    }
    const { seq, signal } = begin()
    setData((prev) => ({ ...prev, loading: true }))
    try {
      const res = await api.getPosts({
        tag: targetTag || undefined,
        page: targetPage,
        limit: targetLimit,
        signal,
      })
      if (!isLatest(seq)) return
      feedCacheSet(cache, key, { at: Date.now(), posts: res.posts, total: res.total, totalPages: res.totalPages })
      setData({ posts: res.posts, total: res.total, totalPages: res.totalPages, loading: false })
    } finally {
      if (isLatest(seq)) {
        setData((prev) => ({ ...prev, loading: false }))
        onScrollToTop?.()
      }
    }
  }

  return { data, fetchAndApply }
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
  const { data, fetchAndApply } = useFeedQuery({ initialPosts, initialTotal, initialTotalPages, onScrollToTop })
  const fetchAndApplyRef = useRef(fetchAndApply)
  useEffect(() => {
    fetchAndApplyRef.current = fetchAndApply
  })

  // 浏览器前进/后退：按 URL 查询参数恢复筛选与分页，避免状态丢失
  useEffect(() => {
    const handlePopState = () => {
      const params = new URL(window.location.href).searchParams
      const nextTag = params.get('tag')
      const nextPage = parsePositiveInt(params.get('page'), 1)
      const nextLimit = Math.min(50, parsePositiveInt(params.get('limit'), 10))
      if (nextTag === tag && nextPage === page && nextLimit === pageSize) return
      setTag(nextTag)
      setPage(nextPage)
      setPageSize(nextLimit)
      fetchAndApplyRef.current(nextTag, nextPage, nextLimit)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [tag, page, pageSize])

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
