import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSiteInfo,
  TimelineGroup,
  CalendarDayPost,
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

export { extractCoverUrl } from './normalize'

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = window.__INKSTONE_API_URL__
    if (custom) return custom.replace(/\/+$/, '')
    const meta = document.querySelector('meta[name="inkstone-api-url"]')
    const content = meta?.getAttribute('content')
    if (content) return content.replace(/\/+$/, '')
  }
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_URL) ||
    (typeof process !== 'undefined' && (process.env.PUBLIC_API_URL || process.env.API_URL))
  if (envUrl) return envUrl.replace(/\/+$/, '')
  return 'https://inkstone.333096.xyz'
}

const API_BASE = getApiBase()

export const api = {
  async getSiteInfo(): Promise<BlogSiteInfo> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/site`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return normalizeSiteInfo(await res.json())
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
  }): Promise<{ posts: BlogPost[]; total: number; page: number; limit: number; totalPages: number }> {
    try {
      const query = new URLSearchParams()
      if (options?.categoryId) query.set('categoryId', options.categoryId)
      if (options?.tag) query.set('tag', options.tag)
      if (options?.search) query.set('search', options.search)
      if (options?.page) query.set('page', String(options.page))
      if (options?.limit) query.set('limit', String(options.limit))

      const res = await fetch(`${API_BASE}/api/blog/public/posts?${query.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
      const rawPosts = asArray(data.posts)
      const pagination = asRecord(data.pagination)
      const total = typeof pagination.total === 'number' ? pagination.total : (typeof data.total === 'number' ? data.total : rawPosts.length)
      const page = typeof pagination.page === 'number' ? pagination.page : (typeof data.page === 'number' ? data.page : 1)
      const limit = typeof pagination.limit === 'number' ? pagination.limit : (typeof data.limit === 'number' ? data.limit : 10)
      const totalPages = typeof pagination.totalPages === 'number' ? pagination.totalPages : (typeof data.totalPages === 'number' ? data.totalPages : Math.max(1, Math.ceil(total / limit)))

      const posts = rawPosts.map(normalizePost)
      return { posts, total, page, limit, totalPages }
    } catch (err) {
      console.warn('[api.getPosts] request failed, using fallback posts:', err)
      let filtered = [...FALLBACK_POSTS]
      if (options?.tag) filtered = filtered.filter((p) => p.tags.includes(options.tag!))
      if (options?.categoryId) filtered = filtered.filter((p) => p.categoryId === options.categoryId)
      if (options?.search) {
        const s = options.search.toLowerCase()
        filtered = filtered.filter((p) => p.title.toLowerCase().includes(s) || p.excerpt.toLowerCase().includes(s))
      }
      return {
        posts: filtered,
        total: filtered.length,
        page: options?.page || 1,
        limit: options?.limit || 10,
        totalPages: 1,
      }
    }
  },

  async getPostBySlug(slug: string, headers?: HeadersInit): Promise<BlogPost | null> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/posts/${encodeURIComponent(slug)}`, {
        headers,
      })
      if (!res.ok) return null
      const data = asRecord(await res.json())
      if (!data.post) return null
      return normalizePost(data.post)
    } catch (err) {
      console.warn(`[api.getPostBySlug] request failed for "${slug}", using fallback:`, err)
      return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null
    }
  },

  async getCategories(): Promise<BlogCategory[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/categories`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
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
      const res = await fetch(`${API_BASE}/api/blog/public/tags`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
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
      const res = await fetch(`${API_BASE}/api/blog/public/timeline`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
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
      const res = await fetch(`${API_BASE}/api/blog/public/calendar?${q.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
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
      const res = await fetch(`${API_BASE}/api/blog/public/comments/${encodeURIComponent(postSlugOrId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = asRecord(await res.json())
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
    const res = await fetch(`${API_BASE}/api/blog/public/comments`, {
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