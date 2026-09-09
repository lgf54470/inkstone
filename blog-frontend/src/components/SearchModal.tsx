import {
  useState,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Calendar, Tag, AlertCircle } from 'lucide-react'
import SearchInput from './SearchInput'
import { api } from '../lib/api'
import { useFocusTrap, useScrollLock } from '../lib/use-focus-trap'
import type { BlogPost } from '../lib/types'
import { SEARCH_RESULT_LIMIT, SEARCH_FOCUS_DELAY_MS, SEARCH_DEBOUNCE_MS } from '../lib/constants'
import { t, formatDate, useCurrentLocale, type BlogLocale } from '../lib/i18n'

interface SearchModalProps {
  initialLocale?: BlogLocale
}

function useVisibility() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    const handleClose = () => setIsOpen(false)

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('open-search-modal', handleOpen)
    window.addEventListener('close-search-modal', handleClose)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('open-search-modal', handleOpen)
      window.removeEventListener('close-search-modal', handleClose)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return { isOpen, close: () => setIsOpen(false) }
}

/**
 * 全站搜索：输入防抖后请求服务端 search 接口（覆盖全部已发布文章）。
 * seq 序号守卫丢弃过期响应，AbortController 取消在途请求（中止不触发降级标记）。
 */
function useSearch(isOpen: boolean) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { results, total, loading, error } = useServerSearch(query, isOpen)

  // Focus on open; reset state on close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), SEARCH_FOCUS_DELAY_MS)
    } else {
      setQuery('')
    }
  }, [isOpen])

  return { query, setQuery, results, total, loading, error, inputRef }
}

function useServerSearch(query: string, isOpen: boolean) {
  const [results, setResults] = useState<BlogPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const seqRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    seqRef.current += 1
    controllerRef.current?.abort()
    if (!isOpen || !q) {
      setResults([])
      setTotal(0)
      setLoading(false)
      setError(false)
      return
    }

    // 新查询开始时清除上次的错误态，避免残留旧失败提示
    setError(false)
    setLoading(true)
    const timer = setTimeout(() => {
      runSearchRequest({
        q,
        seqRef,
        controllerRef,
        onResult: (posts, total) => {
          setResults(posts)
          setTotal(total)
        },
        onError: () => setError(true),
        onLoading: setLoading,
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, isOpen])

  return { results, total, loading, error }
}

async function runSearchRequest(options: {
  q: string
  seqRef: RefObject<number>
  controllerRef: RefObject<AbortController | null>
  onResult: (posts: BlogPost[], total: number) => void
  onError: () => void
  onLoading: (loading: boolean) => void
}): Promise<void> {
  const { q, seqRef, controllerRef, onResult, onError, onLoading } = options
  const seq = seqRef.current
  const controller = new AbortController()
  controllerRef.current = controller
  try {
    const res = await api.getPosts({ search: q, limit: SEARCH_RESULT_LIMIT, signal: controller.signal })
    if (seq !== seqRef.current) return
    onResult(res.posts, res.total)
  } catch {
    if (seq !== seqRef.current) return // 已被新查询取代的请求中止，丢弃
    // 网络失败与真实无结果区分展示，避免误导用户
    onError()
  } finally {
    if (seq === seqRef.current) onLoading(false)
  }
}

function useSelection(results: BlogPost[]) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const handleKeyDownList = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % results.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const selected = results[selectedIndex]
      if (selected) window.location.href = `/posts/${selected.slug}`
    }
  }

  return { selectedIndex, setSelectedIndex, handleKeyDownList }
}

function useSearchModal() {
  const { isOpen, close } = useVisibility()
  const { query, setQuery, results, total, loading, error, inputRef } = useSearch(isOpen)
  const { selectedIndex, setSelectedIndex, handleKeyDownList } = useSelection(results)

  return {
    isOpen,
    query,
    loading,
    error,
    results,
    total,
    selectedIndex,
    inputRef,
    close,
    onQueryChange: (value: string) => setQuery(value),
    onHoverRow: (idx: number) => setSelectedIndex(idx),
    handleKeyDownList,
  }
}

export default function SearchModal({ initialLocale }: SearchModalProps) {
  const search = useSearchModal()
  const locale = useCurrentLocale(initialLocale)

  return (
    <SearchLayer
      isOpen={search.isOpen}
      onClose={search.close}
      onKeyDown={search.handleKeyDownList}
      ariaLabel={t('nav.search_aria', {}, locale)}
    >
      <SearchInputRow
        query={search.query}
        loading={search.loading}
        inputRef={search.inputRef}
        locale={locale}
        onQueryChange={search.onQueryChange}
      />
      <SearchResultsPanel
        query={search.query}
        loading={search.loading}
        error={search.error}
        results={search.results}
        selectedIndex={search.selectedIndex}
        locale={locale}
        onHoverRow={search.onHoverRow}
      />
      <SearchFooter
        query={search.query}
        resultCount={search.results.length}
        total={search.total}
        locale={locale}
      />
    </SearchLayer>
  )
}

