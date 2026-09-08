import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSiteInfo,
  TimelineGroup,
  CalendarDayPost,
  BlogPublicLink,
  BlogPublicLinkCategory,
} from './types'
import {
  asArray,
  asRecord,
  normalizeCalendarDay,
  normalizeCategory,
  normalizeComment,
  normalizePost,
  normalizeSiteInfo,
  normalizeTag,
  normalizeTimelineGroup,
} from './normalize'
import { FALLBACK_POSTS, FALLBACK_SITE_INFO } from './fallbacks'
import { POSTS_PER_PAGE_DEFAULT, DEFAULT_API_URL, API_TIMEOUT_MS } from './constants'
import { safeDecodeTag } from './content'

export { extractCoverUrl } from './normalize'

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const custom = window.__INKSTONE_API_URL__
    if (custom && (isLocal || !custom.includes('localhost'))) return custom.replace(/\/+$/, '')
    const meta = document.querySelector('meta[name="inkstone-api-url"]')
    const content = meta?.getAttribute('content')
    if (content && (isLocal || !content.includes('localhost'))) return content.replace(/\/+$/, '')
  }
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_URL) ||
    (typeof process !== 'undefined' && (process.env.PUBLIC_API_URL || process.env.API_URL))
  if (envUrl && (!isProd || !envUrl.includes('localhost'))) return envUrl.replace(/\/+$/, '')
  return DEFAULT_API_URL
}


// 健康状态只在浏览器端记录：SSR 侧失败不代表站点离线，且 Worker 跨请求共享模块实例，
// 不能让一次瞬时失败污染后续请求的渲染。
let degraded = false
const healthListeners = new Set<(degraded: boolean) => void>()

function setDegraded(value: boolean): void {
  if (typeof window === 'undefined') return
  if (degraded === value) return
  degraded = value
  for (const listener of healthListeners) listener(value)
}

/** 当前是否处于 API 降级（离线 fallback）状态 */
export function isApiDegraded(): boolean {
  return degraded
}

/** 订阅 API 健康状态：立即回调当前值，返回取消订阅函数 */
export function subscribeApiHealth(listener: (degraded: boolean) => void): () => void {
  healthListeners.add(listener)
  listener(degraded)
  return () => {
    healthListeners.delete(listener)
  }
}

