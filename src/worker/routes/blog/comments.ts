import { Hono } from 'hono'
import type { BlogCommentsCounts, BlogCommentStatus, BlogSettings } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { escapeLike, likeAny } from '../../lib/like'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import type { BlogCommentModerationRow } from '../../db/rows'
import { blogCommentStatusSchema } from './schemas'
import { blogCommentBatchSchema, blogCommentReplySchema } from './schemas'
import { toBlogComment } from './helpers'
import { getBlogSettings } from './settings'

/** The moderation list is a working set, not the archive: past this the reader narrows the filters. */
export const BLOG_COMMENTS_LIST_LIMIT = 500

export function registerBlogCommentsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogCommentsListRoute(blogManageRoutes)
  registerBlogCommentReplyRoute(blogManageRoutes)
  registerBlogCommentStatusRoute(blogManageRoutes)
  registerBlogCommentDeleteRoute(blogManageRoutes)
  registerBlogCommentsBatchRoute(blogManageRoutes)
}

/**
 * The author answers a reader (FEA-06). The reply is an ordinary comment in the same thread — it
 * carries the parent's post and id — but it is written by the blog's author, so it is approved on
 * arrival (nothing to moderate) and marked so the reader-facing page can say who wrote it.
 */
function registerBlogCommentReplyRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/comments/:id/reply', async (c) => {
    const userId = c.get('userId')!
    const parentId = c.req.param('id')
    const body = await readJsonValidated(c, blogCommentReplySchema, JSON_BODY_LIMITS.comment)
    const parent = await loadReplyParent(c.env.DB, parentId, userId)
    const identity = authorReplyIdentity(await getBlogSettings(c.env.DB, userId))
    const replyId = newId()

    await c.env.DB
      .prepare(`
        INSERT INTO blog_comments (
          id, post_id, parent_id, author_name, author_email, author_url,
          author_avatar, content, status, spam_score, ip, user_agent, created_at, is_owner
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'approved', 0, NULL, NULL, ?9, 1)
      `)
      .bind(replyId, parent.post_id, parentId, identity.name, '', identity.url, identity.avatar, body.content.trim(), Date.now())
      .run()

    return c.json({ ok: true, id: replyId })
  })
}

/** The comment being answered and the post it belongs to; a trashed post's comments are not hers. */
async function loadReplyParent(db: D1Database, id: string, userId: string): Promise<{ post_id: string }> {
  const parent = await db
    .prepare('SELECT c.post_id FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE c.id = ?1 AND p.user_id = ?2 AND p.deleted_at IS NULL')
    .bind(id, userId)
    .first<{ post_id: string }>()
  if (!parent) throw ApiError.notFound('Comment not found')
  return parent
}

/** How the author's own reply introduces itself: the profile name, or the blog itself as fallback. */
function authorReplyIdentity(settings: BlogSettings): { name: string; url: string | null; avatar: string } {
  return {
    name: settings.authorName.trim() || settings.siteName.trim() || 'Blog author',
    url: settings.socialLinks.website?.trim() || null,
    avatar: settings.authorAvatar.trim(),
  }
}

function registerBlogCommentsListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/comments', async (c) => {
    const userId = c.get('userId')!
    const filter = {
      status: c.req.query('status'),
      postId: c.req.query('postId'),
      search: c.req.query('search')?.trim(),
    }
    const listQuery = blogCommentsListQuery(userId, filter)
    const countsQuery = blogCommentsCountsQuery(userId, filter)
    const [list, counts] = await Promise.all([
      c.env.DB.prepare(listQuery.sql).bind(...listQuery.params).all<BlogCommentModerationRow>(),
      c.env.DB.prepare(countsQuery.sql).bind(...countsQuery.params).all<BlogCommentStatusCountRow>(),
    ])
    const comments = (list.results || []).map(toBlogComment)
    return c.json({ comments, counts: toBlogCommentsCounts(counts.results || []) })
  })
}

interface BlogCommentsFilter {
  status?: string
  postId?: string
  search?: string
}

/**
 * One WHERE for the page and the counts. The counts deliberately leave the status out: counting the
 * rows the status filter already narrowed down would draw every other tab as zero, which is what the
 * old client-side count on the filtered array did.
 */
