import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSiteInfo,
  TimelineGroup,
  CalendarDayPost,
} from './types'
import { SHOWCASE_CONTENT } from '../data/showcase'

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = (window as any).__INKSTONE_API_URL__
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

export function extractCoverUrl(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const mdMatch = /!\[.*?\]\(([^)\s]+)/.exec(trimmed)
  if (mdMatch) return mdMatch[1]
  const parenMatch = /\(([^)\s]+)\)/.exec(trimmed)
  if (parenMatch) return parenMatch[1]
  return trimmed
}

const FALLBACK_SITE_INFO: BlogSiteInfo = {
  siteName: 'Inkstone Blog',
  subtitle: '静水流深，石上墨香 · 基于 Inkstone & Astro 驱动',
  bio: '记录思考、技术与生活。使用现代化 Markdown 双链笔记与高性能静态博客驱动。',
  authorName: 'Inkstone Author',
  authorAvatar: '',
  socialLinks: {
    github: 'https://github.com/shuaiplus/inkstone',
  },
  postsPerPage: 10,
  requireCommentApproval: false,
}

const FALLBACK_POSTS: BlogPost[] = [
  {
    id: 'demo-1',
    noteId: 'note-1',
    title: '欢迎来到 Inkstone 博客',
    slug: 'welcome-to-inkstone-blog',
    excerpt: '这是一篇演示博文，展示了与 Inkstone 笔记预览 100% 保持一致的高品质排版系统。',
    content: `# 欢迎使用 Inkstone 博客

这是一篇演示博文。基于 **Astro** 现代前端架构与 **Inkstone** 笔记系统紧密联动驱动！

## 🎯 核心特性

- **100% 样式一致性**：与 Inkstone 客户端预览样式像素级复刻，包括标题、引用、代码高亮、公式与表格；
- **全套外观令牌**：支持 7 款传统典雅强调色、浅色/深色/跟随系统、暖纸与纯白背景底色、舒适与紧凑界面密度；
- **组件丰富美观**：包含发文日历组件、动态标签云、时间线归档、即时快捷搜索与双向联动审核评论区；
- **极速高性能**：Astro 架构驱动，页面秒开，SEO 友好！

> “石墨为骨，静水流深。” —— 打造专注纯粹的沉浸式写作与阅读体验。

### 常用数学公式支持

$$
E = mc^2 \\quad \\text{与} \\quad \\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

### 代码块与高亮

\`\`\`typescript
interface BlogPost {
  title: string;
  slug: string;
  isPublished: boolean;
}

export function publish(post: BlogPost) {
  console.log(\`Successfully published: \${post.title}\`);
}
\`\`\`

欢迎在下方留言互动！
`,
    coverUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80',
    categoryId: 'cat-tech',
    tags: ['Inkstone', 'Astro', 'Markdown'],
    isPublished: true,
    publishedAt: Date.now() - 3600 * 1000 * 24,
    allowComments: true,
    isPinned: true,
    views: 128,
    commentsCount: 2,
    createdAt: Date.now() - 3600 * 1000 * 48,
    updatedAt: Date.now(),
  },
  {
    id: 'syntax-showcase',
    noteId: 'note-syntax-showcase',
    title: 'Inkstone 完整 Markdown 语法全景展示',
    slug: 'markdown-syntax-showcase',
    excerpt: '展示 Inkstone 当前所支持的全部 Markdown 语法与扩展功能，包含 14 种 Mermaid 图表、7 种 Chart.js 数据图表及全部自定义扩展样式。',
    content: SHOWCASE_CONTENT,
    coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
    categoryId: 'cat-tech',
    tags: ['markdown', 'showcase', 'cheatsheet', 'inkstone'],
    isPublished: true,
    publishedAt: Date.now() - 3600 * 1000 * 12,
    allowComments: true,
    isPinned: true,
    views: 356,
    commentsCount: 4,
    createdAt: Date.now() - 3600 * 1000 * 24,
    updatedAt: Date.now(),
  },
]

