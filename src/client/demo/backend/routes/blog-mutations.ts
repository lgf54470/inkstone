import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { BlogCategory, BlogFolder, BlogPost, BlogTag } from '@shared/types'
import { apiError, jsonBody } from '../helpers/info'
import { DAY, toDemoTrashEntry, type BlogDemoData, type DemoRevisionRecord, type DemoTrashRecord } from './blog-seed'

/** The demo keeps the same twenty versions the worker keeps, moved and trimmed the same way. */
const DEMO_REVISION_LIMIT = 20

/** The fields a version preserves; the worker's snapshot list (ADR-0008) minus the state flags. */
const REVISION_FIELDS = ['slug', 'title', 'excerpt', 'content', 'coverUrl', 'categoryId', 'folderId', 'tags',
  'seoTitle', 'seoDescription', 'seoImageUrl', 'seoCanonicalUrl', 'seoNoindex'] as const

function snapshotDemoRevision(data: BlogDemoData, post: BlogPost, now: number): void {
  data.revisions.push({ id: `demo-revision-${++data.seq.revision}`, postId: post.id, snapshot: { ...post }, createdAt: now })
  const kept = data.revisions.filter((record) => record.postId === post.id).slice(-DEMO_REVISION_LIMIT).map((record) => record.id)
  data.revisions = data.revisions.filter((record) => record.postId !== post.id || kept.includes(record.id))
}

function revisionSummary(record: DemoRevisionRecord): { id: string; postId: string; title: string; size: number; createdAt: number } {
  return { id: record.id, postId: record.postId, title: record.snapshot.title, size: record.snapshot.content.length, createdAt: record.createdAt }
}

function slugFromTitle(title: string, seq: number): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || `post-${seq}`
}

function categorySlug(name: string, rawSlug: string | undefined, seq: number): string {
  const base = rawSlug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-')
  return base || `category-${seq}`
}

const POST_PATCH_KEYS = new Set([
  'slug', 'title', 'excerpt', 'content', 'coverUrl', 'categoryId', 'folderId', 'tags',
  'isPublished', 'allowComments', 'isPinned',
  'seoTitle', 'seoDescription', 'seoImageUrl', 'seoCanonicalUrl', 'seoNoindex',
])

function applyPostPatch(post: BlogPost, body: Record<string, unknown>, slug: string): void {
  const now = Date.now()
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => POST_PATCH_KEYS.has(key)))
  Object.assign(post, patch, { slug })
  if (post.isPublished && !post.publishedAt) post.publishedAt = now
  post.updatedAt = now
}

function registerBlogPostWriteRoute(app: Hono, data: BlogDemoData): void {
  app.post('/api/blog/posts', async (c) => {
    const body = await jsonBody(c.req.raw)
    const now = Date.now()
    const existing = data.posts.find((post) => post.noteId === body.noteId)
    if (existing) {
      const slug = (body.slug as string | undefined)?.trim() || existing.slug
      if (slug !== existing.slug && data.posts.some((post) => post.slug === slug)) {
        return apiError(409, 'conflict', 'Slug already exists')
      }
      snapshotDemoRevision(data, existing, now)
      applyPostPatch(existing, body, slug)
      return c.json({ ok: true, id: existing.id, slug })
    }

    // The worker's rule (FEA-04): the note keeps its one post, so publishing a note whose post waits
    // in the bin revives that post instead of creating a second one for the same note.
    const trashed = takeTrashedPost(data, (record) => record.post.noteId === body.noteId)
    if (trashed) {
      const slug = (body.slug as string | undefined)?.trim() || trashed.slug
      snapshotDemoRevision(data, trashed, now)
      applyPostPatch(trashed, body, slug)
      return c.json({ ok: true, id: trashed.id, slug })
    }

    const post = createPostFromBody(data, body, now)
    data.posts.push(post)
    return c.json({ ok: true, id: post.id, slug: post.slug })
  })
}

function createPostFromBody(data: BlogDemoData, body: Record<string, unknown>, now: number): BlogPost {
  const id = `demo-post-${++data.seq.post}`
  const slug = (body.slug as string | undefined)?.trim() || slugFromTitle((body.title as string) ?? '', data.seq.post)
  const isPublished = body.isPublished !== false
  const post: BlogPost = {
    id,
    slug,
    noteId: body.noteId as string,
    userId: data.userId,
    title: (body.title as string) ?? '',
    excerpt: (body.excerpt as string) ?? '',
    content: (body.content as string) ?? '',
    coverUrl: (body.coverUrl as string) ?? '',
    categoryId: (body.categoryId as string | null | undefined) ?? null,
    folderId: (body.folderId as string | null | undefined) ?? null,
    tags: (body.tags as string[] | undefined) ?? [],
    isPublished,
    allowComments: body.allowComments !== false,
    isPinned: body.isPinned === true,
    views: 0,
    commentsCount: 0,
    seoTitle: (body.seoTitle as string | undefined) ?? '',
    seoDescription: (body.seoDescription as string | undefined) ?? '',
    seoImageUrl: (body.seoImageUrl as string | undefined) ?? '',
    seoCanonicalUrl: (body.seoCanonicalUrl as string | undefined) ?? '',
    seoNoindex: body.seoNoindex === true,
    publishedAt: isPublished ? now : 0,
    createdAt: now,
    updatedAt: now,
  }
  return post
}

