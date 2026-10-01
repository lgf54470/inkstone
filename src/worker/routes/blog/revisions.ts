import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { utf8ByteLength } from '@shared/text-utils'
import type { BlogPostRow, BlogRevisionRow } from '../../db/rows'
import { BLOG_REVISION_LIMIT } from '../../db/schema'
import { assertSlugFree, slugMoveStatements } from './slug-history'
import { pingBlogFeed, postVisibleInFeed } from './feed-ping'
import { waitUntilOf } from './background'

/**
 * Post history (FEA-05, ADR-0008). The current post row is the newest state; `blog_revisions` holds
 * the states a write replaced. Three write paths snapshot the row they are about to rewrite (the
 * patch route, the `/posts` upsert, `/sync`) and the restore path snapshots what it replaces, so a
 * restore is itself restorable. A snapshot never moves `views`, `published_at`, `created_at` or the
 * recycle-bin column: history is about text.
 */

const REVISION_COLUMNS = `id, post_id, user_id, slug, title, excerpt, content, cover_url, category_id,
  folder_id, tags, is_published, allow_comments, is_pinned,
  seo_title, seo_description, seo_image_url, seo_canonical_url, seo_noindex, created_at`

/** The publish-form fields a given write can rewrite; only these make a snapshot worth taking. */
export interface PostContentPatch {
  slug?: string
  title?: string
  excerpt?: string
  content?: string
  coverUrl?: string | null
  categoryId?: string | null
  folderId?: string | null
  tags?: string[]
  seoTitle?: string
  seoDescription?: string
  seoImageUrl?: string | null
  seoCanonicalUrl?: string | null
  seoNoindex?: boolean
}

export function patchTouchesPostContent(body: PostContentPatch): boolean {
  return body.slug !== undefined
    || body.title !== undefined
    || body.excerpt !== undefined
    || body.content !== undefined
    || body.coverUrl !== undefined
    || body.categoryId !== undefined
    || body.folderId !== undefined
    || body.tags !== undefined
    || body.seoTitle !== undefined
    || body.seoDescription !== undefined
    || body.seoImageUrl !== undefined
    || body.seoCanonicalUrl !== undefined
    || body.seoNoindex !== undefined
}

/**
 * The insert plus the retention trim, in that order: the write that snapshots and the write that
 * prunes ride the same batch, so a post can never hold more than the limit. `rowid` orders snapshots
 * written in the same millisecond, which is also the order the list and the trim keep.
 */
export function snapshotRevisionStatements(db: D1Database, post: BlogPostRow, now: number): D1PreparedStatement[] {
  const insert = db.prepare(`
    INSERT INTO blog_revisions (
      id, post_id, user_id, slug, title, excerpt, content, cover_url, category_id, folder_id, tags,
      is_published, allow_comments, is_pinned,
      seo_title, seo_description, seo_image_url, seo_canonical_url, seo_noindex, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
  `).bind(
    newId(), post.id, post.user_id, post.slug, post.title, post.excerpt, post.content, post.cover_url,
    post.category_id, post.folder_id, post.tags, post.is_published, post.allow_comments, post.is_pinned,
    post.seo_title, post.seo_description, post.seo_image_url, post.seo_canonical_url, post.seo_noindex, now,
  )
  const trim = db.prepare(`
    DELETE FROM blog_revisions
     WHERE post_id = ?1
       AND id NOT IN (
         SELECT id FROM blog_revisions WHERE post_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?2
       )
  `).bind(post.id, BLOG_REVISION_LIMIT)
  return [insert, trim]
}

export function registerBlogRevisionsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogRevisionListRoute(blogManageRoutes)
  registerBlogRevisionGetRoute(blogManageRoutes)
  registerBlogRevisionRestoreRoute(blogManageRoutes)
}

