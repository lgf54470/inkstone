import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { newId, newSlug } from '../lib/id'
import { JSON_BODY_LIMITS, readJson, requestClientIp } from '../lib/request'
import { loadSession, requireAuth } from '../middleware/auth'
import { getMeta, setMeta } from '../db/metadata'
import type {
  BlogPost,
  BlogCategory,
  BlogComment,
  BlogCommentStatus,
  BlogStats,
  BlogSettings,
} from '@shared/types'

export const blogManageRoutes = new Hono<AppBindings>()
export const blogPublicRoutes = new Hono<AppBindings>()

// Ensure session loaded for manage routes
blogManageRoutes.use('*', loadSession)

const DEFAULT_BLOG_SETTINGS: BlogSettings = {
  siteName: 'Inkstone Blog',
  subtitle: 'Deep thoughts and quiet reflections',
  bio: 'Thoughts, essays, and stories powered by Inkstone and Astro.',
  authorName: 'Inkstone Writer',
  authorAvatar: '',
  socialLinks: {
    github: '',
    twitter: '',
    email: '',
    website: '',
  },
  requireCommentApproval: true,
  postsPerPage: 10,
  frontendUrl: 'http://localhost:4321',
  appearance: {
    theme: 'system',
    accent: 'cinnabar',
    background: 'paper',
    density: 'comfortable',
    language: 'zh-CN',
  },
}

// Helper: load blog settings from app_meta
async function getBlogSettings(db: D1Database, userId?: string): Promise<BlogSettings> {
  const metaKey = userId ? `blog_settings_${userId}` : 'blog_settings_global'
  const raw = await getMeta(db, metaKey)
  if (!raw) return DEFAULT_BLOG_SETTINGS
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_BLOG_SETTINGS,
      ...parsed,
      appearance: { ...DEFAULT_BLOG_SETTINGS.appearance, ...(parsed.appearance || {}) },
      socialLinks: { ...DEFAULT_BLOG_SETTINGS.socialLinks, ...(parsed.socialLinks || {}) },
    }
  } catch {
    return DEFAULT_BLOG_SETTINGS
  }
}

async function saveBlogSettings(db: D1Database, settings: Partial<BlogSettings>, userId?: string): Promise<BlogSettings> {
  const current = await getBlogSettings(db, userId)
  const merged: BlogSettings = {
    ...current,
    ...settings,
    appearance: { ...current.appearance, ...(settings.appearance || {}) },
    socialLinks: { ...current.socialLinks, ...(settings.socialLinks || {}) },
  }
  const metaKey = userId ? `blog_settings_${userId}` : 'blog_settings_global'
  await setMeta(db, metaKey, JSON.stringify(merged))
  return merged
}

// --------------------------------------------------------------------------
// Blog Manage Routes (Authenticated)
// --------------------------------------------------------------------------

// 1. Get Blog Stats & Dashboard
blogManageRoutes.get('/stats', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const db = c.env.DB

  const totalPostsRow = await db
    .prepare('SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1')
    .bind(userId)
    .first<{ count: number }>()

  const publishedRow = await db
    .prepare('SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1 AND is_published = 1')
    .bind(userId)
    .first<{ count: number }>()

  const viewsRow = await db
    .prepare('SELECT COALESCE(SUM(views), 0) as count FROM blog_posts WHERE user_id = ?1')
    .bind(userId)
    .first<{ count: number }>()

  const totalCommentsRow = await db
    .prepare(
      'SELECT COUNT(*) as count FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE p.user_id = ?1',
    )
    .bind(userId)
    .first<{ count: number }>()

  const pendingCommentsRow = await db
    .prepare(
      "SELECT COUNT(*) as count FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE p.user_id = ?1 AND c.status = 'pending'",
    )
    .bind(userId)
    .first<{ count: number }>()

  const categoriesRow = await db
    .prepare('SELECT COUNT(*) as count FROM blog_categories WHERE user_id = ?1')
    .bind(userId)
    .first<{ count: number }>()

  // Distinct tags count
  const postsWithTags = await db
    .prepare('SELECT tags FROM blog_posts WHERE user_id = ?1')
    .bind(userId)
    .all<{ tags: string }>()

  const uniqueTags = new Set<string>()
  for (const row of postsWithTags.results || []) {
    try {
      const arr = JSON.parse(row.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) uniqueTags.add(String(t))
      }
    } catch {}
  }

  const totalPosts = totalPostsRow?.count || 0
  const publishedPosts = publishedRow?.count || 0

  const stats: BlogStats = {
    totalPosts,
    publishedPosts,
    draftPosts: totalPosts - publishedPosts,
    totalViews: viewsRow?.count || 0,
    totalComments: totalCommentsRow?.count || 0,
    pendingComments: pendingCommentsRow?.count || 0,
    categoriesCount: categoriesRow?.count || 0,
    tagsCount: uniqueTags.size,
  }

  return c.json({ stats })
})

