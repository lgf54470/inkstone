import type { z } from 'zod'
import { Hono } from 'hono'
import { extractCoverUrl, parseFrontMatter } from '@shared/markdown-utils'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId, newSlug } from '../../lib/id'
import { assertContentSize, clampInt, JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import type { BlogPostIndexRow, BlogPostRow, BlogPostSummaryRow } from '../../db/rows'
import { blogPostWriteSchema } from './schemas'
import { blogPostPatchSchema } from './schemas'
import { blogBatchSchema } from './schemas'
import { safeDecodeTagParam, toBlogPostIndexEntry, toBlogPostSummary } from './helpers'
import { resolvedPublishedAt } from './publish-moment'
import { blogBatchStatements, chunkPostIds } from './posts-batch'
import { claimSlugStatements, renameSlugStatements } from './slug-history'
import { BLOG_POSTS_PAGE_SIZE, BLOG_POSTS_PAGE_SIZE_MAX, blogPostIndexQuery, blogPostsCountQuery, blogPostsListQuery } from './post-list-query'

const SLUG_RE = /^[a-zA-Z0-9_-]{2,80}$/

export function registerBlogPostsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogPostsListRoute(blogManageRoutes)
  registerBlogPostIndexRoute(blogManageRoutes)
  registerBlogPostsWriteRoute(blogManageRoutes)
  registerBlogPostsPatchRoute(blogManageRoutes)
  registerBlogPostsDeleteRoute(blogManageRoutes)
  registerBlogPostsSyncRoute(blogManageRoutes)
  registerBlogPostsBatchRoute(blogManageRoutes)
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
      .prepare('SELECT id, slug, is_published, published_at FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
      .bind(body.noteId, userId)
      .first<{ id: string; slug: string; is_published: number; published_at: number }>()

    if (existingPost) {
      const renamed = slug !== existingPost.slug
      if (renamed) await assertSlugFree(c.env.DB, userId, slug, existingPost.id)
      const now = Date.now()
      const statements = [updateBlogPost(c.env.DB, existingPost.id, postInput, resolvedPublishedAt(body, existingPost, now))]
      statements.push(...slugStatementsFor({ db: c.env.DB, userId, postId: existingPost.id, from: existingPost.slug, to: slug, now }))
      await c.env.DB.batch(statements)
      return c.json({ ok: true, id: existingPost.id, slug })
    }

    await assertSlugFree(c.env.DB, userId, slug)
    const id = newId()
    await c.env.DB.batch([
      insertBlogPost(c.env.DB, { ...postInput, id, noteId: body.noteId, userId }),
      ...claimSlugStatements({ db: c.env.DB, userId, slug }),
    ])
    return c.json({ ok: true, id, slug })
  })
}

interface PostSource {
  noteTitle: string
  noteContent: string
}

async function resolvePostSource(
  db: D1Database,
  userId: string,
  body: { noteId: string; title?: string; content?: string },
): Promise<PostSource> {
  let noteTitle = body.title || ''
  let noteContent = body.content || ''
  if (noteTitle && noteContent) return { noteTitle, noteContent }
  const note = await db
    .prepare('SELECT title, content FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
    .bind(body.noteId, userId)
    .first<{ title: string; content: string }>()
  if (!note) throw ApiError.notFound('Note not found')
  noteTitle = noteTitle || note.title
  noteContent = noteContent || note.content
  return { noteTitle, noteContent }
}

function normalizedSlug(rawSlug: string | undefined): string {
  const slug = (rawSlug?.trim() || newSlug().slice(0, 8)).toLowerCase()
  if (!SLUG_RE.test(slug)) {
    throw ApiError.badRequest('Invalid slug format')
  }
  return slug
}

interface PostWriteInput {
  slug: string
  title: string
  excerpt: string
  content: string
  coverUrl: string | null
  categoryId: string | null
  folderId: string | null
  tagsJson: string
  isPublished: number
  publishedAt?: number
  allowComments: number
  isPinned: number
  seoTitle: string
  seoDescription: string
  seoImageUrl: string
  seoCanonicalUrl: string
  seoNoindex: number
}

function postInputFromBody(
  body: z.infer<typeof blogPostWriteSchema>,
  note: PostSource,
  slug: string,
): PostWriteInput {
  return {
    slug,
    title: note.noteTitle,
    excerpt: body.excerpt || '',
    content: note.noteContent,
    coverUrl: extractCoverUrl(body.coverUrl || ''),
    categoryId: body.categoryId || null,
    folderId: body.folderId || null,
    tagsJson: JSON.stringify(body.tags || []),
    isPublished: body.isPublished !== false ? 1 : 0,
    publishedAt: body.publishedAt,
    allowComments: body.allowComments !== false ? 1 : 0,
    isPinned: body.isPinned ? 1 : 0,
    seoTitle: body.seoTitle || '',
    seoDescription: body.seoDescription || '',
    seoImageUrl: body.seoImageUrl || '',
    seoCanonicalUrl: body.seoCanonicalUrl || '',
    seoNoindex: body.seoNoindex ? 1 : 0,
  }
}

/**
 * A slug only has to be free inside the account's own blog: another account publishing the same name
 * is a different post on a different site, and treating it as a conflict would both block that
 * account's publish and tell it what the other blog has published.
 */
async function assertSlugFree(db: D1Database, userId: string, slug: string, excludeId?: string): Promise<void> {
  const conflict = excludeId
    ? await db.prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND slug = ?2 AND id != ?3')
        .bind(userId, slug, excludeId).first()
    : await db.prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND slug = ?2')
        .bind(userId, slug).first()
  if (conflict) throw ApiError.conflict('Slug already exists')
}

function updateBlogPost(db: D1Database, id: string, input: PostWriteInput, publishedAt: number): D1PreparedStatement {
  const now = Date.now()
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
      input.slug,
      input.title,
      input.excerpt,
      input.content,
      input.coverUrl,
      input.categoryId,
      input.folderId,
      input.tagsJson,
      input.isPublished,
      input.allowComments,
      input.isPinned,
      publishedAt,
      now,
      input.seoTitle,
      input.seoDescription,
      input.seoImageUrl,
      input.seoCanonicalUrl,
      input.seoNoindex,
      id,
    )
}

