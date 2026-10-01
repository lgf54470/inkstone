import type { z } from 'zod'
import { Hono } from 'hono'
import { extractCoverUrl, parseFrontMatter } from '@shared/markdown-utils'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { assertContentSize, clampInt, JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import type { BlogPostIndexRow, BlogPostRow, BlogPostSummaryRow } from '../../db/rows'
import { enqueueBlogFtsStatement } from '../../db/blog-fts'
import { blogPostWriteSchema } from './schemas'
import { blogPostPatchSchema } from './schemas'
import { blogBatchSchema } from './schemas'
import { insertBlogPost, normalizedSlug, postInputFromBody, resolvePostSource, SLUG_RE, updateBlogPost } from './post-write'
import { safeDecodeTagParam, toBlogPostIndexEntry, toBlogPostSummary } from './helpers'
import { resolvedPublishedAt } from './publish-moment'
import { blogBatchStatements, chunkPostIds } from './posts-batch'
import { assertSlugFree, claimSlugStatements, slugMoveStatements } from './slug-history'
import { patchTouchesPostContent, registerBlogRevisionsRoutes, snapshotRevisionStatements } from './revisions'
import { pingBlogFeed, postVisibleInFeed } from './feed-ping'
import { waitUntilOf } from './background'
import { BLOG_POSTS_PAGE_SIZE, BLOG_POSTS_PAGE_SIZE_MAX, blogPostIndexQuery, blogPostsCountQuery, blogPostsListQuery } from './post-list-query'

export function registerBlogPostsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogPostsListRoute(blogManageRoutes)
  registerBlogPostIndexRoute(blogManageRoutes)
  registerBlogPostsWriteRoute(blogManageRoutes)
  registerBlogPostsPatchRoute(blogManageRoutes)
  registerBlogPostsDeleteRoute(blogManageRoutes)
  registerBlogPostsSyncRoute(blogManageRoutes)
  registerBlogPostsBatchRoute(blogManageRoutes)
  registerBlogRevisionsRoutes(blogManageRoutes)
}

function registerBlogPostsListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/posts', async (c) => {
    const userId = c.get('userId')!
    const page = clampInt(c.req.query('page'), 1, Number.MAX_SAFE_INTEGER, 1)
    const limit = clampInt(c.req.query('limit'), 1, BLOG_POSTS_PAGE_SIZE_MAX, BLOG_POSTS_PAGE_SIZE)
    const tag = safeDecodeTagParam(c.req.query('tag'))
    const filter = {
      status: c.req.query('status'),
      categoryId: c.req.query('categoryId'),
      folderId: c.req.query('folderId'),
      tag,
      search: c.req.query('search')?.trim(),
      sort: c.req.query('sort') || 'published_desc',
    }
    const pageQuery = blogPostsListQuery(userId, filter, limit, (page - 1) * limit)
    const countQuery = blogPostsCountQuery(userId, filter)
    // The page and the total are two questions with one answer each; asking them together keeps the
    // pager from drawing a page count that belongs to a different filter than the rows.
    const [pageResult, countRow] = await Promise.all([
      c.env.DB.prepare(pageQuery.sql).bind(...pageQuery.params).all<BlogPostSummaryRow>(),
      c.env.DB.prepare(countQuery.sql).bind(...countQuery.params).first<{ n: number }>(),
    ])
    const total = countRow?.n ?? 0

    return c.json({
      posts: (pageResult.results || []).map(toBlogPostSummary),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  })
}

/**
 * The note list's own view of the account's posts: every post, no body, no page. It answers "which
 * notes are published, and what should the publish dialog start from" — questions a paginated page
 * cannot answer for a note that is not on it.
 */
function registerBlogPostIndexRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/post-index', async (c) => {
    const userId = c.get('userId')!
    const { sql, params } = blogPostIndexQuery(userId)
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogPostIndexRow>()
    return c.json({ posts: (results || []).map(toBlogPostIndexEntry) })
  })
}

function registerBlogPostsWriteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts', async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogPostWriteSchema, JSON_BODY_LIMITS.note)

    const note = await resolvePostSource(c.env.DB, userId, body)
    assertContentSize(note.noteContent, 'Blog post')
    const slug = normalizedSlug(body.slug)
    const postInput = postInputFromBody(body, note, slug)

    const existingPost = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
      .bind(body.noteId, userId)
      .first<BlogPostRow>()

    if (existingPost) {
      const renamed = slug !== existingPost.slug
      if (renamed) await assertSlugFree(c.env.DB, userId, slug, existingPost.id)
      const now = Date.now()
      const publishedAt = resolvedPublishedAt(body, existingPost, now)
      const statements = [
        // The publish dialog rewrites every field it owns, so the state it replaces is history.
        ...snapshotRevisionStatements(c.env.DB, existingPost, now),
        updateBlogPost(c.env.DB, existingPost.id, postInput, publishedAt),
        ...slugMoveStatements({ db: c.env.DB, userId, postId: existingPost.id, from: existingPost.slug, to: slug, now }),
        // The index is told in the same batch as the write: an enqueue that lands on its own could
        // be lost, and that is a post the search would silently stop tracking.
        enqueueBlogFtsStatement(c.env.DB, userId, existingPost.id, 'upsert'),
      ]
      await c.env.DB.batch(statements)
      if (postVisibleInFeed(postInput.isPublished === 1, publishedAt, now)) void pingBlogFeed(c.env.DB, userId, waitUntilOf(c))
      return c.json({ ok: true, id: existingPost.id, slug })
    }

    await assertSlugFree(c.env.DB, userId, slug)
    const id = newId()
    const now = Date.now()
    await c.env.DB.batch([
      insertBlogPost(c.env.DB, { ...postInput, id, noteId: body.noteId, userId }),
      ...claimSlugStatements({ db: c.env.DB, userId, slug }),
      enqueueBlogFtsStatement(c.env.DB, userId, id, 'upsert'),
    ])
    if (postVisibleInFeed(postInput.isPublished === 1, postInput.publishedAt ?? now, now)) void pingBlogFeed(c.env.DB, userId, waitUntilOf(c))
    return c.json({ ok: true, id, slug })
  })
}

function registerBlogPostsPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/posts/:id', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogPostPatchSchema, JSON_BODY_LIMITS.note)
    const current = await loadEditablePost(c.env.DB, id, userId)

    const previousSlug = current.slug
    const before = { ...current }
    await claimPatchSlug(c.env.DB, userId, id, body.slug, current)
    if (body.content !== undefined) assertContentSize(body.content, 'Blog post')

    const now = Date.now()
    const contentRewritten = patchTouchesPostContent(body)
    await writeBlogPostPatch({ db: c.env.DB, userId, id, body, current, before, previousSlug, contentRewritten, now })
    pingIfFeedChanged({
      db: c.env.DB,
      userId,
      waitUntil: waitUntilOf(c),
      wasVisible: postVisibleInFeed(current.is_published === 1, current.published_at, now),
      willBeVisible: postVisibleInFeed(
        body.isPublished !== undefined ? body.isPublished : current.is_published === 1,
        resolvedPublishedAt(body, current, now),
        now,
      ),
      contentRewritten,
    })
    return c.json({ ok: true })
  })
}

/** A post in the trash is not offered for editing: the row still exists, but to the author it is
 * gone until it is restored. */
async function loadEditablePost(db: D1Database, id: string, userId: string): Promise<BlogPostRow> {
  const current = await db
    .prepare('SELECT * FROM blog_posts WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
    .bind(id, userId)
    .first<BlogPostRow>()
  if (!current) throw ApiError.notFound('Post not found')
  return current
}

/** The slug a patch asks for, claimed on the row it will be written to (the caller's `current`). */
async function claimPatchSlug(
  db: D1Database,
  userId: string,
  id: string,
  rawSlug: string | undefined,
  current: BlogPostRow,
): Promise<void> {
  if (!rawSlug || rawSlug === current.slug) return
  const slug = rawSlug.trim().toLowerCase()
  if (!SLUG_RE.test(slug)) throw ApiError.badRequest('Invalid slug format')
  await assertSlugFree(db, userId, slug, id)
  current.slug = slug
}

/**
 * Writes the patch. A patch that only moves presentation (pin, publish, comments, publish moment)
 * does not rewrite text, so it records no version; one that can change what the post says snapshots
 * what it said and asks the search index to take the new text.
 */
async function writeBlogPostPatch(params: {
  db: D1Database
  userId: string
  id: string
  body: z.infer<typeof blogPostPatchSchema>
  current: BlogPostRow
  before: BlogPostRow
  previousSlug: string
  contentRewritten: boolean
  now: number
}): Promise<void> {
  const { db, userId, id, body, current, before, previousSlug, contentRewritten, now } = params
  const statements = contentRewritten ? snapshotRevisionStatements(db, before, now) : []
  statements.push(blogPostPatchStatement(db, body, current, id, now))
  statements.push(...slugMoveStatements({ db, userId, postId: id, from: previousSlug, to: current.slug, now }))
  // A presentation-only patch leaves the indexed text alone, so it does not ask for a reindex.
  if (contentRewritten) statements.push(enqueueBlogFtsStatement(db, userId, id, 'upsert'))
  await db.batch(statements)
}

/**
 * A ping tells subscribers to refetch; it is owed when their next read would differ. That is a post
 * appearing or disappearing from the feed, or its text changing while it is in the feed — a pin or a
 * comment toggle moves the same bytes around, and a draft being edited is not in the feed at all.
 */
function pingIfFeedChanged(params: {
  db: D1Database
  userId: string
  waitUntil: ((task: Promise<void>) => void) | undefined
  wasVisible: boolean
  willBeVisible: boolean
  contentRewritten: boolean
}): void {
  const { wasVisible, willBeVisible, contentRewritten } = params
  if (wasVisible === willBeVisible && !(willBeVisible && contentRewritten)) return
  void pingBlogFeed(params.db, params.userId, params.waitUntil)
}

function blogPostPatchStatement(
  db: D1Database,
  body: z.infer<typeof blogPostPatchSchema>,
  current: BlogPostRow,
  id: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(`
      UPDATE blog_posts SET
        slug = ?1,
        title = ?2,
        excerpt = ?3,
        content = ?4,
        cover_url = ?5,
        category_id = ?6,
        folder_id = ?7,
        tags = ?8,
        is_published = ?9,
        allow_comments = ?10,
        is_pinned = ?11,
        published_at = ?12,
        updated_at = ?13,
        seo_title = ?14,
        seo_description = ?15,
        seo_image_url = ?16,
        seo_canonical_url = ?17,
        seo_noindex = ?18
      WHERE id = ?19
    `)
    .bind(
      body.slug ?? current.slug,
      body.title ?? current.title,
      body.excerpt ?? current.excerpt,
      body.content ?? current.content,
      body.coverUrl !== undefined ? extractCoverUrl(body.coverUrl) : current.cover_url,
      body.categoryId !== undefined ? body.categoryId : current.category_id,
      body.folderId !== undefined ? body.folderId : current.folder_id,
      body.tags !== undefined ? JSON.stringify(body.tags) : current.tags,
      body.isPublished !== undefined ? (body.isPublished ? 1 : 0) : current.is_published,
      body.allowComments !== undefined ? (body.allowComments ? 1 : 0) : current.allow_comments,
      body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : current.is_pinned,
      resolvedPublishedAt(body, current, now),
      now,
      body.seoTitle ?? current.seo_title,
      body.seoDescription ?? current.seo_description,
      body.seoImageUrl !== undefined ? body.seoImageUrl || '' : current.seo_image_url,
      body.seoCanonicalUrl !== undefined ? body.seoCanonicalUrl || '' : current.seo_canonical_url,
      body.seoNoindex !== undefined ? (body.seoNoindex ? 1 : 0) : current.seo_noindex,
      id,
    )
}

function registerBlogPostsDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/posts/:id', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!

    // FEA-04: deleting moves the post to the recycle bin instead of erasing it, and the row keeps
    // everything it owned — comments, retired addresses, visit history — so a restore puts the post
    // back exactly as it was. The row is only really erased from the trash routes.
    await c.env.DB
      .prepare('UPDATE blog_posts SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL')
      .bind(Date.now(), id, userId)
      .run()

    return c.json({ ok: true })
  })
}

function registerBlogPostsSyncRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts/:id/sync', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!

    const post = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
      .bind(id, userId)
      .first<BlogPostRow>()
    if (!post) throw ApiError.notFound('Post not found')

    const note = await c.env.DB
      .prepare('SELECT title, content, excerpt FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
      .bind(post.note_id, userId)
      .first<{ title: string; content: string; excerpt: string }>()
    if (!note) throw ApiError.notFound('Original note not found')

    const now = Date.now()
    const coverUrl = coverUrlFromNote(note.content)

    await c.env.DB.batch([
      // Pulling the note's text into the post replaces what the post said, so the state it replaces
      // is a version like any other patch.
      ...snapshotRevisionStatements(c.env.DB, post, now),
      c.env.DB.prepare(`
        UPDATE blog_posts SET
          title = ?1,
          content = ?2,
          excerpt = COALESCE(NULLIF(excerpt, ''), ?3),
          cover_url = COALESCE(?4, cover_url),
          updated_at = ?5
        WHERE id = ?6
      `).bind(note.title, note.content, note.excerpt, coverUrl, now, id),
      enqueueBlogFtsStatement(c.env.DB, userId, id, 'upsert'),
    ])
    if (postVisibleInFeed(post.is_published === 1, post.published_at, now)) void pingBlogFeed(c.env.DB, userId, waitUntilOf(c))

    return c.json({ ok: true, syncedAt: now })
  })
}

function coverUrlFromNote(content: string): string | null {
  const fm = parseFrontMatter(content)
  const fmData = fm.data as Record<string, unknown>
  const rawCover = typeof fmData.Cover === 'string' ? fmData.Cover : typeof fmData.cover === 'string' ? fmData.cover : ''
  return rawCover ? extractCoverUrl(rawCover) : null
}

function registerBlogPostsBatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts/batch', async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogBatchSchema, JSON_BODY_LIMITS.note)

    if (!body.postIds?.length) return c.json({ ok: true, count: 0 })

    const now = Date.now()
    // One group at a time: D1 rejects a statement that binds more than 100 variables, and the group's
    // statements go in one batch so a delete cannot stop between the rows it has to take together.
    for (const group of chunkPostIds(body.postIds)) {
      const statements = blogBatchStatements(userId, body.action, group, body, now)
        .map((stmt) => c.env.DB.prepare(stmt.sql).bind(...stmt.binds))
      if (statements.length > 0) await c.env.DB.batch(statements)
    }

    // These three actions change what the feed lists; setCategory/setFolder/setPinned do not.
    if (body.action === 'publish' || body.action === 'unpublish' || body.action === 'delete') {
      void pingBlogFeed(c.env.DB, userId, waitUntilOf(c))
    }

    return c.json({ ok: true, count: body.postIds.length })
  })
}