// 2. Settings
blogManageRoutes.get('/settings', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const settings = await getBlogSettings(c.env.DB, userId)
  return c.json({ settings })
})

blogManageRoutes.patch('/settings', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<Partial<BlogSettings>>(c, JSON_BODY_LIMITS.note)
  const settings = await saveBlogSettings(c.env.DB, body, userId)
  return c.json({ settings })
})

// 3. Slug availability check
blogManageRoutes.get('/check-slug', requireAuth, async (c) => {
  const slug = c.req.query('slug')?.trim() || ''
  const currentPostId = c.req.query('currentPostId')?.trim()

  if (!slug) return c.json({ available: false, reason: 'Slug cannot be empty' })
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(slug)) {
    return c.json({ available: false, reason: 'Slug must be 2-80 characters (letters, numbers, hyphens, underscores)' })
  }

  const existing = await c.env.DB
    .prepare('SELECT id FROM blog_posts WHERE slug = ?1')
    .bind(slug)
    .first<{ id: string }>()

  if (!existing || (currentPostId && existing.id === currentPostId)) {
    return c.json({ available: true })
  }
  return c.json({ available: false, reason: 'Slug is already in use' })
})

// 4. Get post by noteId
blogManageRoutes.get('/note-post/:noteId', requireAuth, async (c) => {
  const noteId = c.req.param('noteId')
  const userId = c.get('userId')!

  const row = await c.env.DB
    .prepare('SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
    .bind(noteId, userId)
    .first<any>()

  if (!row) {
    return c.json({ post: null })
  }

  const post: BlogPost = {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    userId: row.user_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    tags: JSON.parse(row.tags || '[]'),
    isPublished: Boolean(row.is_published),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: row.views || 0,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return c.json({ post })
})

// 5. List Posts
blogManageRoutes.get('/posts', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const status = c.req.query('status') // 'all' | 'published' | 'draft'
  const categoryId = c.req.query('categoryId')
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

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<any>()

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
    posts = posts.filter((p) => p.tags.includes(tag))
  }

  return c.json({ posts })
})

// 6. Create / Publish Post
blogManageRoutes.post('/posts', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    noteId: string
    title: string
    slug?: string
    excerpt?: string
    content?: string
    coverUrl?: string
    categoryId?: string | null
    tags?: string[]
    isPublished?: boolean
    allowComments?: boolean
    isPinned?: boolean
  }>(c, JSON_BODY_LIMITS.note)

  if (!body.noteId) throw ApiError.badRequest('noteId is required')

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
  const coverUrl = body.coverUrl || ''
  const excerpt = body.excerpt || ''
  const categoryId = body.categoryId || null

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
          tags = ?7,
          is_published = ?8,
          allow_comments = ?9,
          is_pinned = ?10,
          updated_at = ?11
        WHERE id = ?12
      `)
      .bind(
        slug,
        noteTitle,
        excerpt,
        noteContent,
        coverUrl,
        categoryId,
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
        category_id, tags, is_published, allow_comments, is_pinned, views,
        published_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?14, ?14)
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
  const body = await readJson<Partial<BlogPost>>(c, JSON_BODY_LIMITS.note)

  const current = await c.env.DB
    .prepare('SELECT * FROM blog_posts WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .first<any>()
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
        tags = ?7,
        is_published = ?8,
        allow_comments = ?9,
        is_pinned = ?10,
        updated_at = ?11
      WHERE id = ?12
    `)
    .bind(
      body.slug ?? current.slug,
      body.title ?? current.title,
      body.excerpt ?? current.excerpt,
      body.content ?? current.content,
      body.coverUrl ?? current.cover_url,
      body.categoryId !== undefined ? body.categoryId : current.category_id,
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
  await c.env.DB
    .prepare(`
      UPDATE blog_posts SET
        title = ?1,
        content = ?2,
        excerpt = COALESCE(NULLIF(excerpt, ''), ?3),
        updated_at = ?4
      WHERE id = ?5
    `)
    .bind(note.title, note.content, note.excerpt, now, id)
    .run()

  return c.json({ ok: true, syncedAt: now })
})

