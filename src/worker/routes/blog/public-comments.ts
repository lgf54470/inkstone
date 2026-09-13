import type { z } from 'zod'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { BlogCommentStatus } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated, requestClientIp } from '../../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'
import type { BlogPublicCommentRow } from '../../db/rows'
import { blogPublicCommentSchema } from './schemas'
import { getBlogSettings } from './settings'

export function registerBlogPublicCommentsRoutes(blogPublicRoutes: Hono<AppBindings>): void {
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
    const body = await readJsonValidated(c, blogPublicCommentSchema, JSON_BODY_LIMITS.comment)
    assertPublicCommentValid(body)

    const post = await c.env.DB
      .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
      .bind(body.postSlug)
      .first<{ id: string; allow_comments: number }>()
    if (!post) throw ApiError.notFound('Post not found')
    if (!post.allow_comments) throw ApiError.forbidden('Comments are disabled for this post')

    await assertCommentRateBudget(c.env.DB, c, body.postSlug)
    if (body.parentId) await assertParentCommentOnPost(c.env.DB, body.parentId, post.id)

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

const BLOG_COMMENT_IP_BUDGET = { key: '', maxAttempts: 5, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 }
const BLOG_COMMENT_POST_BUDGET = { key: '', maxAttempts: 100, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 }

async function assertCommentRateBudget(db: D1Database, c: Context<AppBindings>, postSlug: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [
      { ...BLOG_COMMENT_IP_BUDGET, key: `blog-comment:ip:${requestClientIp(c)}` },
      { ...BLOG_COMMENT_POST_BUDGET, key: `blog-comment:post:${postSlug}` },
    ])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many comments. Try again in ${error.retryAfterSec} seconds`, { retryAfter: error.retryAfterSec })
    }
    throw error
  }
}

async function assertParentCommentOnPost(db: D1Database, parentId: string, postId: string): Promise<void> {
  const parent = await db
    .prepare('SELECT 1 AS present FROM blog_comments WHERE id = ?1 AND post_id = ?2')
    .bind(parentId, postId)
    .first<{ present: number }>()
  if (!parent) throw ApiError.badRequest('The parent comment does not exist on this post')
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
