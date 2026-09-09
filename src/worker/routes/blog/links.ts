import type { z } from 'zod'
import { Hono } from 'hono'
import type { BlogLink, BlogLinkCategory, BlogLinkStats } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import {
  toBlogLink,
  toBlogLinkCategory,
  type BlogLinkCategoryRow,
  type BlogLinkRow,
} from '../../db/rows'
import {
  blogLinkBatchSchema,
  blogLinkCategoryUpsertSchema,
  blogLinkCheckSchema,
  blogLinkFavoriteSchema,
  blogLinkImportSchema,
  blogLinkPinSchema,
  blogLinkReorderSchema,
  blogLinkStatusSchema,
  blogLinkUpsertSchema,
} from './schemas'
import { checkUrlsBatch } from './link-checker'

export function registerBlogLinksRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogLinksGetRoute(blogManageRoutes)
  registerBlogLinksUpsertRoute(blogManageRoutes)
  registerBlogLinksDeleteRoute(blogManageRoutes)
  registerBlogLinksStatusRoute(blogManageRoutes)
  registerBlogLinksPinRoute(blogManageRoutes)
  registerBlogLinksFavoriteRoute(blogManageRoutes)
  registerBlogLinksReorderRoute(blogManageRoutes)
  registerBlogLinksCheckRoute(blogManageRoutes)
  registerBlogLinksBatchRoute(blogManageRoutes)
  registerBlogLinkCategoryUpsertRoute(blogManageRoutes)
  registerBlogLinkCategoryDeleteRoute(blogManageRoutes)
  registerBlogLinksImportRoute(blogManageRoutes)
}

function registerBlogLinksGetRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/links', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const db = c.env.DB

    const [categoriesResult, linksResult] = await Promise.all([
      db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM blog_links l WHERE l.category_id = c.id) as links_count
        FROM blog_link_categories c
        WHERE c.user_id = ?1
        ORDER BY c.sort_order ASC, c.created_at ASC
      `).bind(userId).all<BlogLinkCategoryRow>(),
      db.prepare(`
        SELECT * FROM blog_links
        WHERE user_id = ?1
        ORDER BY is_pinned DESC, pinned_order ASC, sort_order ASC, created_at DESC
      `).bind(userId).all<BlogLinkRow>(),
    ])

    const categories: BlogLinkCategory[] = (categoriesResult.results || []).map(toBlogLinkCategory)
    const links: BlogLink[] = (linksResult.results || []).map(toBlogLink)
    const counts = computeLinkCounts(links)

    return c.json({ links, categories, counts })
  })
}

function computeLinkCounts(links: BlogLink[]): BlogLinkStats {
  const counts: BlogLinkStats = { total: links.length, pending: 0, approved: 0, rejected: 0 }
  for (const l of links) {
    if (l.status === 'pending') counts.pending++
    if (l.status === 'approved') counts.approved++
    if (l.status === 'rejected') counts.rejected++
  }
  return counts
}

function registerBlogLinksUpsertRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogLinkUpsertSchema, JSON_BODY_LIMITS.note)
    const now = Date.now()
    const id = body.id || newId()

    await prepareLinkUpsertStatement(c.env.DB, userId, id, body, now).run()

    const row = await c.env.DB.prepare('SELECT * FROM blog_links WHERE id = ?1')
      .bind(id)
      .first<BlogLinkRow>()
    if (!row) throw ApiError.internal('Failed to load saved link')

    return c.json({ link: toBlogLink(row) })
  })
}

function prepareLinkUpsertStatement(
  db: D1Database,
  userId: string,
  id: string,
  body: z.infer<typeof blogLinkUpsertSchema>,
  now: number,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO blog_links (
      id, user_id, name, url, description, avatar, email, category_id,
      status, is_pinned, pinned_order, is_favorite, sort_order, is_active, clicks,
      created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      avatar = excluded.avatar,
      email = excluded.email,
      category_id = excluded.category_id,
      status = excluded.status,
      is_pinned = excluded.is_pinned,
      pinned_order = excluded.pinned_order,
      is_favorite = excluded.is_favorite,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).bind(
    id,
    userId,
    body.name.trim(),
    body.url.trim(),
    (body.description || '').trim(),
    (body.avatar || '').trim(),
    (body.email || '').trim(),
    body.categoryId || null,
    body.status || 'approved',
    body.isPinned ? 1 : 0,
    body.pinnedOrder || 0,
    body.isFavorite ? 1 : 0,
    body.sortOrder || 0,
    body.isActive !== false ? 1 : 0,
    now,
  )
}

function registerBlogLinksDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/links/:id', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM blog_links WHERE id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .run()
    return c.json({ ok: true })
  })
}

function registerBlogLinksStatusRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/links/:id/status', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const body = await readJsonValidated(c, blogLinkStatusSchema, JSON_BODY_LIMITS.small)
    const now = Date.now()

    await c.env.DB.prepare(`
      UPDATE blog_links
      SET status = ?1, updated_at = ?2
      WHERE id = ?3 AND user_id = ?4
    `).bind(body.status, now, id, userId).run()

    return c.json({ ok: true })
  })
}

function registerBlogLinksPinRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/links/:id/pin', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const body = await readJsonValidated(c, blogLinkPinSchema, JSON_BODY_LIMITS.small)
    const now = Date.now()

    await c.env.DB.prepare(`
      UPDATE blog_links
      SET is_pinned = ?1, updated_at = ?2
      WHERE id = ?3 AND user_id = ?4
    `).bind(body.isPinned ? 1 : 0, now, id, userId).run()

    return c.json({ ok: true })
  })
}

function registerBlogLinksFavoriteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/links/:id/favorite', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const body = await readJsonValidated(c, blogLinkFavoriteSchema, JSON_BODY_LIMITS.small)
    const now = Date.now()

    await c.env.DB.prepare(`
      UPDATE blog_links
      SET is_favorite = ?1, updated_at = ?2
      WHERE id = ?3 AND user_id = ?4
    `).bind(body.isFavorite ? 1 : 0, now, id, userId).run()

    return c.json({ ok: true, isFavorite: body.isFavorite })
  })
}

function registerBlogLinksReorderRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links/reorder', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogLinkReorderSchema, JSON_BODY_LIMITS.note)
    const now = Date.now()

    const stmts = body.orders.map((o) => {
      if (o.pinnedOrder !== undefined) {
        return c.env.DB.prepare(`
          UPDATE blog_links
          SET pinned_order = ?1, updated_at = ?2
          WHERE id = ?3 AND user_id = ?4
        `).bind(o.pinnedOrder, now, o.id, userId)
      }
      return c.env.DB.prepare(`
        UPDATE blog_links
        SET sort_order = ?1, updated_at = ?2
        WHERE id = ?3 AND user_id = ?4
      `).bind(o.sortOrder ?? 0, now, o.id, userId)
    })

    if (stmts.length > 0) {
      await c.env.DB.batch(stmts)
    }
    return c.json({ ok: true, count: stmts.length })
  })
}

function registerBlogLinksCheckRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links/check', requireAuth, async (c) => {
    const body = await readJsonValidated(c, blogLinkCheckSchema, JSON_BODY_LIMITS.note)
    const results = await checkUrlsBatch(body.urls)
    return c.json({ results })
  })
}

function registerBlogLinksBatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links/batch', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogLinkBatchSchema, JSON_BODY_LIMITS.note)
    const db = c.env.DB
    const count = await executeLinksBatch(db, userId, body)
    return c.json({ ok: true, count })
  })
}

function buildBatchItemStatement(
  db: D1Database,
  userId: string,
  id: string,
  action: z.infer<typeof blogLinkBatchSchema>['action'],
  now: number,
  categoryId?: string | null,
  isPinned?: boolean,
  isFavorite?: boolean,
): D1PreparedStatement {
  switch (action) {
    case 'delete':
      return db.prepare('DELETE FROM blog_links WHERE id = ?1 AND user_id = ?2').bind(id, userId)
    case 'approve':
      return db.prepare("UPDATE blog_links SET status = 'approved', updated_at = ?1 WHERE id = ?2 AND user_id = ?3").bind(now, id, userId)
    case 'reject':
      return db.prepare("UPDATE blog_links SET status = 'rejected', updated_at = ?1 WHERE id = ?2 AND user_id = ?3").bind(now, id, userId)
    case 'setCategory':
      return db.prepare('UPDATE blog_links SET category_id = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4').bind(categoryId || null, now, id, userId)
    case 'setPinned':
      return db.prepare('UPDATE blog_links SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4').bind(isPinned ? 1 : 0, now, id, userId)
    case 'pin':
      return db.prepare('UPDATE blog_links SET is_pinned = 1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3').bind(now, id, userId)
    case 'unpin':
      return db.prepare('UPDATE blog_links SET is_pinned = 0, updated_at = ?1 WHERE id = ?2 AND user_id = ?3').bind(now, id, userId)
    case 'setFavorite':
      return db.prepare('UPDATE blog_links SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4').bind(isFavorite ? 1 : 0, now, id, userId)
    case 'favorite':
      return db.prepare('UPDATE blog_links SET is_favorite = 1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3').bind(now, id, userId)
    case 'unfavorite':
      return db.prepare('UPDATE blog_links SET is_favorite = 0, updated_at = ?1 WHERE id = ?2 AND user_id = ?3').bind(now, id, userId)
  }
}

async function executeLinksBatch(
  db: D1Database,
  userId: string,
  body: z.infer<typeof blogLinkBatchSchema>,
): Promise<number> {
  const { action, linkIds, categoryId, isPinned, isFavorite } = body
  const now = Date.now()
  const stmts = linkIds.map((id) =>
    buildBatchItemStatement(db, userId, id, action, now, categoryId, isPinned, isFavorite),
  )

  if (stmts.length > 0) {
    await db.batch(stmts)
  }
  return stmts.length
}

function registerBlogLinkCategoryUpsertRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links/categories', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogLinkCategoryUpsertSchema, JSON_BODY_LIMITS.small)
    const now = Date.now()
    const id = body.id || newId()

    await c.env.DB.prepare(`
      INSERT INTO blog_link_categories (id, user_id, name, icon, parent_id, sort_order, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon = excluded.icon,
        parent_id = excluded.parent_id,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).bind(
      id,
      userId,
      body.name.trim(),
      body.icon?.trim() || null,
      body.parentId || null,
      body.sortOrder || 0,
      now,
    ).run()

    const row = await c.env.DB.prepare('SELECT * FROM blog_link_categories WHERE id = ?1')
      .bind(id)
      .first<BlogLinkCategoryRow>()
    if (!row) throw ApiError.internal('Failed to load category')

    return c.json({ category: toBlogLinkCategory(row) })
  })
}

function registerBlogLinkCategoryDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/links/categories/:id', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const db = c.env.DB

    await db.prepare('UPDATE blog_link_categories SET parent_id = NULL WHERE parent_id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .run()

    await db.prepare('UPDATE blog_links SET category_id = NULL WHERE category_id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .run()

    await db.prepare('DELETE FROM blog_link_categories WHERE id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .run()

    return c.json({ ok: true })
  })
}

function registerBlogLinksImportRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/links/import', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogLinkImportSchema, JSON_BODY_LIMITS.note)
    const db = c.env.DB
    const now = Date.now()

    const categoryIdMap = await importLinkCategories(db, userId, body.categories, now)
    const importedLinksCount = await importLinkItems(db, userId, body.links, categoryIdMap, now)

    return c.json({
      ok: true,
      importedLinks: importedLinksCount,
      importedCategories: Object.keys(categoryIdMap).length,
    })
  })
}

async function importLinkCategories(
  db: D1Database,
  userId: string,
  categories: z.infer<typeof blogLinkImportSchema>['categories'],
  now: number,
): Promise<Record<string, string>> {
  const categoryIdMap: Record<string, string> = {}
  const stmts: D1PreparedStatement[] = []

  for (const cat of categories) {
    const targetId = cat.id || newId()
    if (cat.id) categoryIdMap[cat.id] = targetId

    stmts.push(
      db.prepare(`
        INSERT INTO blog_link_categories (id, user_id, name, icon, parent_id, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          icon = excluded.icon,
          parent_id = excluded.parent_id,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `).bind(
        targetId,
        userId,
        cat.name.trim(),
        cat.icon?.trim() || null,
        cat.parentId || null,
        cat.sortOrder || 0,
        now,
      ),
    )
  }

  if (stmts.length > 0) {
    await db.batch(stmts)
  }
  return categoryIdMap
}

function prepareImportItemStatement(
  db: D1Database,
  userId: string,
  item: z.infer<typeof blogLinkImportSchema>['links'][number],
  targetCatId: string | null,
  now: number,
): D1PreparedStatement {
  const id = item.id || newId()
  return db.prepare(`
    INSERT INTO blog_links (
      id, user_id, name, url, description, avatar, email, category_id,
      status, is_pinned, pinned_order, is_favorite, sort_order, is_active, clicks,
      created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      avatar = excluded.avatar,
      email = excluded.email,
      category_id = excluded.category_id,
      status = excluded.status,
      is_pinned = excluded.is_pinned,
      pinned_order = excluded.pinned_order,
      is_favorite = excluded.is_favorite,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).bind(
    id,
    userId,
    item.name.trim(),
    item.url.trim(),
    (item.description || '').trim(),
    (item.avatar || '').trim(),
    (item.email || '').trim(),
    targetCatId,
    item.status || 'approved',
    item.isPinned ? 1 : 0,
    item.pinnedOrder || 0,
    item.isFavorite ? 1 : 0,
    item.sortOrder || 0,
    item.isActive !== false ? 1 : 0,
    now,
  )
}

async function importLinkItems(
  db: D1Database,
  userId: string,
  links: z.infer<typeof blogLinkImportSchema>['links'],
  categoryIdMap: Record<string, string>,
  now: number,
): Promise<number> {
  const stmts = links.map((item) => {
    const targetCatId = item.categoryId ? (categoryIdMap[item.categoryId] || item.categoryId) : null
    return prepareImportItemStatement(db, userId, item, targetCatId, now)
  })

  if (stmts.length > 0) {
    await db.batch(stmts)
  }
  return stmts.length
}