/**
 * What a write does to the slug it stores: nothing when the address did not move, and otherwise the
 * full take-and-retire pair. One function so the patch route, the upsert route and the create route
 * cannot disagree about which half of it applies.
 */
function slugStatementsFor({
  db, userId, postId, from, to, now,
}: {
  db: D1Database
  userId: string
  postId: string
  from: string
  to: string
  now: number
}): D1PreparedStatement[] {
  if (from === to) return []
  return renameSlugStatements({ db, userId, postId, previousSlug: from, nextSlug: to, now })
}

function insertBlogPost(
  db: D1Database,
  input: PostWriteInput & { id: string; noteId: string; userId: string },
): D1PreparedStatement {
  const now = Date.now()
  return db
    .prepare(`
      INSERT INTO blog_posts (
        id, slug, note_id, user_id, title, excerpt, content, cover_url,
        category_id, folder_id, tags, is_published, allow_comments, is_pinned, views,
        published_at, created_at, updated_at,
        seo_title, seo_description, seo_image_url, seo_canonical_url, seo_noindex
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?16, ?16,
        ?17, ?18, ?19, ?20, ?21)
    `)
    .bind(
      input.id,
      input.slug,
      input.noteId,
      input.userId,
      input.title,
      input.excerpt,
      input.content,
      input.coverUrl,
      input.categoryId,
      input.folderId,
      input.tagsJson,
      input.isPublished,
      input.allowComments,
      input.isPinned,
      // A new post takes the moment its author picked; without one it went out as it was written.
      input.publishedAt ?? now,
      now,
      input.seoTitle,
      input.seoDescription,
      input.seoImageUrl,
      input.seoCanonicalUrl,
      input.seoNoindex,
    )
}

function registerBlogPostsPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/posts/:id', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogPostPatchSchema, JSON_BODY_LIMITS.note)

    const current = await c.env.DB
      .prepare('SELECT * FROM blog_posts WHERE id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .first<BlogPostRow>()
    if (!current) throw ApiError.notFound('Post not found')

    const previousSlug = current.slug
    if (body.slug && body.slug !== current.slug) {
      const slug = body.slug.trim().toLowerCase()
      if (!SLUG_RE.test(slug)) throw ApiError.badRequest('Invalid slug format')
      await assertSlugFree(c.env.DB, slug, id)
      current.slug = slug
    }

    if (body.content !== undefined) assertContentSize(body.content, 'Blog post')

    const now = Date.now()
    const statements = [blogPostPatchStatement(c.env.DB, body, current, id, now)]
    statements.push(...slugStatementsFor({ db: c.env.DB, userId, postId: id, from: previousSlug, to: current.slug, now }))
    await c.env.DB.batch(statements)
    return c.json({ ok: true })
  })
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

    // One batch, so a post cannot survive while its log rows go missing (or the other way round).
    // `blog_comments` has no owner column, so the delete asks blog_posts who owns the post and has to
    // run before the post row itself disappears.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM blog_comments
          WHERE post_id = ?1 AND EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.id = ?1 AND bp.user_id = ?2)`,
      ).bind(id, userId),
      c.env.DB.prepare('DELETE FROM blog_visits WHERE post_id = ?1 AND user_id = ?2').bind(id, userId),
      // The retired addresses of the post go with it: nothing may redirect to a row that is gone.
      c.env.DB.prepare('DELETE FROM blog_post_slugs WHERE post_id = ?1 AND user_id = ?2').bind(id, userId),
      c.env.DB.prepare('DELETE FROM blog_posts WHERE id = ?1 AND user_id = ?2').bind(id, userId),
    ])

    return c.json({ ok: true })
  })
}

function registerBlogPostsSyncRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts/:id/sync', async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!

    const post = await c.env.DB
      .prepare('SELECT note_id FROM blog_posts WHERE id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .first<{ note_id: string }>()
    if (!post) throw ApiError.notFound('Post not found')

    const note = await c.env.DB
      .prepare('SELECT title, content, excerpt FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
      .bind(post.note_id, userId)
      .first<{ title: string; content: string; excerpt: string }>()
    if (!note) throw ApiError.notFound('Original note not found')

    const now = Date.now()
    const coverUrl = coverUrlFromNote(note.content)

    await c.env.DB
      .prepare(`
        UPDATE blog_posts SET
          title = ?1,
          content = ?2,
          excerpt = COALESCE(NULLIF(excerpt, ''), ?3),
          cover_url = COALESCE(?4, cover_url),
          updated_at = ?5
        WHERE id = ?6
      `)
      .bind(note.title, note.content, note.excerpt, coverUrl, now, id)
      .run()

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

    return c.json({ ok: true, count: body.postIds.length })
  })
}