function registerBlogPostItemRoutes(app: Hono, data: BlogDemoData, state: DemoState): void {
  app.patch('/api/blog/posts/:id', async (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
    const body = await jsonBody(c.req.raw)
    const slug = (body.slug as string | undefined)?.trim() || post.slug
    // A patch that only moves presentation records no version, like the worker's rule.
    if (REVISION_FIELDS.some((key) => body[key] !== undefined)) snapshotDemoRevision(data, post, Date.now())
    applyPostPatch(post, body, slug)
    return c.json({ ok: true })
  })

  app.delete('/api/blog/posts/:id', (c) => {
    const id = c.req.param('id')
    if (!movePostToTrash(data, id, Date.now())) return apiError(404, 'not_found', 'Post not found')
    return c.json({ ok: true })
  })

  app.post('/api/blog/posts/:id/sync', (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
    snapshotDemoRevision(data, post, Date.now())
    const note = state.notes.get(post.noteId)
    if (note) {
      post.title = note.title
      post.content = note.content
    }
    const syncedAt = Date.now()
    post.updatedAt = syncedAt
    return c.json({ ok: true, syncedAt })
  })
}

function applyBatchAction(post: BlogPost, action: string, body: Record<string, unknown>, now: number): void {
  switch (action) {
    case 'publish':
      post.isPublished = true
      if (!post.publishedAt) post.publishedAt = now
      break
    case 'unpublish':
      post.isPublished = false
      break
    case 'setCategory':
      post.categoryId = (body.categoryId as string | null | undefined) ?? null
      break
    case 'setFolder':
      post.folderId = (body.folderId as string | null | undefined) ?? null
      break
    case 'setPinned':
      post.isPinned = body.isPinned === true
      break
  }
  post.updatedAt = now
}

function registerBlogPostBatchRoute(app: Hono, data: BlogDemoData): void {
  app.post('/api/blog/posts/batch', async (c) => {
    const body = await jsonBody(c.req.raw)
    const postIds = (body.postIds as string[] | undefined) ?? []
    if (postIds.length === 0) return c.json({ ok: true, count: 0 })
    const action = body.action as 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned'
    const now = Date.now()

    if (action === 'delete') {
      for (const id of postIds) movePostToTrash(data, id, now)
      return c.json({ ok: true, count: postIds.length })
    }

    for (const post of data.posts) {
      if (postIds.includes(post.id)) applyBatchAction(post, action, body, now)
    }
    return c.json({ ok: true, count: postIds.length })
  })
}

/**
 * The demo's own recycle bin: the post leaves `posts` for `trash`, and only its comments stay behind
 * so a restore brings the post back with the discussion it had (the worker does the same).
 */
function movePostToTrash(data: BlogDemoData, id: string, now: number): boolean {
  const index = data.posts.findIndex((post) => post.id === id)
  if (index < 0) return false
  const [post] = data.posts.splice(index, 1)
  data.trash.unshift({ post: post!, deletedAt: now })
  return true
}

function takeTrashedPost(data: BlogDemoData, match: (record: DemoTrashRecord) => boolean): BlogPost | null {
  const index = data.trash.findIndex(match)
  if (index < 0) return null
  const [record] = data.trash.splice(index, 1)
  data.posts.push(record!.post)
  return record!.post
}

export function registerBlogTrashRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/trash', (c) => c.json({ posts: data.trash.map(toDemoTrashEntry) }))

  app.post('/api/blog/trash/:id/restore', (c) => {
    const restored = takeTrashedPost(data, (record) => record.post.id === c.req.param('id'))
    if (!restored) return apiError(404, 'not_found', 'Post not found in the trash')
    return c.json({ ok: true })
  })

  app.delete('/api/blog/trash/:id', (c) => {
    const id = c.req.param('id')
    if (data.trash.every((record) => record.post.id !== id)) {
      return apiError(404, 'not_found', 'Post not found in the trash')
    }
    data.trash = data.trash.filter((record) => record.post.id !== id)
    data.comments = data.comments.filter((comment) => comment.postId !== id)
    // A purge is the one place the demo really drops a post, so its history goes with it.
    data.revisions = data.revisions.filter((record) => record.postId !== id)
    return c.json({ ok: true })
  })

  app.post('/api/blog/trash/empty', (c) => {
    const purged = data.trash.length
    const purgedIds = new Set(data.trash.map((record) => record.post.id))
    data.trash = []
    data.comments = data.comments.filter((comment) => !purgedIds.has(comment.postId))
    data.revisions = data.revisions.filter((record) => !purgedIds.has(record.postId))
    return c.json({ purged })
  })
}

