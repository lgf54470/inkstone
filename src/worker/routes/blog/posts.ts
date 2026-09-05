import type { z } from 'zod';
import { Hono } from "hono";
import { extractCoverUrl, parseFrontMatter } from "@shared/markdown-utils";
import type { BlogPost } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { newId, newSlug } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import type { BlogPostCountsRow, BlogPostRow } from "../../db/rows";
import { blogPostWriteSchema } from './schemas';
import { blogPostPatchSchema } from './schemas';
import { blogBatchSchema } from './schemas';
import { toBlogPost } from './helpers';

const SLUG_RE = /^[a-zA-Z0-9_-]{2,80}$/

export function registerBlogPostsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogPostsListRoute(blogManageRoutes)
  registerBlogPostsWriteRoute(blogManageRoutes)
  registerBlogPostsPatchRoute(blogManageRoutes)
  registerBlogPostsDeleteRoute(blogManageRoutes)
  registerBlogPostsSyncRoute(blogManageRoutes)
  registerBlogPostsBatchRoute(blogManageRoutes)
}

function registerBlogPostsListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/posts', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const { sql, params } = blogPostsListQuery(userId, {
      status: c.req.query('status'),
      categoryId: c.req.query('categoryId'),
      folderId: c.req.query('folderId'),
      tag: c.req.query('tag'),
      search: c.req.query('search')?.trim(),
      sort: c.req.query('sort') || 'published_desc',
    })
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogPostCountsRow>()

    let posts: BlogPost[] = (results || []).map(toBlogPost)
    const tag = c.req.query('tag')
    if (tag) {
      posts = filterPostsByTag(posts, tag)
    }

    return c.json({ posts })
  })
}

interface BlogPostsFilter {
  status?: string
  categoryId?: string
  folderId?: string
  tag?: string
  search?: string
  sort: string
}

function blogPostsListQuery(userId: string, filter: BlogPostsFilter): { sql: string; params: unknown[] } {
  const { status, categoryId, folderId, search, sort } = filter

  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id) as comments_count
    FROM blog_posts p
    WHERE p.user_id = ?1
  `
  const params: unknown[] = [userId]
  let idx = 2

  if (status === 'published') {
    sql += ` AND p.is_published = 1`
  } else if (status === 'draft') {
    sql += ` AND p.is_published = 0`
  } else if (status === 'pinned') {
    sql += ` AND p.is_pinned = 1`
  }

  if (folderId === 'none') {
    sql += ` AND (p.folder_id IS NULL OR p.folder_id = '')`
  } else if (folderId) {
    sql += ` AND p.folder_id = ?${idx++}`
    params.push(folderId)
  }

  if (categoryId) {
    sql += ` AND p.category_id = ?${idx++}`
    params.push(categoryId)
  }

  if (search) {
    sql += ` AND (p.title LIKE ?${idx} OR p.excerpt LIKE ?${idx} OR p.slug LIKE ?${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += postListOrderSql(sort)

  return { sql, params }
}

function postListOrderSql(sort: string): string {
  if (sort === 'views_desc') {
    return ` ORDER BY p.views DESC, p.published_at DESC`
  }
  if (sort === 'published_asc') {
    return ` ORDER BY p.published_at ASC`
  }
  return ` ORDER BY p.is_pinned DESC, p.published_at DESC`
}

function filterPostsByTag(posts: BlogPost[], tag: string): BlogPost[] {
  return posts.filter(
    (p) =>
      Array.isArray(p.tags) &&
      p.tags.some((t: string) => t === tag || t.startsWith(`${tag}/`)),
  )
}

function registerBlogPostsWriteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogPostWriteSchema, JSON_BODY_LIMITS.note)

    const note = await resolvePostSource(c.env.DB, userId, body)
    const slug = normalizedSlug(body.slug)
    const postInput = postInputFromBody(body, note, slug)

    const existingPost = await c.env.DB
      .prepare('SELECT id, slug FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
      .bind(body.noteId, userId)
      .first<{ id: string; slug: string }>()

    if (existingPost) {
      if (slug !== existingPost.slug) await assertSlugFree(c.env.DB, slug, existingPost.id)
      await updateBlogPost(c.env.DB, existingPost.id, postInput)
      return c.json({ ok: true, id: existingPost.id, slug })
    }

    await assertSlugFree(c.env.DB, slug)
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
    allowComments: body.allowComments !== false ? 1 : 0,
    isPinned: body.isPinned ? 1 : 0,
  }
}

async function assertSlugFree(db: D1Database, slug: string, excludeId?: string): Promise<void> {
  const conflict = excludeId
    ? await db.prepare('SELECT id FROM blog_posts WHERE slug = ?1 AND id != ?2').bind(slug, excludeId).first()
    : await db.prepare('SELECT id FROM blog_posts WHERE slug = ?1').bind(slug).first()
  if (conflict) throw ApiError.conflict('Slug already exists')
}

async function updateBlogPost(db: D1Database, id: string, input: PostWriteInput): Promise<void> {
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
        updated_at = ?12
      WHERE id = ?13
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
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15, ?15)
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
      now,
    )
    .run()
}

function registerBlogPostsPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/posts/:id', requireAuth, async (c) => {
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
        updated_at = ?12
      WHERE id = ?13
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
      now,
      id,
    )
}

function registerBlogPostsDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/posts/:id', requireAuth, async (c) => {
    const id = c.req.param('id')
    const userId = c.get('userId')!

    await c.env.DB
      .prepare('DELETE FROM blog_posts WHERE id = ?1 AND user_id = ?2')
      .bind(id, userId)
      .run()

    await c.env.DB
      .prepare('DELETE FROM blog_comments WHERE post_id = ?1')
      .bind(id)
      .run()

    return c.json({ ok: true })
  })
}

function registerBlogPostsSyncRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/posts/:id/sync', requireAuth, async (c) => {
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
  blogManageRoutes.post('/posts/batch', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogBatchSchema, JSON_BODY_LIMITS.note)

    if (!body.postIds?.length) return c.json({ ok: true, count: 0 })

    const now = Date.now()
    const statements = blogBatchStatements(userId, body.action, body.postIds, body, now)
    for (const stmt of statements) {
      await c.env.DB.prepare(stmt.sql).bind(...stmt.binds).run()
    }

    return c.json({ ok: true, count: body.postIds.length })
  })
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
      return [{ sql: `UPDATE blog_posts SET is_published = 1, updated_at = ?${withIds}`, binds: [now, userId, ...postIds] }]
    case 'unpublish':
      return [{ sql: `UPDATE blog_posts SET is_published = 0, updated_at = ?${withIds}`, binds: [now, userId, ...postIds] }]
    case 'delete':
      return [
        { sql: `DELETE FROM blog_posts${withIds}`, binds: [userId, ...postIds] },
        { sql: `DELETE FROM blog_comments WHERE post_id IN (${placeholders})`, binds: [...postIds] },
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