function formatPost(p: any): BlogPost {
  return {
    id: p.id,
    noteId: p.noteId || p.note_id || '',
    title: p.title || '',
    slug: p.slug || '',
    excerpt: p.excerpt || '',
    content: p.content || '',
    coverUrl: extractCoverUrl(p.coverUrl || p.cover_url),
    categoryId: p.categoryId || p.category_id || undefined,
    categoryName: p.categoryName || p.category_name,
    categorySlug: p.categorySlug || p.category_slug,
    tags: Array.isArray(p.tags) ? p.tags : typeof p.tags === 'string' ? JSON.parse(p.tags || '[]') : [],
    isPublished: Boolean(p.isPublished ?? p.is_published ?? true),
    publishedAt: p.publishedAt || p.published_at || Date.now(),
    allowComments: Boolean(p.allowComments ?? p.allow_comments ?? true),
    isPinned: Boolean(p.isPinned ?? p.is_pinned ?? false),
    views: p.views || 0,
    commentsCount: p.commentsCount || p.comments_count || 0,
    createdAt: p.createdAt || p.created_at || Date.now(),
    updatedAt: p.updatedAt || p.updated_at || Date.now(),
  }
}

export const api = {
  async getSiteInfo(): Promise<BlogSiteInfo> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/site`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw = data.settings || data.site || {}
      return {
        siteName: raw.siteName || FALLBACK_SITE_INFO.siteName,
        subtitle: raw.subtitle || FALLBACK_SITE_INFO.subtitle,
        bio: raw.bio || FALLBACK_SITE_INFO.bio,
        authorName: raw.authorName || FALLBACK_SITE_INFO.authorName,
        authorAvatar: raw.authorAvatar || '',
        socialLinks: raw.socialLinks || FALLBACK_SITE_INFO.socialLinks,
        postsPerPage: raw.postsPerPage || 10,
        requireCommentApproval: Boolean(raw.requireCommentApproval),
      }
    } catch {
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
      const data = await res.json()
      const rawPosts: any[] = data.posts || []
      const pagination = data.pagination || {}
      const total = typeof pagination.total === 'number' ? pagination.total : (data.total ?? rawPosts.length)
      const page = pagination.page ?? data.page ?? 1
      const limit = pagination.limit ?? data.limit ?? 10
      const totalPages = pagination.totalPages ?? data.totalPages ?? Math.max(1, Math.ceil(total / limit))

      const posts = rawPosts.map(formatPost)
      return { posts, total, page, limit, totalPages }
    } catch {
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
      const data = await res.json()
      if (!data.post) return null
      return formatPost(data.post)
    } catch {
      return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null
    }
  },

  async getCategories(): Promise<BlogCategory[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/categories`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list: any[] = data.categories || []
      return list.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        color: c.color || 'var(--accent)',
        icon: c.icon || undefined,
        postsCount: c.postsCount ?? c.posts_count ?? 0,
        createdAt: c.createdAt || c.created_at || Date.now(),
        updatedAt: c.updatedAt || c.updated_at || Date.now(),
      }))
    } catch {
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
      const data = await res.json()
      const list: any[] = data.tags || []
      return list.map((t) => ({
        name: t.name,
        postsCount: t.postsCount ?? t.posts_count ?? 0,
      }))
    } catch {
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
      const data = await res.json()
      if (Array.isArray(data.timeline)) {
        return data.timeline
      }
      if (data.timeline && typeof data.timeline === 'object') {
        const groups: TimelineGroup[] = []
        const years = Object.keys(data.timeline).map(Number).sort((a, b) => b - a)
        for (const year of years) {
          const monthMap = data.timeline[year] || {}
          const months = Object.keys(monthMap).map(Number).sort((a, b) => b - a)
          groups.push({
            year,
            months: months.map((m) => ({
              month: m,
              posts: (monthMap[m] || []).map((p: any) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                publishedAt: p.publishedAt || p.published_at,
                coverUrl: extractCoverUrl(p.coverUrl || p.cover_url),
                views: p.views || 0,
              })),
            })),
          })
        }
        return groups
      }
      return []
    } catch {
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
      const data = await res.json()
      if (Array.isArray(data.days)) {
        return data.days
      }
      if (data.calendar && typeof data.calendar === 'object') {
        return Object.entries(data.calendar).map(([date, item]: [string, any]) => ({
          date,
          count: item.count || 0,
          posts: item.posts || [],
        }))
      }
      return []
    } catch {
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
      const data = await res.json()
      const list: any[] = data.comments || []
      return list.map((c) => ({
        id: c.id,
        postId: c.post_id || c.postId,
        parentId: c.parent_id || c.parentId || null,
        authorName: c.author_name || c.authorName,
        authorEmail: c.author_email || c.authorEmail || '',
        authorUrl: c.author_url || c.authorUrl || undefined,
        authorAvatar: c.author_avatar || c.authorAvatar || undefined,
        content: c.content,
        status: c.status || 'approved',
        createdAt: c.created_at || c.createdAt,
        updatedAt: c.updated_at || c.updatedAt,
      }))
    } catch {
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
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`)
    }
    return data
  },
}
