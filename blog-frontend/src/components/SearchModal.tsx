import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Calendar, Tag, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import type { BlogPost } from '../lib/types'

export default function SearchModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasLoadedRef = useRef(false)

  // Listen for open/close/keyboard shortcuts
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

  // Focus and pre-fetch posts in memory on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 30)

      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true
        setLoading(true)
        api
          .getPosts({ limit: 100 })
          .then((res) => {
            setPosts(res.posts || [])
          })
          .catch((err) => {
            console.error('Failed to pre-fetch search posts:', err)
          })
          .finally(() => {
            setLoading(false)
          })
      }
    } else {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Pure in-memory instantaneous search filter (0ms delay)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    return posts
      .filter((post) => {
        const titleMatch = post.title.toLowerCase().includes(q)
        const excerptMatch = post.excerpt?.toLowerCase().includes(q)
        const tagsMatch = post.tags?.some((t) => t.toLowerCase().includes(q))
        return titleMatch || excerptMatch || tagsMatch
      })
      .slice(0, 8)
  }, [query, posts])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = results[selectedIndex]
      if (selected) {
        window.location.href = `/posts/${selected.slug}`
      }
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto flex items-start justify-center pt-20 px-4 transition-[visibility] duration-200 ${
        isOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-200 ease-out ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Dialog box */}
      <div
        className={`relative w-full max-w-xl bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl border border-[var(--border-default)] shadow-2xl overflow-hidden z-10 transition-all duration-200 ease-out transform ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onKeyDown={handleKeyDownList}
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-raised)]">
          <Search className="w-5 h-5 text-[var(--text-tertiary)] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文章标题、摘要、标签... (↑↓ 选择，Enter 确认)"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[var(--text-quaternary)] text-[var(--text-primary)]"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin shrink-0" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-quaternary)] bg-[var(--bg-base)]">
              ESC
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim() === '' ? (
            <div className="py-10 text-center text-xs text-[var(--text-tertiary)]">
              输入关键字进行全站极速搜索 (Cmd+K)
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-10 text-center text-xs text-[var(--text-tertiary)]">
              未找到与 &quot;{query}&quot; 相关的文章
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((post, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <a
                    key={post.id}
                    href={`/posts/${post.slug}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`block p-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-softer)] border-l-2 border-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-sm font-semibold truncate ${
                          isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {post.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-quaternary)] shrink-0">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {post.excerpt && (
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-relaxed">
                        {post.excerpt}
                      </p>
                    )}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-inset)] text-[var(--text-tertiary)]"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </a>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-[var(--bg-raised)] border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-quaternary)] flex items-center justify-between">
          <span>
            {results.length > 0 ? `匹配到 ${results.length} 篇相关文章` : `已就绪 ${posts.length} 篇博文索引`}
          </span>
          <div className="flex items-center gap-3">
            <span>导航: ↑ ↓</span>
            <span>打开: ↵</span>
            <span>退出: ESC</span>
          </div>
        </div>
      </div>
    </div>
  )
}