// 10. Batch Post Operations
blogManageRoutes.post('/posts/batch', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    action: 'publish' | 'unpublish' | 'delete' | 'setCategory'
    postIds: string[]
    categoryId?: string | null
  }>(c, JSON_BODY_LIMITS.note)

  if (!body.postIds?.length) return c.json({ ok: true, count: 0 })

  const placeholders = body.postIds.map((_, i) => `?${i + 2}`).join(',')
  const now = Date.now()

  if (body.action === 'publish') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET is_published = 1, updated_at = ?1 WHERE user_id = ?2 AND id IN (${placeholders})`)
      .bind(now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'unpublish') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET is_published = 0, updated_at = ?1 WHERE user_id = ?2 AND id IN (${placeholders})`)
      .bind(now, userId, ...body.postIds)
      .run()
  } else if (body.action === 'delete') {
    await c.env.DB
      .prepare(`DELETE FROM blog_posts WHERE user_id = ?1 AND id IN (${placeholders})`)
      .bind(userId, ...body.postIds)
      .run()
    await c.env.DB
      .prepare(`DELETE FROM blog_comments WHERE post_id IN (${placeholders})`)
      .bind(...body.postIds)
      .run()
  } else if (body.action === 'setCategory') {
    await c.env.DB
      .prepare(`UPDATE blog_posts SET category_id = ?1, updated_at = ?2 WHERE user_id = ?3 AND id IN (${placeholders})`)
      .bind(body.categoryId || null, now, userId, ...body.postIds)
      .run()
  }

  return c.json({ ok: true, count: body.postIds.length })
})

