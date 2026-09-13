import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import type { BlogCalendarRow, BlogPostPublicRow, BlogPublicCategoryRow, BlogTimelineRow } from '../../db/rows'
import { escapeLike } from '../../lib/like'
import { recordBlogVisit } from './visits'
import { safeDecodeTagParam, summarizePostTagCounts } from './helpers'


import { registerMusicPublicRoutes } from '../music'
import { getBlogSettings } from './settings'
import { registerBlogPublicCommentsRoutes } from './public-comments'
import { registerBlogPublicLinksRoutes } from './public-links'

export function registerBlogPublicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogCorsMiddleware(blogPublicRoutes)
  registerBlogCacheMiddleware(blogPublicRoutes)
  registerBlogSiteRoute(blogPublicRoutes)
  registerBlogPublicPostsRoutes(blogPublicRoutes)
  registerBlogPublicCategoriesRoute(blogPublicRoutes)
  registerBlogPublicTagsRoute(blogPublicRoutes)
  registerBlogPublicTimelineRoute(blogPublicRoutes)
  registerBlogPublicCalendarRoute(blogPublicRoutes)
  registerBlogPublicCommentsRoutes(blogPublicRoutes)
  registerBlogPublicLinksRoutes(blogPublicRoutes)
  registerPublicMusicRoutes(blogPublicRoutes)
}

// The blog player reads the owner's music library read-only, gated by the publish switch.
function registerPublicMusicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  const musicPublicRoutes = new Hono<AppBindings>()
  registerMusicPublicRoutes(musicPublicRoutes)
  blogPublicRoutes.route('/music', musicPublicRoutes)
}

// Audio and artwork routes build their own Response, which drops headers set on the context,
// so the origin has to be stamped on the final response to keep cross-origin playback working.
function registerBlogCorsMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Origin', '*')
      c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      c.header('Access-Control-Allow-Headers', 'Content-Type')
      return c.body(null, 204)
    }
    await next()
    c.res.headers.set('Access-Control-Allow-Origin', '*')
  })
}

function registerBlogCacheMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    await next()
    // Routes that know their own lifetime (artwork, audio) keep the header they set.
    if (c.req.method === 'GET' && c.res.status === 200 && !c.res.headers.has('Cache-Control')) {
      c.res.headers.set(
        'Cache-Control',
        'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      )
    }
  })
}

function registerBlogSiteRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/site', async (c) => {
    const settings = await getBlogSettings(c.env.DB)
    return c.json({ settings })
  })
}

function registerBlogPublicPostsRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogPublicPostsListRoute(blogPublicRoutes)
  registerBlogPublicPostDetailRoute(blogPublicRoutes)
}

function registerBlogPublicPostsListRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/posts', async (c) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10', 10)))
    const offset = (page - 1) * limit
    const tag = safeDecodeTagParam(c.req.query('tag'))
    const categorySlug = c.req.query('category')?.trim()
    const search = c.req.query('search')?.trim()

    const pageQuery = blogPublicPostsQuery({ categorySlug, search, tag }, limit, offset)
    const [pageResult, countRow] = await Promise.all([
      c.env.DB.prepare(pageQuery.sql).bind(...pageQuery.params).all<BlogPostPublicRow>(),
      c.env.DB.prepare(blogPublicPostsCountQuery({ categorySlug, search, tag }).sql).bind(...blogPublicPostsCountQuery({ categorySlug, search, tag }).params).first<{ n: number }>(),
    ])

    const total = countRow?.n ?? 0

    return c.json({
      posts: (pageResult.results || []).map(toPublicPostSummary),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  })
}

interface PublicPostsFilter {
  categorySlug?: string
  search?: string
  tag?: string
}

// A blog tag lives inside a JSON array column, so the LIKE needle must be the
// JSON-escaped tag text, LIKE-escaped on top (ESCAPE '\\'); the second
// pattern keeps the parent-tag-matches-descendants hierarchy semantics.
function blogTagNeedles(tag: string): [string, string] {
  const inner = escapeLike(JSON.stringify(tag).slice(1, -1))
  return [`%"${inner}"%`, `%"${inner}/%`]
}

function blogPublicPostsWhere(filter: PublicPostsFilter): { clauses: string; params: unknown[] } {
  const clauses = ['p.is_published = 1']
  const params: unknown[] = []
  let idx = 1

  if (filter.categorySlug) {
    clauses.push(`c.slug = ?${idx++}`)
    params.push(filter.categorySlug)
  }

  if (filter.search) {
    clauses.push(`(p.title LIKE ?${idx} OR p.excerpt LIKE ?${idx} OR p.content LIKE ?${idx})`)
    params.push(`%${filter.search}%`)
    idx++
  }

  if (filter.tag) {
    const [exact, descendant] = blogTagNeedles(filter.tag)
    clauses.push(`(p.tags LIKE ?${idx} ESCAPE '\\' OR p.tags LIKE ?${idx + 1} ESCAPE '\\')`)
    params.push(exact, descendant)
    idx += 2
  }

  return { clauses: clauses.join(' AND '), params }
}

function blogPublicPostsQuery(filter: PublicPostsFilter, limit: number, offset: number): { sql: string; params: unknown[] } {
  const { clauses, params } = blogPublicPostsWhere(filter)
  const sql = `
    SELECT p.id, p.slug, p.title, p.excerpt, p.cover_url, p.category_id, p.tags,
           p.views, p.published_at, p.updated_at,
           c.name as category_name, c.slug as category_slug,
           (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
    FROM blog_posts p
    LEFT JOIN blog_categories c ON p.category_id = c.id
    WHERE ${clauses}
    ORDER BY p.is_pinned DESC, p.published_at DESC
    LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
  `
  return { sql, params: [...params, limit, offset] }
}

