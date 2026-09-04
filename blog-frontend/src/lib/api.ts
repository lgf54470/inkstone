import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSiteInfo,
  TimelineGroup,
  CalendarDayPost,
} from './types'

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
  return 'http://localhost:8787'
}

const API_BASE = getApiBase()

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
]

export const api = {
  async getSiteInfo(): Promise<BlogSiteInfo> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/site`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.site || FALLBACK_SITE_INFO
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
      return await res.json()
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

  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/posts/${encodeURIComponent(slug)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.post || null
    } catch {
      return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null
    }
  },

  async getCategories(): Promise<BlogCategory[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/categories`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.categories || []
    } catch {
      return [
        { id: 'cat-tech', name: '技术随笔', slug: 'tech', color: 'oklch(62% 0.16 252)', postsCount: 1, createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'cat-life', name: '生活与思考', slug: 'life', color: 'oklch(66% 0.13 150)', postsCount: 0, createdAt: Date.now(), updatedAt: Date.now() },
      ]
    }
  },

  async getTags(): Promise<BlogTag[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/tags`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.tags || []
    } catch {
      return [
        { name: 'Inkstone', postsCount: 1 },
        { name: 'Astro', postsCount: 1 },
        { name: 'Markdown', postsCount: 1 },
      ]
    }
  },

  async getTimeline(): Promise<TimelineGroup[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/timeline`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.timeline || []
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
      return data.days || []
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

  async getComments(postId: string): Promise<BlogComment[]> {
    try {
      const res = await fetch(`${API_BASE}/api/blog/public/comments?postId=${encodeURIComponent(postId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.comments || []
    } catch {
      return [
        {
          id: 'demo-c1',
          postId,
          authorName: '墨客',
          content: '排版太惊艳了！和 Inkstone 笔记一模一样，爱了！',
          status: 'approved',
          createdAt: Date.now() - 3600 * 1000 * 5,
          updatedAt: Date.now() - 3600 * 1000 * 5,
        },
      ]
    }
  },

  async submitComment(payload: {
    postId: string
    authorName: string
    authorEmail: string
    authorUrl?: string
    content: string
  }): Promise<{ ok: boolean; message: string; comment?: BlogComment }> {
    const res = await fetch(`${API_BASE}/api/blog/public/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`)
    }
    return data
  },
}
