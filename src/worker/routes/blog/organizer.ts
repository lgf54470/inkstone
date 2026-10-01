import { Hono } from 'hono'
import type { BlogCategory, BlogTag } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidId, newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { createScopedFolder, deleteScopedFolder, listScopedFolders, updateScopedFolder } from '../../lib/scoped-organizer'
import type { BlogCategoryCountsRow, BlogCategoryRow, BlogTagRow } from '../../db/rows'
import { blogToggleGroupSchema } from './schemas'
import { blogScopedFolderSchema } from './schemas'
import { blogTagCreateSchema } from './schemas'
import { blogTagPatchSchema } from './schemas'
import { blogTagMergeSchema } from './schemas'
import { blogCategoryCreateSchema } from './schemas'
import { blogCategoryPatchSchema } from './schemas'
import { blogPostTagCountsStatement, type BlogPostTagCountRow } from './post-counts'
import { blogTagNeedles } from './tag-needles'
import { BLOG_TAG_SELECT, moveBlogTagMemberships, resolveBlogTag } from './tag-membership'

export function registerBlogOrganizerRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogFolderRoutes(blogManageRoutes)
  registerBlogTagRoutes(blogManageRoutes)
  registerBlogToggleGroupRoute(blogManageRoutes)
  registerBlogCategoryRoutes(blogManageRoutes)
}

function registerBlogFolderRoutes(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/folders', async (c) => {
    return c.json(await listScopedFolders(c.env.DB, 'blog_folders', c.get('userId')!))
  })

  blogManageRoutes.post('/folders', async (c) => {
    const body = await readJsonValidated(c, blogScopedFolderSchema, JSON_BODY_LIMITS.small)
    return c.json(await createScopedFolder(c.env.DB, 'blog_folders', c.get('userId')!, body), 201)
  })

  blogManageRoutes.patch('/folders/:id', async (c) => {
    const body = await readJsonValidated(c, blogScopedFolderSchema, JSON_BODY_LIMITS.small)
    return c.json(await updateScopedFolder(c.env.DB, 'blog_folders', c.get('userId')!, c.req.param('id'), body))
  })

  blogManageRoutes.delete('/folders/:id', async (c) => {
    await deleteScopedFolder(c.env.DB, 'blog_folders', 'blog_posts', c.get('userId')!, c.req.param('id'))
    return c.json({ ok: true })
  })
}

function registerBlogTagRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogTagsListRoute(blogManageRoutes)
  registerBlogTagCreateRoute(blogManageRoutes)
  registerBlogTagPatchRoute(blogManageRoutes)
  registerBlogTagMergeRoute(blogManageRoutes)
  registerBlogTagDeleteRoute(blogManageRoutes)
}

function registerBlogTagsListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/tags', async (c) => {
    const userId = c.get('userId')!
    const { results: tagRows } = await c.env.DB.prepare(
      `SELECT id, user_id, name, color, is_pinned, created_at
         FROM blog_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, name ASC`,
    ).bind(userId).all<BlogTagRow>()

    // Counted from the tags JSON by SQL: the list used to read every post row back and parse the
    // array here, which was a second full scan beside the one this endpoint already ran for stats.
    const { results: countRows } = await blogPostTagCountsStatement(c.env.DB, userId).all<BlogPostTagCountRow>()
    const countMap = new Map((countRows ?? []).map((row) => [row.name, row.total]))
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
}

function registerBlogTagCreateRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/tags', async (c) => {
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
      const existing = await existingTagAfterConflict(c.env.DB, err, userId, name)
      if (existing) return c.json(existing)
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
}