function blogPublicPostsCountQuery(filter: PublicPostsFilter): { sql: string; params: unknown[] } {
  const { clauses, params } = blogPublicPostsWhere(filter)
  return {
    sql: `SELECT COUNT(*) AS n FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE ${clauses}`,
    params,
  }
}

function toPublicPostSummary(row: BlogPostPublicRow): {
  id: string
  slug: string
  title: string
  excerpt: string
  coverUrl: string
  categoryId: string | null
  categoryName: string | null
  categorySlug: string | null
  tags: string[]
  views: number
  commentsCount: number
  publishedAt: number
  updatedAt: number
} {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: JSON.parse(row.tags || '[]'),
    views: row.views || 0,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

function registerBlogPublicPostDetailRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/posts/:slug', async (c) => {
    const slug = c.req.param('slug')
    const row = await loadPublicPostBySlug(c.env.DB, slug)

    const now = Date.now()

    await c.env.DB
      .prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?1')
      .bind(row.id)
      .run()

    await recordBlogVisit(c, row, now)

    const post = {
      ...toPublicPostSummary(row),
      noteId: row.note_id,
      content: row.content,
      allowComments: Boolean(row.allow_comments),
      isPinned: Boolean(row.is_pinned),
      views: (row.views || 0) + 1,
    }

    const prevPost = await loadAdjacentPost(c.env.DB, row.published_at, false)
    const nextPost = await loadAdjacentPost(c.env.DB, row.published_at, true)

    return c.json({ post, prevPost, nextPost })
  })
}

async function loadPublicPostBySlug(db: D1Database, slug: string): Promise<BlogPostPublicRow> {
  const row = await db
    .prepare(`
      SELECT p.*,
        c.name as category_name, c.slug as category_slug,
        (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE p.slug = ?1 AND p.is_published = 1
    `)
    .bind(slug)
    .first<BlogPostPublicRow>()

  if (!row) {
    throw ApiError.notFound('Post not found')
  }
  return row
}

async function loadAdjacentPost(db: D1Database, publishedAt: number, newer: boolean): Promise<{ slug: string; title: string } | null> {
  const row = newer
    ? await db
        .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at > ?1 ORDER BY published_at ASC LIMIT 1')
        .bind(publishedAt)
        .first<{ slug: string; title: string }>()
    : await db
        .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at < ?1 ORDER BY published_at DESC LIMIT 1')
        .bind(publishedAt)
        .first<{ slug: string; title: string }>()
  return row || null
}

function registerBlogPublicCategoriesRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/categories', async (c) => {
    const { results } = await c.env.DB
      .prepare(`
        SELECT c.id, c.name, c.slug, c.description, c.color, c.icon,
          COUNT(p.id) as posts_count
        FROM blog_categories c
        LEFT JOIN blog_posts p ON c.id = p.category_id AND p.is_published = 1
        GROUP BY c.id
        ORDER BY c.position ASC, c.created_at ASC
      `)
      .all<BlogPublicCategoryRow>()

    return c.json({ categories: results || [] })
  })
}

function registerBlogPublicTagsRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/tags', async (c) => {
    const { results } = await c.env.DB
      .prepare('SELECT tags FROM blog_posts WHERE is_published = 1')
      .all<{ tags: string }>()

    const tagCounts = summarizePostTagCounts(results || [])
    const tags = Array.from(tagCounts.entries()).map(([name, postsCount]) => ({
      name,
      postsCount,
    })).sort((a, b) => b.postsCount - a.postsCount)

    return c.json({ tags })
  })
}

function registerBlogPublicTimelineRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/timeline', async (c) => {
    const { results } = await c.env.DB
      .prepare(`
        SELECT id, slug, title, published_at, cover_url, tags, views
        FROM blog_posts
        WHERE is_published = 1
        ORDER BY published_at DESC
      `)
      .all<BlogTimelineRow>()

    return c.json({ timeline: buildBlogTimelineMap(results || []) })
  })
}

interface BlogTimelineEntry {
  id: string
  slug: string
  title: string
  publishedAt: number
  coverUrl: string
  tags: unknown[]
  views: number
}

function buildBlogTimelineMap(rows: BlogTimelineRow[]): Record<number, Record<number, BlogTimelineEntry[]>> {
  const timelineMap: Record<number, Record<number, BlogTimelineEntry[]>> = {}
  for (const row of rows) {
    const d = new Date(row.published_at)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    if (!timelineMap[year]) timelineMap[year] = {}
    if (!timelineMap[year][month]) timelineMap[year][month] = []
    timelineMap[year][month].push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.published_at,
      coverUrl: row.cover_url,
      tags: JSON.parse(row.tags || '[]'),
      views: row.views || 0,
    })
  }
  return timelineMap
}

function registerBlogPublicCalendarRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/calendar', async (c) => {
    const { results } = await c.env.DB
      .prepare('SELECT slug, title, published_at FROM blog_posts WHERE is_published = 1 ORDER BY published_at ASC')
      .all<BlogCalendarRow>()

    return c.json({ calendar: buildBlogCalendarMap(results || []) })
  })
}

function buildBlogCalendarMap(rows: BlogCalendarRow[]): Record<string, { count: number; posts: { slug: string; title: string }[] }> {
  const calendarMap: Record<string, { count: number; posts: { slug: string; title: string }[] }> = {}
  for (const row of rows) {
    const d = new Date(row.published_at)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!calendarMap[dateStr]) {
      calendarMap[dateStr] = { count: 0, posts: [] }
    }
    calendarMap[dateStr].count++
    calendarMap[dateStr].posts.push({ slug: row.slug, title: row.title })
  }
  return calendarMap
}
