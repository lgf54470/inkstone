import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { BlogCommentsCounts, BlogCommentStatus, BlogPost, BlogPostIndexEntry, BlogPostSummary, ShareTimelineRange } from '@shared/types'
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

const DEMO_BLOG_PAGE_SIZE = 50
const DEMO_BLOG_PAGE_SIZE_MAX = 200

/** The same split the real route makes: the list carries no body, the index carries no statistics. */
function toPostSummary(post: BlogPost): BlogPostSummary {
  return {
    id: post.id, slug: post.slug, noteId: post.noteId, userId: post.userId,
    title: post.title, excerpt: post.excerpt, coverUrl: post.coverUrl,
    categoryId: post.categoryId, folderId: post.folderId, tags: post.tags,
    isPublished: post.isPublished, allowComments: post.allowComments, isPinned: post.isPinned,
    views: post.views, commentsCount: post.commentsCount, publishedAt: post.publishedAt,
    createdAt: post.createdAt, updatedAt: post.updatedAt, ...demoSeo(post),
  }
}

/** The demo backend hands the same SEO shape back that the real one stores (FEA-02). */
function demoSeo(post: BlogPost) {
  return {
    seoTitle: post.seoTitle, seoDescription: post.seoDescription, seoImageUrl: post.seoImageUrl,
    seoCanonicalUrl: post.seoCanonicalUrl, seoNoindex: post.seoNoindex,
  }
}

function toIndexEntry(post: BlogPost): BlogPostIndexEntry {
  return {
    id: post.id, noteId: post.noteId, slug: post.slug, title: post.title,
    excerpt: post.excerpt, coverUrl: post.coverUrl, categoryId: post.categoryId,
    folderId: post.folderId, tags: post.tags, publishedAt: post.publishedAt,
    isPublished: post.isPublished, allowComments: post.allowComments, isPinned: post.isPinned,
    ...demoSeo(post),
  }
}

function registerBlogPostListRoute(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/posts', (c) => {
    const filtered = data.posts.filter((post) => matchPostFilters(post, c.req.query('status') ?? 'all', c.req.query('categoryId'), c.req.query('folderId'), c.req.query('tag'), c.req.query('search')?.toLowerCase()))
    const sorted = sortPosts(filtered, c.req.query('sort') ?? 'published_desc')
    const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1)
    const limit = Math.min(DEMO_BLOG_PAGE_SIZE_MAX, Math.max(1, Number(c.req.query('limit') ?? DEMO_BLOG_PAGE_SIZE) || DEMO_BLOG_PAGE_SIZE))
    const offset = (page - 1) * limit
    return c.json({
      posts: sorted.slice(offset, offset + limit).map(toPostSummary),
      pagination: { page, limit, total: sorted.length, totalPages: Math.ceil(sorted.length / limit) },
    })
  })

  app.get('/api/blog/post-index', (c) => c.json({ posts: data.posts.map(toIndexEntry) }))
}

const DEMO_COMMENTS_PAGE_LIMIT = 500

/** The same split the real route makes: counts ignore the status tab so every tab's size is real. */
function countCommentsByStatus(comments: BlogDemoData['comments']): BlogCommentsCounts {
  const counts: BlogCommentsCounts = { all: comments.length, pending: 0, approved: 0, rejected: 0, spam: 0 }
  for (const comment of comments) counts[comment.status] += 1
  return counts
}

function registerBlogCommentRoutes(app: Hono, data: BlogDemoData): void {
  app.get('/api/blog/comments', (c) => {
    const status = c.req.query('status') ?? 'all'
    const postId = c.req.query('postId')
    const search = c.req.query('search')?.toLowerCase()
    const matching = data.comments
      .filter((comment) => !postId || comment.postId === postId)
      .filter((comment) => !search || `${comment.authorName} ${comment.content} ${comment.postTitle}`.toLowerCase().includes(search))
    const counts = countCommentsByStatus(matching)
    const filtered = matching
      .filter((comment) => status === 'all' || comment.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, DEMO_COMMENTS_PAGE_LIMIT)
    return c.json({ comments: filtered, counts })
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
  registerBlogVisitsRoute(app, data, state)
  registerBlogCommentRoutes(app, data)
  registerBlogAnalyticsRoute(app, data)
}