function blogCommentsWhere(userId: string, filter: BlogCommentsFilter, includeStatus: boolean): { clause: string; params: unknown[] } {
  const { status, postId, search } = filter
  // Comments of a trashed post leave the moderation list with it: the comment is waiting on a post
  // the author already put away, and the bin restores both together.
  let clause = 'p.user_id = ?1 AND p.deleted_at IS NULL'
  const params: unknown[] = [userId]
  let idx = 2

  if (includeStatus && status && status !== 'all') {
    clause += ` AND c.status = ?${idx++}`
    params.push(status)
  }

  if (postId) {
    clause += ` AND c.post_id = ?${idx++}`
    params.push(postId)
  }

  if (search) {
    // Same needle rule as the post list: escape what LIKE reads as wildcards before binding it.
    clause += ` AND (${likeAny(['c.author_name', 'c.author_email', 'c.content', 'p.title'], `?${idx}`)})`
    params.push(`%${escapeLike(search)}%`)
  }

  return { clause, params }
}

function blogCommentsListQuery(userId: string, filter: BlogCommentsFilter): { sql: string; params: unknown[] } {
  const { clause, params } = blogCommentsWhere(userId, filter, true)
  const sql = `
    SELECT c.*, p.title as post_title, p.slug as post_slug
    FROM blog_comments c
    JOIN blog_posts p ON c.post_id = p.id
    WHERE ${clause}
    ORDER BY c.created_at DESC
    LIMIT ?${params.length + 1}
  `
  return { sql, params: [...params, BLOG_COMMENTS_LIST_LIMIT] }
}

interface BlogCommentStatusCountRow {
  status: string
  n: number
}

function blogCommentsCountsQuery(userId: string, filter: BlogCommentsFilter): { sql: string; params: unknown[] } {
  const { clause, params } = blogCommentsWhere(userId, filter, false)
  return {
    sql: `SELECT c.status, COUNT(*) as n FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE ${clause} GROUP BY c.status`,
    params,
  }
}

function toBlogCommentsCounts(rows: BlogCommentStatusCountRow[]): BlogCommentsCounts {
  const counts: BlogCommentsCounts = { all: 0, pending: 0, approved: 0, rejected: 0, spam: 0 }
  for (const row of rows) {
    counts.all += row.n
    if (row.status === 'pending' || row.status === 'approved' || row.status === 'rejected' || row.status === 'spam') {
      counts[row.status] = row.n
    }
  }
  return counts
}

function registerBlogCommentStatusRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/comments/:id/status', async (c) => {
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
  blogManageRoutes.delete('/comments/:id', async (c) => {
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
    .prepare('SELECT c.id FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE c.id = ?1 AND p.user_id = ?2 AND p.deleted_at IS NULL')
    .bind(id, userId)
    .first()
  if (!comment) throw ApiError.notFound('Comment not found')
}

// D1 refuses a statement that binds more than 100 variables, and this action binds one per id, so a
// selection wider than that is split rather than handed to the platform to fail on: the ids are
// bound per chunk, and every chunk keeps the same ownership predicate.
const COMMENT_ID_CHUNK = 50

function chunkIds(ids: readonly string[]): string[][] {
  const groups: string[][] = []
  for (let index = 0; index < ids.length; index += COMMENT_ID_CHUNK) {
    groups.push(ids.slice(index, index + COMMENT_ID_CHUNK))
  }
  return groups
}

function registerBlogCommentsBatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/comments/batch', async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogCommentBatchSchema, JSON_BODY_LIMITS.note)

    if (!body.commentIds?.length) return c.json({ ok: true, count: 0 })

    const targetStatus: BlogCommentStatus =
      body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'spam'

    for (const chunk of chunkIds(body.commentIds)) {
      // The ids start after the parameters each branch binds first: one for the delete (the owner),
      // two for the update (status, owner). Numbering them from a shared offset made `?2` mean both
      // the owner and the first id, which the platform answers with a parameter-count error on every
      // call — the update branch had never been asked to change a single comment.
      const statement = body.action === 'delete'
        ? c.env.DB.prepare(`
            DELETE FROM blog_comments
            WHERE id IN (${chunk.map((_, i) => `?${i + 2}`).join(',')})
            AND post_id IN (SELECT id FROM blog_posts WHERE user_id = ?1 AND deleted_at IS NULL)
          `).bind(userId, ...chunk)
        : c.env.DB.prepare(`
            UPDATE blog_comments
            SET status = ?1
            WHERE id IN (${chunk.map((_, i) => `?${i + 3}`).join(',')})
            AND post_id IN (SELECT id FROM blog_posts WHERE user_id = ?2 AND deleted_at IS NULL)
          `).bind(targetStatus, userId, ...chunk)
      await statement.run()
    }

    return c.json({ ok: true, count: body.commentIds.length })
  })
}