async function fetchWithTimeout(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  const external = init?.signal
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort)
  }
  try {
    return await fetch(`${getApiBase()}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onExternalAbort)
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  try {
    const res = await fetchWithTimeout(path, init)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    setDegraded(false)
    return data
  } catch (err) {
    // 调用方主动中止（如搜索换词）不代表 API 降级，不标记健康状态
    const userAborted = init?.signal?.aborted === true
    if (!userAborted) setDegraded(true)
    throw err
  }
}

function isSsr(): boolean {
  return typeof import.meta !== 'undefined' && import.meta.env?.SSR === true
}

/**
 * SSR（Cloudflare Worker）侧 API 响应缓存：低频共享接口按 TTL 缓存，
 * 避免每请求回源后端；浏览器端与无 Cache API 环境直接请求。
 * 缓存写入为 best-effort（put 失败不影响主流程）。
 */
async function requestJsonCached(path: string, ttlSeconds: number, init?: RequestInit): Promise<unknown> {
  if (!isSsr() || typeof caches === 'undefined') return requestJson(path, init)
  const cache = await caches.open('inkstone-blog-api-v1')
  const request = new Request(`${API_BASE}${path}`, init)
  const hit = await cache.match(request)
  if (hit) return hit.json()
  const data = await requestJson(path, init)
  try {
    const response = new Response(JSON.stringify(data), {
      headers: { 'Cache-Control': `public, max-age=${ttlSeconds}` },
    })
    await cache.put(request, response)
  } catch (err) {
    console.warn('[api] cache put failed, serving uncached:', err)
  }
  return data
}

export const api = {
  async getSiteInfo(): Promise<BlogSiteInfo> {
    try {
      return normalizeSiteInfo(await requestJsonCached('/api/blog/public/site', 60))
    } catch (err) {
      console.warn('[api.getSiteInfo] request failed, using fallback site info:', err)
      return FALLBACK_SITE_INFO
    }
  },

  async getPosts(options?: {
    categoryId?: string
    tag?: string
    search?: string
    page?: number
    limit?: number
    signal?: AbortSignal
  }): Promise<{ posts: BlogPost[]; total: number; page: number; limit: number; totalPages: number }> {
    try {
      const query = new URLSearchParams()
      if (options?.categoryId) query.set('categoryId', options.categoryId)
      if (options?.tag) query.set('tag', safeDecodeTag(options.tag))
      if (options?.search) query.set('search', options.search)
      if (options?.page) query.set('page', String(options.page))
      if (options?.limit) query.set('limit', String(options.limit))

      const data = asRecord(await requestJson(`/api/blog/public/posts?${query.toString()}`, { signal: options?.signal }))
      const rawPosts = asArray(data.posts)
      const pagination = asRecord(data.pagination)
      const total = typeof pagination.total === 'number' ? pagination.total : (typeof data.total === 'number' ? data.total : rawPosts.length)
      const page = typeof pagination.page === 'number' ? pagination.page : (typeof data.page === 'number' ? data.page : 1)
      const limit = typeof pagination.limit === 'number' ? pagination.limit : (typeof data.limit === 'number' ? data.limit : POSTS_PER_PAGE_DEFAULT)
      const totalPages = typeof pagination.totalPages === 'number' ? pagination.totalPages : (typeof data.totalPages === 'number' ? data.totalPages : Math.max(1, Math.ceil(total / limit)))

      const posts = rawPosts.map(normalizePost)
      return { posts, total, page, limit, totalPages }
    } catch (err) {
      console.warn('[api.getPosts] request failed, using fallback posts:', err)
      let filtered = [...FALLBACK_POSTS]
      if (options?.tag) {
        const cleanTag = safeDecodeTag(options.tag)
        filtered = filtered.filter((p) => p.tags.some((t) => t === cleanTag || t.startsWith(`${cleanTag}/`)))
      }
      if (options?.categoryId) filtered = filtered.filter((p) => p.categoryId === options.categoryId)
      if (options?.search) {
        const s = options.search.toLowerCase()
        filtered = filtered.filter((p) => p.title.toLowerCase().includes(s) || p.excerpt.toLowerCase().includes(s))
      }
      return {
        posts: filtered,
        total: filtered.length,
        page: options?.page || 1,
        limit: options?.limit || POSTS_PER_PAGE_DEFAULT,
        totalPages: 1,
      }
    }
  },

  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    try {
      const data = asRecord(await requestJsonCached(`/api/blog/public/posts/${encodeURIComponent(slug)}`, 300))
      if (!data.post) return null
      return normalizePost(data.post)
    } catch (err) {
      console.warn(`[api.getPostBySlug] request failed for "${slug}", using fallback:`, err)
      return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null
    }
  },

  async getCategories(): Promise<BlogCategory[]> {
    try {
      const data = asRecord(await requestJsonCached('/api/blog/public/categories', 60))
      return asArray(data.categories).map(normalizeCategory)
    } catch (err) {
      console.warn('[api.getCategories] request failed, using fallback categories:', err)
      return [
        { id: 'cat-tech', name: '技术随笔', slug: 'tech', color: 'oklch(62% 0.16 252)', postsCount: 2, createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'cat-life', name: '生活与思考', slug: 'life', color: 'oklch(66% 0.13 150)', postsCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
      ]
    }
  },

  async getTags(): Promise<BlogTag[]> {
    try {
      const data = asRecord(await requestJsonCached('/api/blog/public/tags', 60))
      return asArray(data.tags).map(normalizeTag)
    } catch (err) {
      console.warn('[api.getTags] request failed, using fallback tags:', err)
      return [
        { name: 'Inkstone', postsCount: 1 },
        { name: 'Astro', postsCount: 1 },
        { name: 'Markdown', postsCount: 2 },
        { name: 'showcase', postsCount: 1 },
        { name: 'cheatsheet', postsCount: 1 },
      ]
    }
  },

  async getTimeline(): Promise<TimelineGroup[]> {
    try {
      const data = asRecord(await requestJsonCached('/api/blog/public/timeline', 120))
      if (Array.isArray(data.timeline)) {
        return asArray(data.timeline).map(normalizeTimelineGroup)
      }
      if (data.timeline && typeof data.timeline === 'object') {
        const timeline = asRecord(data.timeline)
        const groups = Object.keys(timeline)
          .map(Number)
          .sort((a, b) => b - a)
          .map((year) => {
            const monthMap = asRecord(timeline[String(year)])
            const months = Object.keys(monthMap).map(Number).sort((a, b) => b - a)
            return {
              year,
              months: months.map((m) => ({ month: m, posts: asArray(monthMap[String(m)]) })),
            }
          })
        return groups.map(normalizeTimelineGroup)
      }
      return []
    } catch (err) {
      console.warn('[api.getTimeline] request failed, using fallback timeline:', err)
      const now = new Date()
      return [
        {
          year: now.getFullYear(),
          months: [
            {
              month: now.getMonth() + 1,
              posts: FALLBACK_POSTS.map((p) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                publishedAt: p.publishedAt,
                coverUrl: p.coverUrl,
                views: p.views,
              })),
            },
          ],
        },
      ]
    }
  },

  async getCalendar(year?: number, month?: number): Promise<CalendarDayPost[]> {
    try {
      const q = new URLSearchParams()
      if (year) q.set('year', String(year))
      if (month) q.set('month', String(month))
      const data = asRecord(await requestJsonCached(`/api/blog/public/calendar?${q.toString()}`, 60))
      if (Array.isArray(data.days)) {
        return asArray(data.days).map(normalizeCalendarDay)
      }
      if (data.calendar && typeof data.calendar === 'object') {
        const calendar = asRecord(data.calendar)
        return Object.entries(calendar).map(([date, item]) => normalizeCalendarDay({ ...asRecord(item), date }))
      }
      return []
    } catch (err) {
      console.warn('[api.getCalendar] request failed, using fallback calendar:', err)
      const today = new Date().toISOString().slice(0, 10)
      return [
        {
          date: today,
          count: 1,
          posts: [{ title: '欢迎来到 Inkstone 博客', slug: 'welcome-to-inkstone-blog' }],
        },
      ]
    }
  },

  async getComments(postSlugOrId: string): Promise<BlogComment[]> {
    try {
      const data = asRecord(await requestJsonCached(`/api/blog/public/comments/${encodeURIComponent(postSlugOrId)}`, 120))
      return asArray(data.comments).map(normalizeComment)
    } catch (err) {
      console.warn(`[api.getComments] request failed for "${postSlugOrId}":`, err)
      return []
    }
  },

  async submitComment(payload: {
    postSlug?: string
    postId?: string
    authorName: string
    authorEmail: string
    authorUrl?: string
    content: string
  }): Promise<{ ok: boolean; message: string; comment?: BlogComment }> {
    const postSlug = payload.postSlug || payload.postId
    let res: Response
    try {
      res = await fetchWithTimeout('/api/blog/public/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postSlug,
          authorName: payload.authorName,
          authorEmail: payload.authorEmail,
          authorUrl: payload.authorUrl,
          content: payload.content,
        }),
      })
    } catch (err) {
      setDegraded(true)
      throw err
    }
    const data = asRecord(await res.json())
    if (!res.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
    }
    return {
      ok: typeof data.ok === 'boolean' ? data.ok : true,
      message: typeof data.message === 'string' ? data.message : 'OK',
      comment: data.comment ? normalizeComment(data.comment) : undefined,
    }
  },
}

function normalizePublicLink(raw: unknown): BlogPublicLink {
  const r = asRecord(raw)
  return {
    id: String(r.id || ''),
    name: String(r.name || ''),
    url: String(r.url || ''),
    description: r.description ? String(r.description) : null,
    avatar: r.avatar ? String(r.avatar) : null,
    categoryId: r.categoryId ? String(r.categoryId) : null,
    isPinned: Boolean(r.isPinned),
    clicks: typeof r.clicks === 'number' ? r.clicks : 0,
  }
}

function normalizePublicLinkCategory(raw: unknown): BlogPublicLinkCategory {
  const r = asRecord(raw)
  return {
    id: String(r.id || ''),
    name: String(r.name || ''),
    icon: r.icon ? String(r.icon) : null,
    parentId: r.parentId ? String(r.parentId) : null,
    sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
  }
}

export async function fetchPublicLinks(): Promise<{ links: BlogPublicLink[]; categories: BlogPublicLinkCategory[] }> {
  try {
    const raw = await requestJson('/api/blog/public/links')
    const rec = asRecord(raw)
    const links = asArray(rec.links).map(normalizePublicLink)
    const categories = asArray(rec.categories).map(normalizePublicLinkCategory)
    return { links, categories }
  } catch {
    return { links: [], categories: [] }
  }
}

export async function submitPublicLinkRequest(data: {
  name: string
  url: string
  description?: string
  avatar?: string
  email?: string
}): Promise<{ ok: boolean; message?: string }> {
  const res = await fetchWithTimeout('/api/blog/public/link-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const rec = asRecord(await res.json().catch(() => ({})))
  if (!res.ok) {
    throw new Error(typeof rec.error === 'string' ? rec.error : `HTTP ${res.status}`)
  }
  return {
    ok: typeof rec.ok === 'boolean' ? rec.ok : true,
    message: typeof rec.message === 'string' ? rec.message : 'OK',
  }
}

export async function recordLinkClick(id: string): Promise<void> {
  await fetchWithTimeout(`/api/blog/public/links/${id}/click`, { method: 'POST' }).catch(() => null)
}