async function existingTagAfterConflict(
  db: D1Database,
  err: unknown,
  userId: string,
  name: string,
): Promise<BlogTag | null> {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes('UNIQUE') && !msg.includes('constraint')) return null
  const existing = await db.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at FROM blog_tags WHERE user_id = ?1 AND name = ?2`,
  ).bind(userId, name).first<BlogTagRow>()
  if (!existing) return null
  return {
    id: existing.id,
    userId: existing.user_id,
    name: existing.name,
    color: existing.color,
    isPinned: Boolean(existing.is_pinned),
    createdAt: existing.created_at,
  }
}

/**
 * Renaming is the same operation as merging when the destination is already taken (ADR-0007): the
 * memberships move to the destination name, the destination row keeps its own metadata, and the
 * source row is dropped. The client confirms that merge before calling.
 */
function registerBlogTagPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/tags/:id', async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const body = await readJsonValidated(c, blogTagPatchSchema, JSON_BODY_LIMITS.small)

    const resolved = await resolveBlogTag(c.env.DB, userId, id)
    if (!resolved) throw ApiError.notFound('Tag not found')
    if (body.name !== undefined && body.name.trim() === '') throw ApiError.badRequest('Tag name is required')
    const previousName = resolved.name
    const nextName = body.name !== undefined ? body.name.trim().slice(0, 50) : previousName
    const sourceRow = resolved.row
    // Same refusal as the merge route: renaming `a` to `a/b` would rewrite `a/b` into `a/b/b`.
    if (nextName.startsWith(`${previousName}/`)) throw ApiError.badRequest('Cannot rename a tag under its own path')

    if (nextName === previousName) {
      if (sourceRow) {
        return c.json(await updateTagRow(c.env.DB, userId, sourceRow, body, nextName))
      }
      return c.json(await createMissingTag(c.env.DB, userId, id, body))
    }

    await moveBlogTagMemberships(c.env.DB, userId, previousName, nextName)
    const destination = await c.env.DB.prepare(
      `SELECT ${BLOG_TAG_SELECT} FROM blog_tags WHERE user_id = ?1 AND name = ?2`,
    ).bind(userId, nextName).first<BlogTagRow>()

    if (destination && destination.id !== sourceRow?.id) {
      if (sourceRow) {
        await c.env.DB.prepare('DELETE FROM blog_tags WHERE id = ?1 AND user_id = ?2')
          .bind(sourceRow.id, userId).run()
      }
      return c.json(await updateTagRow(c.env.DB, userId, destination, body, destination.name))
    }

    if (!sourceRow) return c.json(await createMissingTag(c.env.DB, userId, id, body, nextName))
    return c.json(await updateTagRow(c.env.DB, userId, sourceRow, body, nextName))
  })
}

/**
 * The explicit merge the sidebar's "merge into" action calls. It is a name move like a rename whose
 * destination is taken, except the target is addressed by id (which is a name for a derived tag) and
 * the source's color/pins survive when the target has no row yet.
 */
function registerBlogTagMergeRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/tags/:id/merge', async (c) => {
    const userId = c.get('userId')!
    const source = await resolveBlogTag(c.env.DB, userId, c.req.param('id'))
    if (!source) throw ApiError.notFound('Tag not found')
    const body = await readJsonValidated(c, blogTagMergeSchema, JSON_BODY_LIMITS.small)
    const target = await resolveBlogTag(c.env.DB, userId, body.targetId)
    if (!target) throw ApiError.notFound('Target tag not found')
    if (target.name === source.name) throw ApiError.badRequest('Cannot merge a tag into itself')
    // Merging into a descendant would rewrite `a/b` into `a/b/b`; refuse instead of inventing paths.
    if (target.name.startsWith(`${source.name}/`)) throw ApiError.badRequest('Cannot merge a tag into its own child')

    const moved = await moveBlogTagMemberships(c.env.DB, userId, source.name, target.name)
    if (source.row) {
      await c.env.DB.prepare('DELETE FROM blog_tags WHERE id = ?1 AND user_id = ?2')
        .bind(source.row.id, userId).run()
      if (!target.row) await insertTagRow(c.env.DB, userId, newId(), target.name, source.row.color, source.row.is_pinned)
    }
    return c.json({ ok: true, moved })
  })
}

async function updateTagRow(
  db: D1Database,
  userId: string,
  row: BlogTagRow,
  body: TagPatchBody,
  name: string,
): Promise<BlogTag> {
  const nextColor = body.color !== undefined ? body.color : row.color
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : row.is_pinned
  await db.prepare(
    `UPDATE blog_tags SET name = ?1, color = ?2, is_pinned = ?3 WHERE id = ?4 AND user_id = ?5`,
  ).bind(name, nextColor, nextPinned, row.id, userId).run()
  return {
    id: row.id,
    userId,
    name,
    color: nextColor,
    isPinned: Boolean(nextPinned),
    createdAt: row.created_at,
  }
}

async function insertTagRow(
  db: D1Database,
  userId: string,
  id: string,
  name: string,
  color: string | null,
  isPinned: number,
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO blog_tags (id, user_id, name, color, is_pinned, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(id, userId, name, color, isPinned, Date.now()).run()
}

interface TagPatchBody {
  name?: string
  color?: string | null
  isPinned?: boolean
}

/**
 * Called when the client patches a tag that has members but no row of its own (a derived tag): the
 * row is materialized so the color/pin the author just chose has somewhere to live.
 */
async function createMissingTag(
  db: D1Database,
  userId: string,
  id: string,
  body: TagPatchBody,
  name = body.name?.trim() || id,
): Promise<BlogTag> {
  const newIdVal = isValidId(id) ? id : newId()
  const now = Date.now()
  await insertTagRow(db, userId, newIdVal, name, body.color ?? null, body.isPinned ? 1 : 0)

  return {
    id: newIdVal,
    userId,
    name,
    color: body.color ?? null,
    isPinned: Boolean(body.isPinned),
    createdAt: now,
  }
}

function registerBlogTagDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/tags/:id', async (c) => {
    const userId = c.get('userId')!
    const resolved = await resolveBlogTag(c.env.DB, userId, c.req.param('id'))
    if (!resolved) throw ApiError.notFound('Tag not found')
    // Deleting a tag is deleting its memberships, the bin included: a trashed post restored later
    // must not bring a deleted tag back (ADR-0007).
    const removed = await moveBlogTagMemberships(c.env.DB, userId, resolved.name, null)
    if (resolved.row) {
      await c.env.DB.prepare(
        'DELETE FROM blog_tags WHERE id = ?1 AND user_id = ?2',
      ).bind(resolved.row.id, userId).run()
    }
    return c.json({ ok: true, removed })
  })
}

function registerBlogToggleGroupRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/batch-toggle-group', async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogToggleGroupSchema, JSON_BODY_LIMITS.small)

    const isPublished = body.enabled ? 1 : 0
    const now = Date.now()
    // Publishing a group stamps the drafts it contains (the batch route's rule, applied here too);
    // unpublishing leaves every publish moment where it was.
    const stampMoment = body.enabled
      ? ', published_at = CASE WHEN is_published = 0 THEN ? ELSE published_at END'
      : ''
    const momentBinds = body.enabled ? [now] : []

    if (body.type === 'folder') {
      const { results: allFolders } = await c.env.DB.prepare(
        'SELECT id, parent_id FROM blog_folders WHERE user_id = ?1',
      ).bind(userId).all<{ id: string; parent_id: string | null }>()

      const ids = expandFolderSubtree(allFolders || [], body.target)
      const placeholders = ids.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE blog_posts SET is_published = ?, updated_at = ?${stampMoment} WHERE user_id = ? AND deleted_at IS NULL AND folder_id IN (${placeholders})`,
      ).bind(isPublished, now, ...momentBinds, userId, ...ids).run()
    } else if (body.type === 'tag') {
      // The same JSON-escaped, LIKE-escaped needles the list filter uses: a tag containing `%`, `_`
      // or a quote is a name here, not a pattern.
      const [exact, descendant] = blogTagNeedles(body.target)
      await c.env.DB.prepare(
        `UPDATE blog_posts SET is_published = ?, updated_at = ?${stampMoment} WHERE user_id = ? AND deleted_at IS NULL AND (tags LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`,
      ).bind(isPublished, now, ...momentBinds, userId, exact, descendant).run()
    }

    return c.json({ ok: true })
  })
}

