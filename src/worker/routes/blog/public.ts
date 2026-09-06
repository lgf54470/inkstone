import type { z } from 'zod';
import { Hono } from "hono";
import type { BlogCommentStatus } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated, requestClientIp } from "../../lib/request";
import type { BlogCalendarRow, BlogPostPublicRow, BlogPublicCategoryRow, BlogPublicCommentRow, BlogTimelineRow } from "../../db/rows";
import { recordBlogVisit } from './visits';
import { blogPublicCommentSchema } from './schemas';
import { getBlogSettings } from './settings';
import { summarizePostTagCounts } from './helpers';

export function registerBlogPublicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogCorsMiddleware(blogPublicRoutes)
  registerBlogSiteRoute(blogPublicRoutes)
  registerBlogPublicPostsRoutes(blogPublicRoutes)
  registerBlogPublicCategoriesRoute(blogPublicRoutes)
  registerBlogPublicTagsRoute(blogPublicRoutes)
  registerBlogPublicTimelineRoute(blogPublicRoutes)
  registerBlogPublicCalendarRoute(blogPublicRoutes)
  registerBlogPublicCommentsRoutes(blogPublicRoutes)
}

function registerBlogCorsMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204)
    }
    await next()
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
    const tag = c.req.query('tag')?.trim()
    const categorySlug = c.req.query('category')?.trim()
    const search = c.req.query('search')?.trim()

    const { sql, params } = blogPublicPostsQuery({ categorySlug, search })
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogPostPublicRow>()

    let items = (results || []).map(toPublicPostSummary)
    if (tag) {
      items = items.filter((p) => p.tags.includes(tag))
    }

    const total = items.length
    const paginated = items.slice(offset, offset + limit)

    return c.json({
      posts: paginated,
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
}

function blogPublicPostsQuery(filter: PublicPostsFilter): { sql: string; params: unknown[] } {
  const { categorySlug, search } = filter
  let sql = `
    SELECT p.id, p.slug, p.title, p.excerpt, p.cover_url, p.category_id, p.tags,
           p.views, p.published_at, p.updated_at,
           c.name as category_name, c.slug as category_slug,
           (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
    FROM blog_posts p
    LEFT JOIN blog_categories c ON p.category_id = c.id
    WHERE p.is_published = 1
  `
  const params: unknown[] = []
  let idx = 1

  if (categorySlug) {
    sql += ` AND c.slug = ?${idx++}`
    params.push(categorySlug)
  }

  if (search) {
    sql += ` AND (p.title LIKE ?${idx} OR p.excerpt LIKE ?${idx} OR p.content LIKE ?${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += ` ORDER BY p.is_pinned DESC, p.published_at DESC`

  return { sql, params }
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
        SELECT id, slug, title, published_at, cover_url, tags
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

function registerBlogPublicCommentsRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogPublicCommentsListRoute(blogPublicRoutes)
  registerBlogPublicCommentSubmitRoute(blogPublicRoutes)
}

function registerBlogPublicCommentsListRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/comments/:postSlug', async (c) => {
    const postSlug = c.req.param('postSlug')

    const post = await c.env.DB
      .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
      .bind(postSlug)
      .first<{ id: string; allow_comments: number }>()
    if (!post) throw ApiError.notFound('Post not found')

    const { results } = await c.env.DB
      .prepare(`
        SELECT id, post_id, parent_id, author_name, author_url, author_avatar, content, created_at
        FROM blog_comments
        WHERE post_id = ?1 AND status = 'approved'
        ORDER BY created_at ASC
      `)
      .bind(post.id)
      .all<BlogPublicCommentRow>()

    return c.json({
      allowComments: Boolean(post.allow_comments),
      comments: results || [],
    })
  })
}

function registerBlogPublicCommentSubmitRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.post('/comments', async (c) => {
    const body = await readJsonValidated(c, blogPublicCommentSchema, JSON_BODY_LIMITS.note)
    assertPublicCommentValid(body)

    const post = await c.env.DB
      .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
      .bind(body.postSlug)
      .first<{ id: string; allow_comments: number }>()
    if (!post) throw ApiError.notFound('Post not found')
    if (!post.allow_comments) throw ApiError.forbidden('Comments are disabled for this post')

    const settings = await getBlogSettings(c.env.DB)
    const status: BlogCommentStatus = settings.requireCommentApproval ? 'pending' : 'approved'
    const avatar = body.authorAvatar || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(body.authorName)}`

    await publicCommentInsertStatement(c.env.DB, {
      id: newId(),
      postId: post.id,
      body,
      status,
      ip: requestClientIp(c) || null,
      ua: c.req.header('User-Agent') || null,
      avatar,
      now: Date.now(),
    }).run()

    return c.json(publicCommentSubmitResponse(status))
  })
}

function publicCommentInsertStatement(
  db: D1Database,
  params: {
    id: string
    postId: string
    body: z.infer<typeof blogPublicCommentSchema>
    status: BlogCommentStatus
    ip: string | null
    ua: string | null
    avatar: string
    now: number
  },
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO blog_comments (
        id, post_id, parent_id, author_name, author_email, author_url,
        author_avatar, content, status, ip, user_agent, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    `)
    .bind(
      params.id,
      params.postId,
      params.body.parentId || null,
      params.body.authorName.trim(),
      params.body.authorEmail.trim(),
      params.body.authorUrl?.trim() || null,
      params.avatar,
      params.body.content.trim(),
      params.status,
      params.ip,
      params.ua,
      params.now,
    )
}

function publicCommentSubmitResponse(status: BlogCommentStatus): {
  ok: true
  status: BlogCommentStatus
  message: string
} {
  return {
    ok: true,
    status,
    message:
      status === 'pending'
        ? 'Comment submitted and pending moderation'
        : 'Comment published successfully',
  }
}

function assertPublicCommentValid(body: { postSlug: string; authorName?: string; authorEmail?: string; content?: string }): void {
  if (!body.postSlug) throw ApiError.badRequest('postSlug is required')
  if (!body.authorName?.trim()) throw ApiError.badRequest('Name is required')
  if (!body.authorEmail?.trim() || !body.authorEmail.includes('@')) {
    throw ApiError.badRequest('Valid email is required')
  }
  if (!body.content?.trim()) throw ApiError.badRequest('Comment content is required')
}
