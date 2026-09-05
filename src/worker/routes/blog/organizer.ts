import { Hono } from "hono";
import type { BlogTag, BlogCategory } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { isValidId, newId } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { createScopedFolder, deleteScopedFolder, listScopedFolders, updateScopedFolder } from "../../lib/scoped-organizer";
import { requireAuth } from "../../middleware/auth";
import type { BlogCategoryCountsRow, BlogCategoryRow, BlogTagRow } from "../../db/rows";
import { blogToggleGroupSchema } from './schemas';
import { blogScopedFolderSchema } from './schemas';
import { blogTagCreateSchema } from './schemas';
import { blogTagPatchSchema } from './schemas';
import { blogCategoryCreateSchema } from './schemas';
import { blogCategoryPatchSchema } from './schemas';

export function registerBlogOrganizerRoutes(blogManageRoutes: Hono<AppBindings>): void {
blogManageRoutes.get('/folders', requireAuth, async (c) => {
  return c.json(await listScopedFolders(c.env.DB, 'blog_folders', c.get('userId')!))
})

blogManageRoutes.post('/folders', requireAuth, async (c) => {
  const body = await readJsonValidated(c, blogScopedFolderSchema, JSON_BODY_LIMITS.small)
  return c.json(await createScopedFolder(c.env.DB, 'blog_folders', c.get('userId')!, body), 201)
})

blogManageRoutes.patch('/folders/:id', requireAuth, async (c) => {
  const body = await readJsonValidated(c, blogScopedFolderSchema, JSON_BODY_LIMITS.small)
  return c.json(await updateScopedFolder(c.env.DB, 'blog_folders', c.get('userId')!, c.req.param('id'), body))
})

blogManageRoutes.delete('/folders/:id', requireAuth, async (c) => {
  await deleteScopedFolder(c.env.DB, 'blog_folders', 'blog_posts', c.get('userId')!, c.req.param('id'))
  return c.json({ ok: true })
})

blogManageRoutes.get('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const { results: tagRows } = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at
       FROM blog_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, name ASC`,
  ).bind(userId).all<BlogTagRow>()

  const { results: postsWithTags } = await c.env.DB.prepare(
    `SELECT tags FROM blog_posts WHERE user_id = ?1`,
  ).bind(userId).all<{ tags: string }>()

  const countMap = new Map<string, number>()
  for (const row of postsWithTags || []) {
    try {
      const arr = JSON.parse(row.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const strT = String(t).trim()
          if (strT) countMap.set(strT, (countMap.get(strT) || 0) + 1)
        }
      }
    } catch { /* Corrupt post tags are skipped so one bad row cannot break the dashboard. */ }
  }

  const tagsList: BlogTag[] = (tagRows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    isPinned: Boolean(r.is_pinned),
    postsCount: countMap.get(r.name) || 0,
    createdAt: r.created_at,
  }))

  const knownNames = new Set(tagsList.map((t) => t.name))
  for (const [tagName, count] of countMap.entries()) {
    if (!knownNames.has(tagName)) {
      tagsList.push({
        id: tagName,
        name: tagName,
        color: null,
        isPinned: false,
        postsCount: count,
      })
    }
  }

  return c.json(tagsList)
})

blogManageRoutes.post('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogTagCreateSchema, JSON_BODY_LIMITS.small)
  const name = body.name.trim().slice(0, 50)
  if (!name) throw ApiError.badRequest('Tag name is required')
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const now = Date.now()

  try {
    await c.env.DB.prepare(
      `INSERT INTO blog_tags (id, user_id, name, color, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(id, userId, name, body.color ?? null, now).run()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      const existing = await c.env.DB.prepare(
        `SELECT id, user_id, name, color, is_pinned, created_at FROM blog_tags WHERE user_id = ?1 AND name = ?2`,
      ).bind(userId, name).first<BlogTagRow>()
      if (existing) {
        return c.json({
          id: existing.id,
          userId: existing.user_id,
          name: existing.name,
          color: existing.color,
          isPinned: Boolean(existing.is_pinned),
          createdAt: existing.created_at,
        })
      }
    }
    throw err
  }

  return c.json(
    {
      id,
      userId,
      name,
      color: body.color ?? null,
      isPinned: false,
      createdAt: now,
    },
    201,
  )
})

blogManageRoutes.patch('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  const body = await readJsonValidated(c, blogTagPatchSchema, JSON_BODY_LIMITS.small)

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at FROM blog_tags WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<BlogTagRow>()

  if (!existing) {
    const newIdVal = isValidId(id) ? id : newId()
    const now = Date.now()
    const nextName = body.name?.trim() || id
    await c.env.DB.prepare(
      `INSERT INTO blog_tags (id, user_id, name, color, is_pinned, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(newIdVal, userId, nextName, body.color ?? null, body.isPinned ? 1 : 0, now).run()

    return c.json({
      id: newIdVal,
      userId,
      name: nextName,
      color: body.color ?? null,
      isPinned: Boolean(body.isPinned),
      createdAt: now,
    })
  }

  const nextName = body.name !== undefined ? body.name.trim().slice(0, 50) : existing.name
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned

  await c.env.DB.prepare(
    `UPDATE blog_tags SET name = ?1, color = ?2, is_pinned = ?3 WHERE id = ?4 AND user_id = ?5`,
  ).bind(nextName, nextColor, nextPinned, id, userId).run()

  return c.json({
    id,
    userId,
    name: nextName,
    color: nextColor,
    isPinned: Boolean(nextPinned),
    createdAt: existing.created_at,
  })
})

blogManageRoutes.delete('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  await c.env.DB.prepare(
    `DELETE FROM blog_tags WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).run()
  return c.json({ ok: true })
})