// 11. Categories Management
blogManageRoutes.get('/categories', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const { results } = await c.env.DB
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM blog_posts p WHERE p.category_id = c.id) as posts_count
      FROM blog_categories c
      WHERE c.user_id = ?1
      ORDER BY c.position ASC, c.created_at ASC
    `)
    .bind(userId)
    .all<any>()

  const categories: BlogCategory[] = (results || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color,
    icon: row.icon,
    position: row.position,
    postsCount: row.posts_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return c.json({ categories })
})

blogManageRoutes.post('/categories', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    name: string
    slug?: string
    description?: string
    color?: string
    icon?: string
  }>(c, JSON_BODY_LIMITS.note)

  if (!body.name?.trim()) throw ApiError.badRequest('Name is required')
  const slug = (body.slug?.trim() || body.name.trim().toLowerCase().replace(/\s+/g, '-'))

  const conflict = await c.env.DB
    .prepare('SELECT id FROM blog_categories WHERE user_id = ?1 AND slug = ?2')
    .bind(userId, slug)
    .first()
  if (conflict) throw ApiError.conflict('Category with this slug already exists')

  const id = newId()
  const now = Date.now()
  await c.env.DB
    .prepare(`
      INSERT INTO blog_categories (id, user_id, name, slug, description, color, icon, position, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8)
    `)
    .bind(id, userId, body.name.trim(), slug, body.description || '', body.color || null, body.icon || null, now)
    .run()

  return c.json({
    category: {
      id,
      userId,
      name: body.name.trim(),
      slug,
      description: body.description || '',
      color: body.color || null,
      icon: body.icon || null,
      position: 0,
      postsCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  })
})

blogManageRoutes.patch('/categories/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!
  const body = await readJson<Partial<BlogCategory>>(c, JSON_BODY_LIMITS.note)

  const current = await c.env.DB
    .prepare('SELECT * FROM blog_categories WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .first<any>()
  if (!current) throw ApiError.notFound('Category not found')

  const now = Date.now()
  await c.env.DB
    .prepare(`
      UPDATE blog_categories SET
        name = COALESCE(?1, name),
        slug = COALESCE(?2, slug),
        description = COALESCE(?3, description),
        color = COALESCE(?4, color),
        icon = COALESCE(?5, icon),
        position = COALESCE(?6, position),
        updated_at = ?7
      WHERE id = ?8
    `)
    .bind(
      body.name?.trim() ?? null,
      body.slug?.trim() ?? null,
      body.description !== undefined ? body.description : null,
      body.color !== undefined ? body.color : null,
      body.icon !== undefined ? body.icon : null,
      body.position !== undefined ? body.position : null,
      now,
      id,
    )
    .run()

  return c.json({ ok: true })
})

blogManageRoutes.delete('/categories/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!

  await c.env.DB
    .prepare('DELETE FROM blog_categories WHERE id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .run()

  await c.env.DB
    .prepare('UPDATE blog_posts SET category_id = NULL WHERE category_id = ?1 AND user_id = ?2')
    .bind(id, userId)
    .run()

  return c.json({ ok: true })
})

// --------------------------------------------------------------------------
// 12. Comments Moderation Management (Complete Moderation Center)
// --------------------------------------------------------------------------

blogManageRoutes.get('/comments', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const status = c.req.query('status') // 'all' | 'pending' | 'approved' | 'rejected' | 'spam'
  const postId = c.req.query('postId')
  const search = c.req.query('search')?.trim()

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

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<any>()

  const comments: BlogComment[] = (results || []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    postSlug: row.post_slug,
    parentId: row.parent_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorUrl: row.author_url,
    authorAvatar: row.author_avatar,
    content: row.content,
    status: row.status as BlogCommentStatus,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }))

  return c.json({ comments })
})

blogManageRoutes.patch('/comments/:id/status', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!
  const body = await readJson<{ status: BlogCommentStatus }>(c, JSON_BODY_LIMITS.note)

  if (!['pending', 'approved', 'rejected', 'spam'].includes(body.status)) {
    throw ApiError.badRequest('Invalid status')
  }

  const comment = await c.env.DB
    .prepare('SELECT c.id FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE c.id = ?1 AND p.user_id = ?2')
    .bind(id, userId)
    .first()
  if (!comment) throw ApiError.notFound('Comment not found')

  await c.env.DB
    .prepare('UPDATE blog_comments SET status = ?1 WHERE id = ?2')
    .bind(body.status, id)
    .run()

  return c.json({ ok: true, status: body.status })
})

blogManageRoutes.delete('/comments/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')!

  const comment = await c.env.DB
    .prepare('SELECT c.id FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE c.id = ?1 AND p.user_id = ?2')
    .bind(id, userId)
    .first()
  if (!comment) throw ApiError.notFound('Comment not found')

  await c.env.DB
    .prepare('DELETE FROM blog_comments WHERE id = ?1')
    .bind(id)
    .run()

  return c.json({ ok: true })
})

blogManageRoutes.post('/comments/batch', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    action: 'approve' | 'reject' | 'spam' | 'delete'
    commentIds: string[]
  }>(c, JSON_BODY_LIMITS.note)

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

// --------------------------------------------------------------------------
// Public API Routes for Astro Frontend (CORS enabled)
// --------------------------------------------------------------------------

// Add CORS headers for Astro frontend
blogPublicRoutes.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type')
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }
  await next()
})

// Public site info & settings
blogPublicRoutes.get('/site', async (c) => {
  const settings = await getBlogSettings(c.env.DB)
  return c.json({ settings })
})

// Public posts list with filters & pagination
blogPublicRoutes.get('/posts', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10', 10)))
  const offset = (page - 1) * limit
  const tag = c.req.query('tag')?.trim()
  const categorySlug = c.req.query('category')?.trim()
  const search = c.req.query('search')?.trim()

  let sql = `
    SELECT p.id, p.slug, p.title, p.excerpt, p.cover_url, p.category_id, p.tags,
           p.views, p.published_at, p.updated_at,
           c.name as category_name, c.slug as category_slug,
           (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
    FROM blog_posts p
    LEFT JOIN blog_categories c ON p.category_id = c.id
    WHERE p.is_published = 1
  `
  const params: unknown[] = []
  let idx = 1

  if (categorySlug) {
    sql += ` AND c.slug = ?${idx++}`
    params.push(categorySlug)
  }

  if (search) {
    sql += ` AND (p.title LIKE ?${idx} OR p.excerpt LIKE ?${idx} OR p.content LIKE ?${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += ` ORDER BY p.is_pinned DESC, p.published_at DESC`

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<any>()

  let items = (results || []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: JSON.parse(row.tags || '[]'),
    views: row.views || 0,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }))

  if (tag) {
    items = items.filter((p) => p.tags.includes(tag))
  }

  const total = items.length
  const paginated = items.slice(offset, offset + limit)

  return c.json({
    posts: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

// Public post detail (increments views)
blogPublicRoutes.get('/posts/:slug', async (c) => {
  const slug = c.req.param('slug')

  const row = await c.env.DB
    .prepare(`
      SELECT p.*,
        c.name as category_name, c.slug as category_slug,
        (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE p.slug = ?1 AND p.is_published = 1
    `)
    .bind(slug)
    .first<any>()

  if (!row) {
    throw ApiError.notFound('Post not found')
  }

  // Atomically increment views
  await c.env.DB
    .prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?1')
    .bind(row.id)
    .run()

  const post = {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: JSON.parse(row.tags || '[]'),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: (row.views || 0) + 1,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }

  // Get previous and next posts for navigation
  const prevPost = await c.env.DB
    .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at < ?1 ORDER BY published_at DESC LIMIT 1')
    .bind(row.published_at)
    .first<{ slug: string; title: string }>()

  const nextPost = await c.env.DB
    .prepare('SELECT slug, title FROM blog_posts WHERE is_published = 1 AND published_at > ?1 ORDER BY published_at ASC LIMIT 1')
    .bind(row.published_at)
    .first<{ slug: string; title: string }>()

  return c.json({ post, prevPost: prevPost || null, nextPost: nextPost || null })
})

// Public categories list with post counts
blogPublicRoutes.get('/categories', async (c) => {
  const { results } = await c.env.DB
    .prepare(`
      SELECT c.id, c.name, c.slug, c.description, c.color, c.icon,
        COUNT(p.id) as posts_count
      FROM blog_categories c
      LEFT JOIN blog_posts p ON c.id = p.category_id AND p.is_published = 1
      GROUP BY c.id
      ORDER BY c.position ASC, c.created_at ASC
    `)
    .all<any>()

  return c.json({ categories: results || [] })
})

// Public tags list with post counts
blogPublicRoutes.get('/tags', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT tags FROM blog_posts WHERE is_published = 1')
    .all<{ tags: string }>()

  const tagCounts: Record<string, number> = {}
  for (const row of results || []) {
    try {
      const arr = JSON.parse(row.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const tagStr = String(t).trim()
          if (tagStr) {
            tagCounts[tagStr] = (tagCounts[tagStr] || 0) + 1
          }
        }
      }
    } catch {}
  }

  const tags = Object.entries(tagCounts).map(([name, postsCount]) => ({
    name,
    postsCount,
  })).sort((a, b) => b.postsCount - a.postsCount)

  return c.json({ tags })
})

// Public timeline (Archive by year and month)
blogPublicRoutes.get('/timeline', async (c) => {
  const { results } = await c.env.DB
    .prepare(`
      SELECT id, slug, title, published_at, cover_url, tags
      FROM blog_posts
      WHERE is_published = 1
      ORDER BY published_at DESC
    `)
    .all<any>()

  const timelineMap: Record<number, Record<number, any[]>> = {}
  for (const row of results || []) {
    const d = new Date(row.published_at)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    if (!timelineMap[year]) timelineMap[year] = {}
    if (!timelineMap[year][month]) timelineMap[year][month] = []
    timelineMap[year][month].push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.published_at,
      coverUrl: row.cover_url,
      tags: JSON.parse(row.tags || '[]'),
    })
  }

  return c.json({ timeline: timelineMap })
})

