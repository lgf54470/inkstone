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

export function registerBlogPostsRoutes(blogManageRoutes: Hono<AppBindings>): void {
// 5. List Posts
blogManageRoutes.get('/posts', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const status = c.req.query('status') // 'all' | 'published' | 'draft' | 'pinned'
  const categoryId = c.req.query('categoryId')
  const folderId = c.req.query('folderId')
  const tag = c.req.query('tag')
  const search = c.req.query('search')?.trim()
  const sort = c.req.query('sort') || 'published_desc'

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

  if (sort === 'views_desc') {
    sql += ` ORDER BY p.views DESC, p.published_at DESC`
  } else if (sort === 'published_asc') {
    sql += ` ORDER BY p.published_at ASC`
  } else {
    sql += ` ORDER BY p.is_pinned DESC, p.published_at DESC`
  }

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<BlogPostCountsRow>()

  let posts: BlogPost[] = (results || []).map((row) => ({
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    userId: row.user_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    folderId: row.folder_id || null,
    tags: JSON.parse(row.tags || '[]'),
    isPublished: Boolean(row.is_published),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: row.views || 0,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  if (tag) {
    posts = posts.filter(
      (p) =>
        Array.isArray(p.tags) &&
        p.tags.some((t: string) => t === tag || t.startsWith(`${tag}/`)),
    )
  }

  return c.json({ posts })
})

// 6. Create / Publish Post
blogManageRoutes.post('/posts', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogPostWriteSchema, JSON_BODY_LIMITS.note)

  let noteTitle = body.title
  let noteContent = body.content || ''
  if (!noteTitle || !noteContent) {
    const note = await c.env.DB
      .prepare('SELECT title, content FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
      .bind(body.noteId, userId)
      .first<{ title: string; content: string }>()
    if (!note) throw ApiError.notFound('Note not found')
    noteTitle = noteTitle || note.title
    noteContent = noteContent || note.content
  }

  const slug = (body.slug?.trim() || newSlug().slice(0, 8)).toLowerCase()
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(slug)) {
    throw ApiError.badRequest('Invalid slug format')
  }

  const existingPost = await c.env.DB
    .prepare('SELECT id, slug FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
    .bind(body.noteId, userId)
    .first<{ id: string; slug: string }>()

  const now = Date.now()
  const tagsJson = JSON.stringify(body.tags || [])
  const isPublished = body.isPublished !== false ? 1 : 0
  const allowComments = body.allowComments !== false ? 1 : 0
  const isPinned = body.isPinned ? 1 : 0
  const coverUrl = extractCoverUrl(body.coverUrl || '')
  const excerpt = body.excerpt || ''
  const categoryId = body.categoryId || null
  const folderId = body.folderId || null

  if (existingPost) {
    if (slug !== existingPost.slug) {
      const conflict = await c.env.DB
        .prepare('SELECT id FROM blog_posts WHERE slug = ?1 AND id != ?2')
        .bind(slug, existingPost.id)
        .first()
      if (conflict) throw ApiError.conflict('Slug already exists')
    }

    await c.env.DB
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
        slug,
        noteTitle,
        excerpt,
        noteContent,
        coverUrl,
        categoryId,
        folderId,
        tagsJson,
        isPublished,
        allowComments,
        isPinned,
        now,
        existingPost.id,
      )
      .run()

    return c.json({ ok: true, id: existingPost.id, slug })
  }

  const conflict = await c.env.DB
    .prepare('SELECT id FROM blog_posts WHERE slug = ?1')
    .bind(slug)
    .first()
  if (conflict) throw ApiError.conflict('Slug already exists')

  const id = newId()
  await c.env.DB
    .prepare(`
      INSERT INTO blog_posts (
        id, slug, note_id, user_id, title, excerpt, content, cover_url,
        category_id, folder_id, tags, is_published, allow_comments, is_pinned, views,
        published_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15, ?15)
    `)
    .bind(
      id,
      slug,
      body.noteId,
      userId,
      noteTitle,
      excerpt,
      noteContent,
      coverUrl,
      categoryId,
      folderId,
      tagsJson,
      isPublished,
      allowComments,
      isPinned,
      now,
    )
    .run()

  return c.json({ ok: true, id, slug })
})

// 7. Update Post
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
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(slug)) throw ApiError.badRequest('Invalid slug format')
    const conflict = await c.env.DB
      .prepare('SELECT id FROM blog_posts WHERE slug = ?1 AND id != ?2')
      .bind(slug, id)
      .first()
    if (conflict) throw ApiError.conflict('Slug already exists')
    current.slug = slug
  }

  const now = Date.now()
  await c.env.DB
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
    .run()

  return c.json({ ok: true })
})

// 8. Delete / Unpublish Post
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

// 9. Sync Post from Note
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
  const fm = parseFrontMatter(note.content)
  const fmData = fm.data as Record<string, unknown>
  const rawCover = typeof fmData.Cover === 'string' ? fmData.Cover : typeof fmData.cover === 'string' ? fmData.cover : ''
  const coverUrl = rawCover ? extractCoverUrl(rawCover) : null

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

// 10. Batch Post Operations
blogManageRoutes.post('/posts/batch', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogBatchSchema, JSON_BODY_LIMITS.note)

  if (!body.postIds?.length) return c.json({ ok: true, count: 0 })

  const placeholders = body.postIds.map(() => '?').join(',')
  const now = Date.now()

  if (body.action === 'publish') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET is_published = 1, updated_at = ? WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'unpublish') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET is_published = 0, updated_at = ? WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'delete') {
    await c.env.DB
      .prepare(`DELETE FROM blog_posts WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(userId, ...body.postIds)
      .run()
    await c.env.DB
      .prepare(`DELETE FROM blog_comments WHERE post_id IN (${placeholders})`)
      .bind(...body.postIds)
      .run()
  } else if (body.action === 'setCategory') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET category_id = ?, updated_at = ? WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(body.categoryId || null, now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'setFolder') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET folder_id = ?, updated_at = ? WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(body.folderId || null, now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'setPinned') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET is_pinned = ?, updated_at = ? WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(body.isPinned ? 1 : 0, now, userId, ...body.postIds)
      .run()
  }

  return c.json({ ok: true, count: body.postIds.length })
})
}