// Unnamed fallbacks below are authored demo seed data (mirroring the welcome
// content in blog-seed.ts), not UI copy: the i18n layer never renders them.
function registerBlogFolderRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/folders', (c) => c.json(data.folders))

  app.post('/api/blog/folders', async (c) => {
    const body = await jsonBody(c.req.raw)
    const now = Date.now()
    const folder: BlogFolder = {
      id: `demo-folder-${++data.seq.folder}`,
      parentId: (body.parentId as string | null | undefined) ?? null,
      name: (body.name as string) ?? '未命名文件夹',
      icon: (body.icon as string | null | undefined) ?? null,
      color: (body.color as string | null | undefined) ?? null,
      position: (body.position as number | undefined) ?? data.folders.length,
      createdAt: now,
      updatedAt: now,
    }
    data.folders.push(folder)
    return c.json(folder, 201)
  })

  app.patch('/api/blog/folders/:id', async (c) => {
    const folder = data.folders.find((item) => item.id === c.req.param('id'))
    if (!folder) return apiError(404, 'not_found', 'Folder not found')
    const body = await jsonBody(c.req.raw)
    if (body.name !== undefined) folder.name = body.name as string
    if (body.parentId !== undefined) folder.parentId = body.parentId as string | null
    if (body.icon !== undefined) folder.icon = body.icon as string | null
    if (body.color !== undefined) folder.color = body.color as string | null
    if (body.position !== undefined) folder.position = body.position as number
    folder.updatedAt = Date.now()
    return c.json(folder)
  })

  app.delete('/api/blog/folders/:id', (c) => {
    const id = c.req.param('id')
    const index = data.folders.findIndex((item) => item.id === id)
    if (index < 0) return apiError(404, 'not_found', 'Folder not found')
    data.folders.splice(index, 1)
    for (const post of data.posts) {
      if (post.folderId === id) post.folderId = null
    }
    return c.json({ ok: true })
  })
}

function registerBlogTagRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/tags', (c) => c.json(data.tags))

  app.post('/api/blog/tags', async (c) => {
    const body = await jsonBody(c.req.raw)
    const tag: BlogTag = {
      id: `demo-tag-${++data.seq.tag}`,
      name: (body.name as string) ?? '未命名标签',
      color: (body.color as string | null | undefined) ?? null,
      isPinned: false,
      postsCount: 0,
      createdAt: Date.now(),
    }
    data.tags.push(tag)
    return c.json(tag, 201)
  })

  app.patch('/api/blog/tags/:id', async (c) => {
    const tag = data.tags.find((item) => item.id === c.req.param('id'))
    if (!tag) return apiError(404, 'not_found', 'Tag not found')
    const body = await jsonBody(c.req.raw)
    if (body.name !== undefined) tag.name = body.name as string
    if (body.color !== undefined) tag.color = body.color as string | null
    if (body.isPinned !== undefined) tag.isPinned = body.isPinned as boolean
    return c.json(tag)
  })

  app.delete('/api/blog/tags/:id', (c) => {
    const index = data.tags.findIndex((item) => item.id === c.req.param('id'))
    if (index < 0) return apiError(404, 'not_found', 'Tag not found')
    data.tags.splice(index, 1)
    return c.json({ ok: true })
  })
}

function registerBlogCategoryRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/categories', (c) => c.json({ categories: data.categories }))

  app.post('/api/blog/categories', async (c) => {
    const body = await jsonBody(c.req.raw)
    const now = Date.now()
    const name = (body.name as string) ?? '未命名分类'
    const category: BlogCategory = {
      id: `demo-cat-${++data.seq.category}`,
      name,
      slug: categorySlug(name, body.slug as string | undefined, data.seq.category),
      description: (body.description as string) ?? '',
      color: (body.color as string | null | undefined) ?? null,
      icon: (body.icon as string | null | undefined) ?? null,
      position: data.categories.length,
      postsCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    data.categories.push(category)
    return c.json({ category })
  })

  app.patch('/api/blog/categories/:id', async (c) => {
    const category = data.categories.find((item) => item.id === c.req.param('id'))
    if (!category) return apiError(404, 'not_found', 'Category not found')
    const body = await jsonBody(c.req.raw)
    if (body.name !== undefined) category.name = body.name as string
    if (body.slug !== undefined) category.slug = body.slug as string
    if (body.description !== undefined) category.description = body.description as string
    if (body.color !== undefined) category.color = body.color as string | null
    if (body.icon !== undefined) category.icon = body.icon as string | null
    if (body.position !== undefined) category.position = body.position as number
    category.updatedAt = Date.now()
    return c.json({ ok: true })
  })

  app.delete('/api/blog/categories/:id', (c) => {
    const id = c.req.param('id')
    const index = data.categories.findIndex((item) => item.id === id)
    if (index < 0) return apiError(404, 'not_found', 'Category not found')
    data.categories.splice(index, 1)
    for (const post of data.posts) {
      if (post.categoryId === id) post.categoryId = null
    }
    return c.json({ ok: true })
  })
}