blogManageRoutes.post('/batch-toggle-group', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogToggleGroupSchema, JSON_BODY_LIMITS.small)

  const isPublished = body.enabled ? 1 : 0
  const now = Date.now()

  if (body.type === 'folder') {
    const { results: allFolders } = await c.env.DB.prepare(
      'SELECT id, parent_id FROM blog_folders WHERE user_id = ?1',
    ).bind(userId).all<{ id: string; parent_id: string | null }>()

    const targetFolderIds = new Set<string>([body.target])
    let hasAdded = true
    while (hasAdded) {
      hasAdded = false
      for (const f of allFolders || []) {
        if (f.parent_id && targetFolderIds.has(f.parent_id) && !targetFolderIds.has(f.id)) {
          targetFolderIds.add(f.id)
          hasAdded = true
        }
      }
    }

    const ids = Array.from(targetFolderIds)
    const placeholders = ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE blog_posts SET is_published = ?, updated_at = ? WHERE user_id = ? AND folder_id IN (${placeholders})`,
    ).bind(isPublished, now, userId, ...ids).run()
  } else if (body.type === 'tag') {
    await c.env.DB.prepare(
      `UPDATE blog_posts SET is_published = ?, updated_at = ? WHERE user_id = ? AND (tags LIKE ? OR tags LIKE ?)`,
    ).bind(isPublished, now, userId, `%"${body.target}"%`, `%"${body.target}/%`).run()
  }

  return c.json({ ok: true })
})

// 11. Categories Management
blogManageRoutes.get('/categories', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const { results } = await c.env.DB
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM blog_posts p WHERE p.category_id = c.id) as posts_count
      FROM blog_categories c
      WHERE c.user_id = ?1
      ORDER BY c.position ASC, c.created_at ASC
    `)
    .bind(userId)
    .all<BlogCategoryCountsRow>()

  const categories: BlogCategory[] = (results || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    icon: row.icon,
    position: row.position,
    postsCount: row.posts_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return c.json({ categories })
})

blogManageRoutes.post('/categories', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogCategoryCreateSchema, JSON_BODY_LIMITS.note)

  if (!body.name?.trim()) throw ApiError.badRequest('Name is required')
  const slug = (body.slug?.trim() || body.name.trim().toLowerCase().replace(/\s+/g, '-'))

  const conflict = await c.env.DB
    .prepare('SELECT id FROM blog_categories WHERE user_id = ?1 AND slug = ?2')
    .bind(userId, slug)
    .first()
  if (conflict) throw ApiError.conflict('Category with this slug already exists')

  const id = newId()
  const now = Date.now()
  await c.env.DB
    .prepare(`
      INSERT INTO blog_categories (id, user_id, name, slug, description, color, icon, position, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8)
    `)
    .bind(id, userId, body.name.trim(), slug, body.description || '', body.color || null, body.icon || null, now)
    .run()

  return c.json({
    category: {
      id,
      userId,
      name: body.name.trim(),
      slug,
      description: body.description || '',
      color: body.color || null,
      icon: body.icon || null,
      position: 0,
      postsCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  })
})

blogManageRoutes.patch('/categories/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogCategoryPatchSchema, JSON_BODY_LIMITS.note)

  const current = await c.env.DB
    .prepare('SELECT * FROM blog_categories WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .first<BlogCategoryRow>()
  if (!current) throw ApiError.notFound('Category not found')

  const now = Date.now()
  await c.env.DB
    .prepare(`
      UPDATE blog_categories SET
        name = COALESCE(?1, name),
        slug = COALESCE(?2, slug),
        description = COALESCE(?3, description),
        color = COALESCE(?4, color),
        icon = COALESCE(?5, icon),
        position = COALESCE(?6, position),
        updated_at = ?7
      WHERE id = ?8
    `)
    .bind(
      body.name?.trim() ?? null,
      body.slug?.trim() ?? null,
      body.description !== undefined ? body.description : null,
      body.color !== undefined ? body.color : null,
      body.icon !== undefined ? body.icon : null,
      body.position !== undefined ? body.position : null,
      now,
      id,
    )
    .run()

  return c.json({ ok: true })
})

blogManageRoutes.delete('/categories/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!

  await c.env.DB
    .prepare('DELETE FROM blog_categories WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .run()

  await c.env.DB
    .prepare('UPDATE blog_posts SET category_id = NULL WHERE category_id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .run()

  return c.json({ ok: true })
})
}