function expandFolderSubtree(rows: Array<{ id: string; parent_id: string | null }>, root: string): string[] {
  const targetFolderIds = new Set<string>([root])
  let hasAdded = true
  while (hasAdded) {
    hasAdded = false
    for (const f of rows) {
      if (f.parent_id && targetFolderIds.has(f.parent_id) && !targetFolderIds.has(f.id)) {
        targetFolderIds.add(f.id)
        hasAdded = true
      }
    }
  }
  return Array.from(targetFolderIds)
}

function registerBlogCategoryRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogCategoriesListRoute(blogManageRoutes)
  registerBlogCategoryCreateRoute(blogManageRoutes)
  registerBlogCategoryPatchRoute(blogManageRoutes)
  registerBlogCategoryDeleteRoute(blogManageRoutes)
}

function registerBlogCategoriesListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/categories', async (c) => {
    const userId = c.get('userId')!
    const { results } = await c.env.DB
      .prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM blog_posts p
            WHERE p.category_id = c.id AND p.deleted_at IS NULL) as posts_count
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
}

function registerBlogCategoryCreateRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/categories', async (c) => {
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
}

function registerBlogCategoryPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/categories/:id', async (c) => {
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
}

function registerBlogCategoryDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/categories/:id', async (c) => {
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
