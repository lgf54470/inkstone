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
import { blogOwnerOf } from './owner'

export function registerBlogPublicCommentsRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogPublicCommentsListRoute(blogPublicRoutes)
  registerBlogPublicCommentSubmitRoute(blogPublicRoutes)
}

/**
 * The post a comment page is about, scoped to the addressed blog: another account's post with the
 * same slug is a different post, and answering with it would be the cross-tenant read this module
 * was missing.
 */
async function loadCommentedPost(
  db: D1Database,
  ownerId: string,
  slugOrId: string,
): Promise<{ id: string; allow_comments: number }> {
  const post = await db
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1 AND user_id = ?2')
    .bind(slugOrId, ownerId)
    .first<{ id: string; allow_comments: number }>()
  if (!post) throw ApiError.notFound('Post not found')
  return post
}

/** One screen of a comment thread; a post past it shows its newest approved comments. */
const PUBLIC_COMMENT_LIMIT = 500

function registerBlogPublicCommentsListRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/comments/:postSlug', async (c) => {
    const post = await loadCommentedPost(c.env.DB, blogOwnerOf(c).userId, c.req.param('postSlug'))

    // The page renders the thread oldest first, so the query takes the newest rows under the
    // ceiling (the ones a reader scrolls to) and hands them back in that same render order.
    const { results } = await c.env.DB
      .prepare(`
        SELECT id, post_id, parent_id, author_name, author_url, author_avatar, content, created_at
        FROM blog_comments
        WHERE post_id = ?1 AND status = 'approved'
        ORDER BY created_at DESC LIMIT ${PUBLIC_COMMENT_LIMIT}
      `)
      .bind(post.id)
      .all<BlogPublicCommentRow>()

    return c.json({
      allowComments: Boolean(post.allow_comments),
      comments: [...(results || [])].reverse(),
    })
  })
}

function registerBlogPublicCommentSubmitRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.post('/comments', async (c) => {
    const body = await readJsonValidated(c, blogPublicCommentSchema, JSON_BODY_LIMITS.comment)
    assertPublicCommentValid(body)

    const owner = blogOwnerOf(c)
    const post = await loadCommentedPost(c.env.DB, owner.userId, body.postSlug)
    if (!post.allow_comments) throw ApiError.forbidden('Comments are disabled for this post')

    await assertCommentRateBudget(c.env.DB, c, owner.userId, body.postSlug)
    if (body.parentId) await assertParentCommentOnPost(c.env.DB, body.parentId, post.id)

    const settings = await getBlogSettings(c.env.DB, owner.userId)
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

async function assertCommentRateBudget(db: D1Database, c: Context<AppBindings>, ownerId: string, postSlug: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [
      { ...BLOG_COMMENT_IP_BUDGET, key: `blog-comment:ip:${requestClientIp(c)}` },
      // The blog is part of the key: two accounts may publish the same slug, and one of them being
      // under a comment flood must not close the other's form.
      { ...BLOG_COMMENT_POST_BUDGET, key: `blog-comment:post:${ownerId}:${postSlug}` },
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