/** The list answers "what versions are there" with no bodies, like the notes sidebar's own list. */
function registerBlogRevisionListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/posts/:id/revisions', async (c) => {
    const userId = c.get('userId')!
    const postId = c.req.param('id')
    const owned = await loadLivePostId(c.env.DB, userId, postId)
    if (!owned) throw ApiError.notFound('Post not found')

    const { results } = await c.env.DB.prepare(
      `SELECT id, post_id, title, length(CAST(content AS BLOB)) AS size, created_at
         FROM blog_revisions WHERE post_id = ?1 AND user_id = ?2
         ORDER BY created_at DESC, rowid DESC LIMIT 100`,
    ).bind(postId, userId).all<{ id: string; post_id: string; title: string; size: number; created_at: number }>()

    return c.json({
      revisions: (results || []).map((row) => ({
        id: row.id,
        postId: row.post_id,
        title: row.title,
        size: row.size,
        createdAt: row.created_at,
      })),
    })
  })
}

function registerBlogRevisionGetRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/posts/:id/revisions/:revisionId', async (c) => {
    const userId = c.get('userId')!
    const revision = await loadRevision(c.env.DB, userId, c.req.param('id'), c.req.param('revisionId'))
    if (!revision) throw ApiError.notFound('Revision not found')
    return c.json({ revision: toRevision(revision) })
  })
}

/**
 * Restoring writes the revision's content-bearing fields back onto the post and snapshots the state
 * it replaces, so the restore itself can be undone. The presentation flags (`is_published`,
 * `allow_comments`, `is_pinned`) and the counters stay as they are: they are decisions about the
 * post today, not text that a version preserves (ADR-0008). A revision whose slug another post has
 * taken since is refused rather than silently renamed.
 */
function registerBlogRevisionRestoreRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts/:id/revisions/:revisionId/restore', async (c) => {
    const userId = c.get('userId')!
    const postId = c.req.param('id')
    const current = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
      .bind(postId, userId).first<BlogPostRow>()
    if (!current) throw ApiError.notFound('Post not found')

    const revision = await loadRevision(c.env.DB, userId, postId, c.req.param('revisionId'))
    if (!revision) throw ApiError.notFound('Revision not found')
    if (revision.slug !== current.slug) await assertSlugFree(c.env.DB, userId, revision.slug, postId)

    const now = Date.now()
    const statements = [
      ...snapshotRevisionStatements(c.env.DB, current, now),
      c.env.DB.prepare(`
        UPDATE blog_posts SET
          slug = ?1, title = ?2, excerpt = ?3, content = ?4, cover_url = ?5, category_id = ?6,
          folder_id = ?7, tags = ?8, updated_at = ?9,
          seo_title = ?10, seo_description = ?11, seo_image_url = ?12, seo_canonical_url = ?13, seo_noindex = ?14
        WHERE id = ?15 AND user_id = ?16 AND deleted_at IS NULL
      `).bind(
        revision.slug, revision.title, revision.excerpt, revision.content, revision.cover_url,
        revision.category_id, revision.folder_id, revision.tags, now,
        revision.seo_title, revision.seo_description, revision.seo_image_url, revision.seo_canonical_url,
        revision.seo_noindex, postId, userId,
      ),
      ...slugMoveStatements({ db: c.env.DB, userId, postId, from: current.slug, to: revision.slug, now }),
    ]
    await c.env.DB.batch(statements)
    // The restored text is what the feed shows, so a live post's subscribers are told to refetch.
    if (postVisibleInFeed(current.is_published === 1, current.published_at, now)) void pingBlogFeed(c.env.DB, userId, waitUntilOf(c))
    return c.json({ ok: true })
  })
}

/** Revisions are only offered on a post the author can edit — the recycle bin is not that place. */
async function loadLivePostId(db: D1Database, userId: string, postId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM blog_posts WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
    .bind(postId, userId).first<{ id: string }>()
  return row?.id ?? null
}

async function loadRevision(db: D1Database, userId: string, postId: string, revisionId: string): Promise<BlogRevisionRow | null> {
  return db
    .prepare(`SELECT ${REVISION_COLUMNS} FROM blog_revisions WHERE id = ?1 AND post_id = ?2 AND user_id = ?3`)
    .bind(revisionId, postId, userId).first<BlogRevisionRow>()
}

function toRevision(row: BlogRevisionRow) {
  return {
    id: row.id,
    postId: row.post_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    folderId: row.folder_id,
    tags: row.tags,
    size: utf8ByteLength(row.content),
    createdAt: row.created_at,
  }
}