/**
 * The demo's own version-history routes (FEA-05), mirroring the worker's three answers. A post in the
 * bin is not in `data.posts`, so its history answers 404 the same way the worker does.
 */
function registerBlogRevisionsRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/posts/:id/revisions', (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
    const revisions = data.revisions.filter((record) => record.postId === post.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(revisionSummary)
    return c.json({ revisions })
  })

  app.get('/api/blog/posts/:id/revisions/:revisionId', (c) => {
    const record = data.revisions.find((item) => item.id === c.req.param('revisionId') && item.postId === c.req.param('id'))
    if (!record) return apiError(404, 'not_found', 'Revision not found')
    return c.json({ revision: { ...revisionSummary(record), content: record.snapshot.content } })
  })

  app.post('/api/blog/posts/:id/revisions/:revisionId/restore', (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
    const record = data.revisions.find((item) => item.id === c.req.param('revisionId') && item.postId === post.id)
    if (!record) return apiError(404, 'not_found', 'Revision not found')
    const snapshot = record.snapshot
    if (snapshot.slug !== post.slug && data.posts.some((item) => item.id !== post.id && item.slug === snapshot.slug)) {
      return apiError(409, 'conflict', 'Slug already exists')
    }
    snapshotDemoRevision(data, post, Date.now())
    post.slug = snapshot.slug
    post.title = snapshot.title
    post.excerpt = snapshot.excerpt
    post.content = snapshot.content
    post.coverUrl = snapshot.coverUrl
    post.categoryId = snapshot.categoryId
    post.folderId = snapshot.folderId
    post.tags = [...snapshot.tags]
    post.seoTitle = snapshot.seoTitle
    post.seoDescription = snapshot.seoDescription
    post.seoImageUrl = snapshot.seoImageUrl
    post.seoCanonicalUrl = snapshot.seoCanonicalUrl
    post.seoNoindex = snapshot.seoNoindex
    post.updatedAt = Date.now()
    return c.json({ ok: true })
  })
}

function expandFolderSubtree(folders: BlogFolder[], root: string): Set<string> {
  const ids = new Set([root])
  let added = true
  while (added) {
    added = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        added = true
      }
    }
  }
  return ids
}

function registerBlogToggleGroupRoute(app: Hono, data: BlogDemoData): void {
  app.post('/api/blog/batch-toggle-group', async (c) => {
    const body = await jsonBody(c.req.raw)
    const type = body.type as 'folder' | 'tag'
    const target = body.target as string
    const enabled = body.enabled === true
    const folderIds = type === 'folder' ? expandFolderSubtree(data.folders, target) : null
    const now = Date.now()
    for (const post of data.posts) {
      const matches = folderIds
        ? post.folderId != null && folderIds.has(post.folderId)
        : post.tags.some((tag) => tag === target || tag.startsWith(`${target}/`))
      if (matches) {
        post.isPublished = enabled
        post.updatedAt = now
      }
    }
    return c.json({ ok: true })
  })
}

function registerBlogVisitsRoute(app: Hono, data: BlogDemoData, state: DemoState): void {
  app.delete('/api/blog/visits', async (c) => {
    const type = c.req.query('type') ?? 'all'
    const days = parseInt(c.req.query('days') ?? '30', 10)
    if (type === 'all') {
      const body = await jsonBody(c.req.raw)
      if (body.password !== state.password) {
        return apiError(401, 'wrong_password', 'The current password is incorrect')
      }
    }
    const before = data.visits.length
    if (type === 'bots') {
      data.visits = data.visits.filter((visit) => !visit.isBot)
    } else if (type === 'older_than') {
      const cutoff = Date.now() - Math.max(1, days) * DAY
      data.visits = data.visits.filter((visit) => visit.visitedAt >= cutoff)
    } else if (type === 'all') {
      data.visits = []
    }
    return c.json({ ok: true, deleted: before - data.visits.length })
  })
}

export {
  registerBlogCategoryRoutes,
  registerBlogFolderRoutes,
  registerBlogPostBatchRoute,
  registerBlogPostItemRoutes,
  registerBlogPostWriteRoute,
  registerBlogRevisionsRoutes,
  registerBlogTagRoutes,
  registerBlogToggleGroupRoute,
  registerBlogVisitsRoute,
}