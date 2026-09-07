import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { BlogCommentStatus, BlogPost, ShareTimelineRange } from '@shared/types'
import { apiError, jsonBody } from '../helpers/info'
import { buildAnalytics, buildStats, createBlogDemoData, type BlogDemoData } from './blog-seed'
import {
  registerBlogCategoryRoutes,
  registerBlogFolderRoutes,
  registerBlogPostBatchRoute,
  registerBlogPostItemRoutes,
  registerBlogPostWriteRoute,
  registerBlogTagRoutes,
  registerBlogToggleGroupRoute,
  registerBlogVisitsRoute,
} from './blog-mutations'

function matchPostFilters(post: BlogPost, status: string, categoryId: string | undefined, folderId: string | undefined, tag: string | undefined, search: string | undefined): boolean {
  if (status === 'published' && !post.isPublished) return false
  if (status === 'draft' && post.isPublished) return false
  if (status === 'pinned' && !post.isPinned) return false
  if (categoryId && post.categoryId !== categoryId) return false
  if (folderId && post.folderId !== folderId) return false
  if (tag && !post.tags.includes(tag)) return false
  if (search && !`${post.title} ${post.excerpt}`.toLowerCase().includes(search)) return false
  return true
}

function sortPosts(posts: BlogPost[], sort: string): BlogPost[] {
  const sorted = [...posts]
  switch (sort) {
    case 'published_asc': sorted.sort((a, b) => a.publishedAt - b.publishedAt); break
    case 'title_asc': sorted.sort((a, b) => a.title.localeCompare(b.title)); break
    case 'title_desc': sorted.sort((a, b) => b.title.localeCompare(a.title)); break
    case 'views_desc': sorted.sort((a, b) => b.views - a.views); break
    default: sorted.sort((a, b) => b.publishedAt - a.publishedAt)
  }
  return sorted
}

function registerBlogMetaRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/stats', (c) => c.json({ stats: buildStats(data.posts, data.comments, data.categories, data.tags) }))

  app.get('/api/blog/check-slug', (c) => {
    const slug = c.req.query('slug') ?? ''
    const currentPostId = c.req.query('currentPostId')
    const taken = data.posts.some((post) => post.slug === slug && post.id !== currentPostId)
    return c.json({ available: !taken })
  })

  app.get('/api/blog/note-post/:noteId', (c) => {
    const post = data.posts.find((item) => item.noteId === c.req.param('noteId')) ?? null
    return c.json({ post })
  })
}

function registerBlogSettingsRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/settings', (c) => c.json({ settings: data.settings }))
  app.patch('/api/blog/settings', async (c) => {
    data.settings = { ...data.settings, ...(await jsonBody(c.req.raw)) } as BlogDemoData['settings']
    return c.json({ settings: data.settings })
  })
}

function registerBlogPostListRoute(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/posts', (c) => {
    const filtered = data.posts.filter((post) => matchPostFilters(post, c.req.query('status') ?? 'all', c.req.query('categoryId'), c.req.query('folderId'), c.req.query('tag'), c.req.query('search')?.toLowerCase()))
    return c.json({ posts: sortPosts(filtered, c.req.query('sort') ?? 'published_desc') })
  })
}

function registerBlogCommentRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/comments', (c) => {
    const status = c.req.query('status') ?? 'all'
    const postId = c.req.query('postId')
    const search = c.req.query('search')?.toLowerCase()
    const filtered = data.comments
      .filter((comment) => status === 'all' || comment.status === status)
      .filter((comment) => !postId || comment.postId === postId)
      .filter((comment) => !search || `${comment.authorName} ${comment.content} ${comment.postTitle}`.toLowerCase().includes(search))
      .sort((a, b) => b.createdAt - a.createdAt)
    return c.json({ comments: filtered })
  })

  app.patch('/api/blog/comments/:id/status', async (c) => {
    const comment = data.comments.find((item) => item.id === c.req.param('id'))
    if (!comment) return apiError(404, 'not_found', 'Comment not found')
    const body = await jsonBody(c.req.raw)
    comment.status = body.status as BlogCommentStatus
    return c.json({ ok: true as const, status: comment.status })
  })

  app.delete('/api/blog/comments/:id', (c) => {
    const index = data.comments.findIndex((item) => item.id === c.req.param('id'))
    if (index < 0) return apiError(404, 'not_found', 'Comment not found')
    data.comments.splice(index, 1)
    return c.json({ ok: true as const })
  })

  app.post('/api/blog/comments/batch', async (c) => {
    const body = await jsonBody(c.req.raw)
    const action = body.action as 'approve' | 'reject' | 'spam' | 'delete'
    const ids = (body.commentIds as string[] | undefined) ?? []
    if (action === 'delete') {
      const before = data.comments.length
      data.comments = data.comments.filter((comment) => !ids.includes(comment.id))
      return c.json({ ok: true as const, count: before - data.comments.length })
    }
    const status: BlogCommentStatus = action === 'reject' ? 'rejected' : action === 'spam' ? 'spam' : 'approved'
    for (const comment of data.comments) {
      if (ids.includes(comment.id)) comment.status = status
    }
    return c.json({ ok: true as const, count: ids.length })
  })
}

function registerBlogAnalyticsRoute(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/analytics', (c) => {
    const range = (c.req.query('range') ?? '7d') as ShareTimelineRange
    return c.json({ analytics: buildAnalytics(data.posts, range, data.visits) })
  })
}

export function registerBlogRoutes(app: Hono, state: DemoState): void {
  const data = createBlogDemoData(state.user.id)
  registerBlogMetaRoutes(app, data)
  registerBlogSettingsRoutes(app, data)
  registerBlogPostListRoute(app, data)
  registerBlogPostWriteRoute(app, data)
  registerBlogPostItemRoutes(app, data, state)
  registerBlogPostBatchRoute(app, data)
  registerBlogFolderRoutes(app, data)
  registerBlogTagRoutes(app, data)
  registerBlogCategoryRoutes(app, data)
  registerBlogToggleGroupRoute(app, data)
  registerBlogVisitsRoute(app, data)
  registerBlogCommentRoutes(app, data)
  registerBlogAnalyticsRoute(app, data)
}