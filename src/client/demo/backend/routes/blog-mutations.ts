import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { BlogCategory, BlogFolder, BlogPost, BlogTag } from '@shared/types'
import { apiError, jsonBody } from '../helpers/info'
import { DAY, type BlogDemoData } from './blog-seed'

function slugFromTitle(title: string, seq: number): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || `post-${seq}`
}

function categorySlug(name: string, rawSlug: string | undefined, seq: number): string {
  const base = rawSlug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-')
  return base || `category-${seq}`
}

const POST_PATCH_KEYS = new Set(['slug', 'title', 'excerpt', 'content', 'coverUrl', 'categoryId', 'folderId', 'tags', 'isPublished', 'allowComments', 'isPinned'])

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
      applyPostPatch(existing, body, slug)
      return c.json({ ok: true, id: existing.id, slug })
    }

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
      publishedAt: isPublished ? now : 0,
      createdAt: now,
      updatedAt: now,
    }
    data.posts.push(post)
    return c.json({ ok: true, id, slug })
  })
}

function registerBlogPostItemRoutes(app: Hono, data: BlogDemoData, state: DemoState): void {
  app.patch('/api/blog/posts/:id', async (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
    const body = await jsonBody(c.req.raw)
    const slug = (body.slug as string | undefined)?.trim() || post.slug
    applyPostPatch(post, body, slug)
    return c.json({ ok: true })
  })

  app.delete('/api/blog/posts/:id', (c) => {
    const id = c.req.param('id')
    const index = data.posts.findIndex((item) => item.id === id)
    if (index < 0) return apiError(404, 'not_found', 'Post not found')
    data.posts.splice(index, 1)
    data.comments = data.comments.filter((comment) => comment.postId !== id)
    return c.json({ ok: true })
  })

  app.post('/api/blog/posts/:id/sync', (c) => {
    const post = data.posts.find((item) => item.id === c.req.param('id'))
    if (!post) return apiError(404, 'not_found', 'Post not found')
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
      data.posts = data.posts.filter((post) => !postIds.includes(post.id))
      data.comments = data.comments.filter((comment) => !postIds.includes(comment.postId))
      return c.json({ ok: true, count: postIds.length })
    }

    for (const post of data.posts) {
      if (postIds.includes(post.id)) applyBatchAction(post, action, body, now)
    }
    return c.json({ ok: true, count: postIds.length })
  })
}

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

function registerBlogVisitsRoute(app: Hono, data: BlogDemoData): void {
  app.delete('/api/blog/visits', (c) => {
    const type = c.req.query('type') ?? 'all'
    const days = parseInt(c.req.query('days') ?? '30', 10)
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
  registerBlogTagRoutes,
  registerBlogToggleGroupRoute,
  registerBlogVisitsRoute,
}