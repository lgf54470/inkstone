import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import type { BlogTrashRow } from '../../db/rows'
import { toBlogTrashEntry } from './helpers'
import { blogTrashListQuery } from './post-list-query'
import { blogPurgeStatements, chunkPostIds } from './posts-batch'

/**
 * The recycle bin (FEA-04). Deleting a post only marks it (`deleted_at`), so everything the post
 * owned — comments, retired addresses, visit history — waits here with it; a restore clears the mark,
 * a purge erases the row and everything that pointed at it. The bin is not a `status=trash` arm of the
 * management list: it has no pager and its own columns, and the routes that really delete live only
 * here.
 */
export function registerBlogTrashRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerTrashListRoute(blogManageRoutes)
  registerTrashRestoreRoute(blogManageRoutes)
  registerTrashPurgeRoute(blogManageRoutes)
  registerTrashEmptyRoute(blogManageRoutes)
}

function registerTrashListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/trash', async (c) => {
    const userId = c.get('userId')!
    const { sql, params } = blogTrashListQuery(userId)
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogTrashRow>()
    return c.json({ posts: (results || []).map(toBlogTrashEntry) })
  })
}

function registerTrashRestoreRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/trash/:id/restore', async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')

    // The exact inverse of the delete: only a trashed row of this account moves, and a second call
    // answers 404 instead of reporting a restore that did not happen.
    const result = await c.env.DB
      .prepare('UPDATE blog_posts SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NOT NULL')
      .bind(Date.now(), id, userId)
      .run()
    if (!result.meta.changes) throw ApiError.notFound('Post not found in the trash')

    return c.json({ ok: true })
  })
}

function registerTrashPurgeRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/trash/:id', async (c) => {
    const userId = c.get('userId')!
    const purged = await purgeTrashPosts(c.env.DB, userId, [c.req.param('id')])
    if (!purged) throw ApiError.notFound('Post not found in the trash')

    return c.json({ ok: true })
  })
}

function registerTrashEmptyRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/trash/empty', async (c) => {
    const userId = c.get('userId')!
    const { results } = await c.env.DB
      .prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND deleted_at IS NOT NULL')
      .bind(userId)
      .all<{ id: string }>()

    const purged = await purgeTrashPosts(c.env.DB, userId, (results || []).map((row) => row.id))
    return c.json({ purged })
  })
}

/**
 * Really erases trashed posts and everything that pointed at them. The ids are filtered to rows that
 * are still in the bin before anything is deleted: a purge statement removes the children ahead of
 * the parent, so a live id must never reach one — its comments would go while the post stayed.
 */
async function purgeTrashPosts(db: D1Database, userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  let purged = 0
  for (const chunk of chunkPostIds(ids)) {
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(', ')
    const { results } = await db
      .prepare(`SELECT id FROM blog_posts WHERE user_id = ?1 AND deleted_at IS NOT NULL AND id IN (${placeholders})`)
      .bind(userId, ...chunk)
      .all<{ id: string }>()
    const trashed = (results || []).map((row) => row.id)
    if (!trashed.length) continue
    const statements = blogPurgeStatements(userId, trashed)
      .map((statement) => db.prepare(statement.sql).bind(...statement.binds))
    const outcomes = await db.batch(statements)
    // The post delete is the last statement of the batch, so its change count is the batch's answer.
    purged += outcomes.at(-1)?.meta.changes ?? 0
  }
  return purged
}
