import { Hono } from "hono";
import type { BlogCommentStatus } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated, requestClientIp } from "../../lib/request";
import type { BlogCalendarRow, BlogPostPublicRow, BlogPublicCategoryRow, BlogPublicCommentRow, BlogTimelineRow } from "../../db/rows";
import { isBot, parseDeviceType, parseOS, parseBrowser, parseReferrerHost, computeVisitorFingerprint } from "../../lib/share-analytics";
import { blogPublicCommentSchema } from './schemas';
import { getBlogSettings } from './settings';

export function registerBlogPublicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
// --------------------------------------------------------------------------
// Public API Routes for Astro Frontend (CORS enabled)
// --------------------------------------------------------------------------

// Add CORS headers for Astro frontend
blogPublicRoutes.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type')
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }
  await next()
})

// Public site info & settings
blogPublicRoutes.get('/site', async (c) => {
  const settings = await getBlogSettings(c.env.DB)
  return c.json({ settings })
})

// Public posts list with filters & pagination
blogPublicRoutes.get('/posts', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10', 10)))
  const offset = (page - 1) * limit
  const tag = c.req.query('tag')?.trim()
  const categorySlug = c.req.query('category')?.trim()
  const search = c.req.query('search')?.trim()

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

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogPostPublicRow>()

  let items = (results || []).map((row) => ({
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
  }))

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

// Public post detail (increments views)
blogPublicRoutes.get('/posts/:slug', async (c) => {
  const slug = c.req.param('slug')

  const row = await c.env.DB
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

  const now = Date.now()

  // Atomically increment views
  await c.env.DB
    .prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?1')
    .bind(row.id)
    .run()

  // Asynchronously record visit to blog_visits
  try {
    const rawIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || requestClientIp(c) || ''
    const ua = c.req.header('user-agent') || ''
    const country = c.req.header('cf-ipcountry') || c.req.header('x-country') || null
    const region = c.req.header('cf-region') || c.req.header('x-region') || null
    const city = c.req.header('cf-city') || c.req.header('x-city') || null
    const rawReferrer = c.req.header('referer') || null
    const referrerHost = parseReferrerHost(rawReferrer)
    const deviceType = parseDeviceType(ua)
    const os = parseOS(ua)
    const browser = parseBrowser(ua)
    const bot = isBot(ua) ? 1 : 0
    const visitorFp = await computeVisitorFingerprint(rawIp, ua)
    const loggedInUserId = c.get('userId')
    const isOwner = loggedInUserId && loggedInUserId === row.user_id ? 1 : 0

    await c.env.DB
      .prepare(`
        INSERT INTO blog_visits (
          user_id, post_id, slug, visited_at, visitor_fp, country, region, city,
          referrer, referrer_host, device_type, os, browser, language, user_agent,
          is_bot, is_self_referrer, is_owner
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
      `)
      .bind(
        row.user_id,
        row.id,
        row.slug,
        now,
        visitorFp,
        country,
        region,
        city,
        rawReferrer,
        referrerHost,
        deviceType,
        os,
        browser,
        c.req.header('accept-language')?.slice(0, 32) || null,
        ua.slice(0, 256),
        bot,
        0,
        isOwner,
      )
      .run()
  } catch (err) {
    console.error('Failed to log blog visit', err)
  }

  const post = {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: JSON.parse(row.tags || '[]'),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: (row.views || 0) + 1,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }

  // Get previous and next posts for navigation
  const prevPost = await c.env.DB
    .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at < ?1 ORDER BY published_at DESC LIMIT 1')
    .bind(row.published_at)
    .first<{ slug: string; title: string }>()

  const nextPost = await c.env.DB
    .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at > ?1 ORDER BY published_at ASC LIMIT 1')
    .bind(row.published_at)
    .first<{ slug: string; title: string }>()

  return c.json({ post, prevPost: prevPost || null, nextPost: nextPost || null })
})

// Public categories list with post counts
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

// Public tags list with post counts
blogPublicRoutes.get('/tags', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT tags FROM blog_posts WHERE is_published = 1')
    .all<{ tags: string }>()

  const tagCounts: Record<string, number> = {}
  for (const row of results || []) {
    try {
      const arr = JSON.parse(row.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const tagStr = String(t).trim()
          if (tagStr) {
            tagCounts[tagStr] = (tagCounts[tagStr] || 0) + 1
          }
        }
      }
    } catch { /* Corrupt post tags are skipped so one bad row cannot break the dashboard. */ }
  }

  const tags = Object.entries(tagCounts).map(([name, postsCount]) => ({
    name,
    postsCount,
  })).sort((a, b) => b.postsCount - a.postsCount)

  return c.json({ tags })
})

