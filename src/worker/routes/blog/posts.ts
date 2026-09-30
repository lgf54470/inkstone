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
      if (slug !== existingPost.slug) await assertSlugFree(c.env.DB, userId, slug, existingPost.id)
      await updateBlogPost(c.env.DB, existingPost.id, postInput, resolvedPublishedAt(body, existingPost, Date.now()))
      return c.json({ ok: true, id: existingPost.id, slug })
    }

    await assertSlugFree(c.env.DB, userId, slug)
    const id = newId()
    await insertBlogPost(c.env.DB, { ...postInput, id, noteId: body.noteId, userId })
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

async function updateBlogPost(db: D1Database, id: string, input: PostWriteInput, publishedAt: number): Promise<void> {
  const now = Date.now()
  await db
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
        updated_at = ?13
      WHERE id = ?14
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
      id,
    )
    .run()
}

async function insertBlogPost(
  db: D1Database,
  input: PostWriteInput & { id: string; noteId: string; userId: string },
): Promise<void> {
  const now = Date.now()
  await db
    .prepare(`
      INSERT INTO blog_posts (
        id, slug, note_id, user_id, title, excerpt, content, cover_url,
        category_id, folder_id, tags, is_published, allow_comments, is_pinned, views,
        published_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?16, ?16)
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
    )
    .run()
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

    if (body.slug && body.slug !== current.slug) {
      const slug = body.slug.trim().toLowerCase()
      if (!SLUG_RE.test(slug)) throw ApiError.badRequest('Invalid slug format')
      await assertSlugFree(c.env.DB, slug, id)
      current.slug = slug
    }

    if (body.content !== undefined) assertContentSize(body.content, 'Blog post')

    await blogPostPatchStatement(c.env.DB, body, current, id, Date.now()).run()
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
        updated_at = ?13
      WHERE id = ?14
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

interface BlogBatchStatement {
  sql: string
  binds: unknown[]
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

const BLOG_POST_ID_CHUNK = 50

function chunkPostIds(postIds: string[]): string[][] {
  const groups: string[][] = []
  for (let index = 0; index < postIds.length; index += BLOG_POST_ID_CHUNK) {
    groups.push(postIds.slice(index, index + BLOG_POST_ID_CHUNK))
  }
  return groups
}

function blogBatchStatements(
  userId: string,
  action: string,
  postIds: string[],
  body: { categoryId?: string | null; folderId?: string | null; isPinned?: boolean },
  now: number,
): BlogBatchStatement[] {
  const placeholders = postIds.map(() => '?').join(',')
  const withIds = ` WHERE user_id = ? AND id IN (${placeholders})`

  switch (action) {
    case 'publish':
      // Drafts stamp the moment they go out; already published rows keep their own, so a batch
      // publish cannot rewrite an archive's dates. SQLite reads the old `is_published` here.
      return [{
        sql: `UPDATE blog_posts SET is_published = 1, published_at = CASE WHEN is_published = 0 THEN ? ELSE published_at END, updated_at = ?${withIds}`,
        binds: [now, now, userId, ...postIds],
      }]
    case 'unpublish':
      return [{ sql: `UPDATE blog_posts SET is_published = 0, updated_at = ?${withIds}`, binds: [now, userId, ...postIds] }]
    case 'delete':
      return [
        // Comments have no owner column: both child deletes must land before the post rows go.
        {
          sql: `DELETE FROM blog_comments WHERE post_id IN (
                  SELECT id FROM blog_posts WHERE user_id = ? AND id IN (${placeholders}))`,
          binds: [userId, ...postIds],
        },
        { sql: `DELETE FROM blog_visits WHERE user_id = ? AND post_id IN (${placeholders})`, binds: [userId, ...postIds] },
        { sql: `DELETE FROM blog_posts${withIds}`, binds: [userId, ...postIds] },
      ]
    case 'setCategory':
      return [{ sql: `UPDATE blog_posts SET category_id = ?, updated_at = ?${withIds}`, binds: [body.categoryId || null, now, userId, ...postIds] }]
    case 'setFolder':
      return [{ sql: `UPDATE blog_posts SET folder_id = ?, updated_at = ?${withIds}`, binds: [body.folderId || null, now, userId, ...postIds] }]
    case 'setPinned':
      return [{ sql: `UPDATE blog_posts SET is_pinned = ?, updated_at = ?${withIds}`, binds: [body.isPinned ? 1 : 0, now, userId, ...postIds] }]
    default:
      return []
  }
}