// Public calendar distribution
blogPublicRoutes.get('/calendar', async (c) => {
  const { results } = await c.env.DB
    .prepare('SELECT slug, title, published_at FROM blog_posts WHERE is_published = 1 ORDER BY published_at ASC')
    .all<any>()

  // Map by YYYY-MM-DD
  const calendarMap: Record<string, { count: number; posts: { slug: string; title: string }[] }> = {}
  for (const row of results || []) {
    const d = new Date(row.published_at)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!calendarMap[dateStr]) {
      calendarMap[dateStr] = { count: 0, posts: [] }
    }
    calendarMap[dateStr].count++
    calendarMap[dateStr].posts.push({ slug: row.slug, title: row.title })
  }

  return c.json({ calendar: calendarMap })
})

// Public comments list for a post
blogPublicRoutes.get('/comments/:postSlug', async (c) => {
  const postSlug = c.req.param('postSlug')

  const post = await c.env.DB
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE slug = ?1 AND is_published = 1')
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
    .all<any>()

  return c.json({
    allowComments: Boolean(post.allow_comments),
    comments: results || [],
  })
})

// Public submit comment
blogPublicRoutes.post('/comments', async (c) => {
  const body = await readJson<{
    postSlug: string
    parentId?: string | null
    authorName: string
    authorEmail: string
    authorUrl?: string
    authorAvatar?: string
    content: string
  }>(c, JSON_BODY_LIMITS.note)

  if (!body.postSlug) throw ApiError.badRequest('postSlug is required')
  if (!body.authorName?.trim()) throw ApiError.badRequest('Name is required')
  if (!body.authorEmail?.trim() || !body.authorEmail.includes('@')) {
    throw ApiError.badRequest('Valid email is required')
  }
  if (!body.content?.trim()) throw ApiError.badRequest('Comment content is required')

  const post = await c.env.DB
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE slug = ?1 AND is_published = 1')
    .bind(body.postSlug)
    .first<{ id: string; allow_comments: number }>()
  if (!post) throw ApiError.notFound('Post not found')
  if (!post.allow_comments) throw ApiError.forbidden('Comments are disabled for this post')

  const settings = await getBlogSettings(c.env.DB)
  const initialStatus: BlogCommentStatus = settings.requireCommentApproval ? 'pending' : 'approved'

  const id = newId()
  const now = Date.now()
  const ip = requestClientIp(c) || null
  const ua = c.req.header('User-Agent') || null
  const avatar = body.authorAvatar || `https://api.dicebear.com/7.x/micah/svg?seed=${encodeURIComponent(body.authorName)}`

  await c.env.DB
    .prepare(`
      INSERT INTO blog_comments (
        id, post_id, parent_id, author_name, author_email, author_url,
        author_avatar, content, status, ip, user_agent, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    `)
    .bind(
      id,
      post.id,
      body.parentId || null,
      body.authorName.trim(),
      body.authorEmail.trim(),
      body.authorUrl?.trim() || null,
      avatar,
      body.content.trim(),
      initialStatus,
      ip,
      ua,
      now,
    )
    .run()

  return c.json({
    ok: true,
    status: initialStatus,
    message:
      initialStatus === 'pending'
        ? 'Comment submitted and pending moderation'
        : 'Comment published successfully',
  })
})