// Public timeline (Archive by year and month)
blogPublicRoutes.get('/timeline', async (c) => {
  const { results } = await c.env.DB
    .prepare(`
      SELECT id, slug, title, published_at, cover_url, tags
      FROM blog_posts
      WHERE is_published = 1
      ORDER BY published_at DESC
    `)
    .all<BlogTimelineRow>()

  interface BlogTimelineEntry {
    id: string
    slug: string
    title: string
    publishedAt: number
    coverUrl: string
    tags: unknown[]
  }
  const timelineMap: Record<number, Record<number, BlogTimelineEntry[]>> = {}
  for (const row of results || []) {
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

  return c.json({ timeline: timelineMap })
})

// Public calendar distribution
blogPublicRoutes.get('/calendar', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT slug, title, published_at FROM blog_posts WHERE is_published = 1 ORDER BY published_at ASC')
    .all<BlogCalendarRow>()

  // Map by YYYY-MM-DD
  const calendarMap: Record<string, { count: number; posts: { slug: string; title: string }[] }> = {}
  for (const row of results || []) {
    const d = new Date(row.published_at)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!calendarMap[dateStr]) {
      calendarMap[dateStr] = { count: 0, posts: [] }
    }
    calendarMap[dateStr].count++
    calendarMap[dateStr].posts.push({ slug: row.slug, title: row.title })
  }

  return c.json({ calendar: calendarMap })
})

// Public comments list for a post
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

// Public submit comment
blogPublicRoutes.post('/comments', async (c) => {
  const body = await readJsonValidated(c, blogPublicCommentSchema, JSON_BODY_LIMITS.note)

  if (!body.postSlug) throw ApiError.badRequest('postSlug is required')
  if (!body.authorName?.trim()) throw ApiError.badRequest('Name is required')
  if (!body.authorEmail?.trim() || !body.authorEmail.includes('@')) {
    throw ApiError.badRequest('Valid email is required')
  }
  if (!body.content?.trim()) throw ApiError.badRequest('Comment content is required')

  const post = await c.env.DB
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
    .bind(body.postSlug)
    .first<{ id: string; allow_comments: number }>()
  if (!post) throw ApiError.notFound('Post not found')
  if (!post.allow_comments) throw ApiError.forbidden('Comments are disabled for this post')

  const settings = await getBlogSettings(c.env.DB)
  const initialStatus: BlogCommentStatus = settings.requireCommentApproval ? 'pending' : 'approved'

  const id = newId()
  const now = Date.now()
  const ip = requestClientIp(c) || null
  const ua = c.req.header('User-Agent') || null
  const avatar = body.authorAvatar || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(body.authorName)}`

  await c.env.DB
    .prepare(`
      INSERT INTO blog_comments (
        id, post_id, parent_id, author_name, author_email, author_url,
        author_avatar, content, status, ip, user_agent, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    `)
    .bind(
      id,
      post.id,
      body.parentId || null,
      body.authorName.trim(),
      body.authorEmail.trim(),
      body.authorUrl?.trim() || null,
      avatar,
      body.content.trim(),
      initialStatus,
      ip,
      ua,
      now,
    )
    .run()

  return c.json({
    ok: true,
    status: initialStatus,
    message:
      initialStatus === 'pending'
        ? 'Comment submitted and pending moderation'
        : 'Comment published successfully',
  })
})
}

