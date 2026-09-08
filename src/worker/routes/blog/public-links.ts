import type { Context } from 'hono'
import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated, requestClientIp } from '../../lib/request'
import type { BlogLinkCategoryRow, BlogLinkRow } from '../../db/rows'
import { blogPublicLinkRequestSchema } from './schemas'

export function registerBlogPublicLinksRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerPublicLinksListRoute(blogPublicRoutes)
  registerPublicLinkRequestRoute(blogPublicRoutes)
  registerPublicLinkClickRoute(blogPublicRoutes)
}

function registerPublicLinksListRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/links', async (c) => {
    const db = c.env.DB

    const [categoriesResult, linksResult] = await Promise.all([
      db.prepare(`
        SELECT id, name, icon, parent_id, sort_order
        FROM blog_link_categories
        ORDER BY sort_order ASC, created_at ASC
      `).all<BlogLinkCategoryRow>(),
      db.prepare(`
        SELECT id, name, url, description, avatar, category_id,
          is_pinned, pinned_order, sort_order, clicks, created_at
        FROM blog_links
        WHERE status = 'approved' AND is_active = 1
        ORDER BY is_pinned DESC, pinned_order ASC, sort_order ASC, created_at ASC
      `).all<BlogLinkRow>(),
    ])

    const categories = (categoriesResult.results || []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      parentId: cat.parent_id,
      sortOrder: cat.sort_order,
    }))

    const links = (linksResult.results || []).map((link) => ({
      id: link.id,
      name: link.name,
      url: link.url,
      description: link.description,
      avatar: link.avatar,
      categoryId: link.category_id,
      isPinned: Boolean(link.is_pinned),
      clicks: link.clicks || 0,
      createdAt: link.created_at,
    }))

    return c.json({ categories, links })
  })
}

function registerPublicLinkRequestRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.post('/link-requests', async (c) => {
    const db = c.env.DB
    const body = await readJsonValidated(c, blogPublicLinkRequestSchema, JSON_BODY_LIMITS.note)
    const now = Date.now()

    await enforcePublicRateLimit(c, db, now)
    await checkDuplicateUrl(db, body.url)

    const admin = await db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').first<{ id: string }>()
    const userId = admin?.id || 'default'

    await db.prepare(`
      INSERT INTO blog_links (
        id, user_id, name, url, description, avatar, email, category_id,
        status, is_pinned, pinned_order, sort_order, is_active, clicks,
        created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 'pending', 0, 0, 0, 1, 0, ?8, ?8)
    `).bind(
      newId(),
      userId,
      body.name.trim(),
      body.url.trim(),
      (body.description || '').trim(),
      (body.avatar || '').trim(),
      (body.email || '').trim(),
      now,
    ).run()

    return c.json({
      success: true,
      message: 'Application submitted and pending approval',
    })
  })
}

async function enforcePublicRateLimit(c: Context<AppBindings>, db: D1Database, now: number): Promise<void> {
  const ip = requestClientIp(c)
  if (!ip) return

  const oneMinuteAgo = now - 60_000
  const recent = await db.prepare(`
    SELECT COUNT(*) as cnt FROM blog_links
    WHERE status = 'pending' AND created_at > ?1
  `).bind(oneMinuteAgo).first<{ cnt: number }>()

  if (Number(recent?.cnt ?? 0) >= 5) {
    throw ApiError.tooManyRequests('Too many requests, please try again later')
  }
}

async function checkDuplicateUrl(db: D1Database, rawUrl: string): Promise<void> {
  const cleanUrl = rawUrl.trim()
  const existing = await db.prepare(`
    SELECT id FROM blog_links
    WHERE url = ?1 AND status IN ('pending', 'approved')
    LIMIT 1
  `).bind(cleanUrl).first<{ id: string }>()

  if (existing) {
    throw ApiError.conflict('This site has already been submitted or exists')
  }
}

function registerPublicLinkClickRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.post('/links/:id/click', async (c) => {
    const id = c.req.param('id')
    await c.env.DB.prepare(`
      UPDATE blog_links
      SET clicks = clicks + 1
      WHERE id = ?1 AND is_active = 1
    `).bind(id).run()

    return c.json({ ok: true })
  })
}
