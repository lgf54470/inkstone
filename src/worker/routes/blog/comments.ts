import { Hono } from "hono";
import type { BlogCommentStatus } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import type { BlogCommentModerationRow } from "../../db/rows";
import { blogCommentStatusSchema } from './schemas';
import { blogCommentBatchSchema } from './schemas';
import { toBlogComment } from './helpers';

export function registerBlogCommentsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogCommentsListRoute(blogManageRoutes)
  registerBlogCommentStatusRoute(blogManageRoutes)
  registerBlogCommentDeleteRoute(blogManageRoutes)
  registerBlogCommentsBatchRoute(blogManageRoutes)
}

function registerBlogCommentsListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/comments', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const status = c.req.query('status')
    const postId = c.req.query('postId')
    const search = c.req.query('search')?.trim()
    const { sql, params } = blogCommentsListQuery(userId, { status, postId, search })
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogCommentModerationRow>()
    const comments = (results || []).map(toBlogComment)
    return c.json({ comments })
  })
}

interface BlogCommentsFilter {
  status?: string
  postId?: string
  search?: string
}

function blogCommentsListQuery(userId: string, filter: BlogCommentsFilter): { sql: string; params: unknown[] } {
  const { status, postId, search } = filter
  let sql = `
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM blog_comments c
    JOIN blog_posts p ON c.post_id = p.id
    WHERE p.user_id = ?1
  `
  const params: unknown[] = [userId]
  let idx = 2

  if (status && status !== 'all') {
    sql += ` AND c.status = ?${idx++}`
    params.push(status)
  }

  if (postId) {
    sql += ` AND c.post_id = ?${idx++}`
    params.push(postId)
  }

  if (search) {
    sql += ` AND (c.author_name LIKE ?${idx} OR c.author_email LIKE ?${idx} OR c.content LIKE ?${idx} OR p.title LIKE ?${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += ` ORDER BY c.created_at DESC`

  return { sql, params }
}

function registerBlogCommentStatusRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/comments/:id/status', requireAuth, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogCommentStatusSchema, JSON_BODY_LIMITS.note)

    await assertOwnedBlogComment(c.env.DB, id, userId)

    await c.env.DB
      .prepare('UPDATE blog_comments SET status = ?1 WHERE id = ?2')
      .bind(body.status, id)
      .run()

    return c.json({ ok: true, status: body.status })
  })
}

function registerBlogCommentDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/comments/:id', requireAuth, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!

    await assertOwnedBlogComment(c.env.DB, id, userId)

    await c.env.DB
      .prepare('DELETE FROM blog_comments WHERE id = ?1')
      .bind(id)
      .run()

    return c.json({ ok: true })
  })
}

async function assertOwnedBlogComment(db: D1Database, id: string, userId: string): Promise<void> {
  const comment = await db
    .prepare('SELECT c.id FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE c.id = ?1 AND p.user_id = ?2')
    .bind(id, userId)
    .first()
  if (!comment) throw ApiError.notFound('Comment not found')
}

function registerBlogCommentsBatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/comments/batch', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogCommentBatchSchema, JSON_BODY_LIMITS.note)

    if (!body.commentIds?.length) return c.json({ ok: true, count: 0 })

    const placeholders = body.commentIds.map((_, i) => `?${i + 2}`).join(',')

    if (body.action === 'delete') {
      await c.env.DB
        .prepare(`
          DELETE FROM blog_comments
          WHERE id IN (${placeholders})
          AND post_id IN (SELECT id FROM blog_posts WHERE user_id = ?1)
        `)
        .bind(userId, ...body.commentIds)
        .run()
    } else {
      const targetStatus: BlogCommentStatus =
        body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'spam'

      await c.env.DB
        .prepare(`
          UPDATE blog_comments
          SET status = ?1
          WHERE id IN (${placeholders})
          AND post_id IN (SELECT id FROM blog_posts WHERE user_id = ?2)
        `)
        .bind(targetStatus, userId, ...body.commentIds)
        .run()
    }

    return c.json({ ok: true, count: body.commentIds.length })
  })
}