function SearchLayer({
  isOpen,
  onClose,
  onKeyDown,
  ariaLabel,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  ariaLabel: string
  children: ReactNode
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen)
  useScrollLock(isOpen)
  return (
    <div
      ref={trapRef}
      role='dialog'
      aria-modal='true'
      aria-label={ariaLabel}
      className={`fixed inset-0 z-50 overflow-y-auto flex items-start justify-center pt-20 px-4 transition-[visibility] duration-[var(--dur-base)] ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)] ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-xl bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl border border-[var(--border-default)] shadow-[var(--shadow-modal)] overflow-hidden z-10 transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] transform ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}

function SearchInputRow({
  query,
  loading,
  inputRef,
  locale,
  onQueryChange,
}: {
  query: string
  loading: boolean
  inputRef: RefObject<HTMLInputElement | null>
  locale: BlogLocale
  onQueryChange: (value: string) => void
}) {
  return (
    <div className='px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-raised)]'>
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={t('search.input_placeholder', {}, locale)}
        ariaLabel={t('nav.search_aria', {}, locale)}
        clearLabel={t('search.clear', {}, locale)}
        loading={loading}
        inputRef={inputRef}
        variant='bare'
        trailingEmpty={
          <kbd className='hidden sm:inline-block text-[length:var(--text-10)] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-quaternary)] bg-[var(--bg-base)]'>
            ESC
          </kbd>
        }
      />
    </div>
  )
}

function SearchResultsPanel({
  query,
  loading,
  error,
  results,
  selectedIndex,
  locale,
  onHoverRow,
}: {
  query: string
  loading: boolean
  error: boolean
  results: BlogPost[]
  selectedIndex: number
  locale: BlogLocale
  onHoverRow: (idx: number) => void
}) {
  return (
    <div className='max-h-96 overflow-y-auto p-2'>
      {query.trim() === '' ? (
        <div className='py-10 text-center text-xs text-[var(--text-tertiary)]'>
          {t('search.empty_query_hint', {}, locale)}
        </div>
      ) : error ? (
        <div className='py-10 text-center text-xs text-[var(--danger)] flex items-center justify-center gap-1.5'>
          <AlertCircle className='w-4 h-4 shrink-0' />
          <span>{t('search.error', {}, locale)}</span>
        </div>
      ) : results.length === 0 && !loading ? (
        <div className='py-10 text-center text-xs text-[var(--text-tertiary)]'>
          {t('search.no_results', { query }, locale)}
        </div>
      ) : (
        <div className='space-y-1'>
          {results.map((post, idx) => (
            <SearchResultRow
              key={post.id}
              post={post}
              selected={idx === selectedIndex}
              locale={locale}
              onHover={() => onHoverRow(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SearchResultTitle({ post, selected, locale }: { post: BlogPost; selected: boolean; locale: BlogLocale }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <h4
        className={`text-sm font-semibold truncate ${
          selected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {post.title}
      </h4>
      <div className='flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-quaternary)] shrink-0'>
        <Calendar className='w-3 h-3' />
        <span>{formatDate(post.publishedAt || post.createdAt, locale)}</span>
      </div>
    </div>
  )
}

function SearchResultExcerpt({ post }: { post: BlogPost }) {
  if (!post.excerpt) return null
  return (
    <p className='text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-relaxed'>
      {post.excerpt}
    </p>
  )
}

function SearchResultTags({ post }: { post: BlogPost }) {
  if (!post.tags || post.tags.length === 0) return null
  return (
    <div className='flex items-center gap-1.5 mt-2 flex-wrap'>
      {post.tags.map((tag) => (
        <span
          key={tag}
          className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[length:var(--text-10)] bg-[var(--bg-inset)] text-[var(--text-tertiary)]'
        >
          <Tag className='w-2.5 h-2.5' />
          {tag}
        </span>
      ))}
    </div>
  )
}

function SearchResultRow({
  post,
  selected,
  locale,
  onHover,
}: {
  post: BlogPost
  selected: boolean
  locale: BlogLocale
  onHover: () => void
}) {
  return (
    <a
      href={`/posts/${post.slug}`}
      onMouseEnter={onHover}
      className={`block p-3 rounded-lg text-left transition-colors ${
        selected ? 'bg-[var(--accent-softer)] border-l-2 border-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
      }`}
    >
      <SearchResultTitle post={post} selected={selected} locale={locale} />
      <SearchResultExcerpt post={post} />
      <SearchResultTags post={post} />
    </a>
  )
}

function SearchFooter({
  query,
  resultCount,
  total,
  locale,
}: {
  query: string
  resultCount: number
  total: number
  locale: BlogLocale
}) {
  return (
    <div className='px-4 py-2 bg-[var(--bg-raised)] border-t border-[var(--border-subtle)] text-[length:var(--text-11)] text-[var(--text-quaternary)] flex items-center justify-between'>
      <span>
        {query.trim()
          ? t('search.footer_matched', { total, count: resultCount }, locale)
          : t('search.footer_idle', {}, locale)}
      </span>
      <div className='flex items-center gap-3'>
        <span>{t('search.key_nav', {}, locale)}</span>
        <span>{t('search.key_open', {}, locale)}</span>
        <span>{t('search.key_esc', {}, locale)}</span>
      </div>
    </div>
  )
}