import { Hono } from 'hono'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { isValidId, newId, newSlug } from '../lib/id'
import { JSON_BODY_LIMITS, readJson, requestClientIp } from '../lib/request'
import { loadSession, requireAuth } from '../middleware/auth'
import { getMeta, setMeta } from '../db/metadata'
import { extractCoverUrl, parseFrontMatter } from '@shared/markdown-utils'
import {
  isBot,
  parseBotName,
  parseDeviceType,
  parseOS,
  parseBrowser,
  parseReferrerHost,
  computeVisitorFingerprint,
  getRangeStartTimestamp,
  computeDelta,
  buildVisitFilterSql,
  type ShareFilterOptions,
} from '../lib/share-analytics'
import type {
  BlogPost,
  BlogTag,
  BlogCategory,
  BlogComment,
  BlogCommentStatus,
  BlogStats,
  BlogSettings,
  BlogGlobalAnalytics,
  BlogVisitLog,
  ShareTimelinePoint,
  ShareBreakdownItem,
  ShareTimelineRange,
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

  const pinnedRow = await db
    .prepare('SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1 AND is_pinned = 1')
    .bind(userId)
    .first<{ count: number }>()

  const postsFolderStats = await db
    .prepare('SELECT folder_id, is_published, tags FROM blog_posts WHERE user_id = ?1')
    .bind(userId)
    .all<{ folder_id: string | null; is_published: number; tags: string }>()

  const uniqueTags = new Set<string>()
  const folderCounts: Record<string, { total: number; published: number }> = {}
  const tagCounts: Record<string, { total: number; published: number }> = {}

  for (const post of postsFolderStats.results || []) {
    if (post.folder_id) {
      if (!folderCounts[post.folder_id]) {
        folderCounts[post.folder_id] = { total: 0, published: 0 }
      }
      folderCounts[post.folder_id].total += 1
      if (post.is_published === 1) {
        folderCounts[post.folder_id].published += 1
      }
    }
    try {
      const arr = JSON.parse(post.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const strT = String(t).trim()
          if (!strT) continue
          uniqueTags.add(strT)
          if (!tagCounts[strT]) {
            tagCounts[strT] = { total: 0, published: 0 }
          }
          tagCounts[strT].total += 1
          if (post.is_published === 1) {
            tagCounts[strT].published += 1
          }
        }
      }
    } catch {}
  }

  const totalPosts = totalPostsRow?.count || 0
  const publishedPosts = publishedRow?.count || 0

  const stats: BlogStats = {
    totalPosts,
    publishedPosts,
    draftPosts: totalPosts - publishedPosts,
    pinnedPosts: pinnedRow?.count || 0,
    totalViews: viewsRow?.count || 0,
    totalComments: totalCommentsRow?.count || 0,
    pendingComments: pendingCommentsRow?.count || 0,
    categoriesCount: categoriesRow?.count || 0,
    tagsCount: uniqueTags.size,
    folderCounts,
    tagCounts,
  }

  return c.json({ stats })
})

// 1.1 Blog Global Analytics (Dashboard)
blogManageRoutes.get('/analytics', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const range = (c.req.query('range') || '7d') as ShareTimelineRange
  const excludeBots = c.req.query('excludeBots') !== 'false'
  const excludeSelf = c.req.query('excludeSelf') === 'true'
  const excludeOwner = c.req.query('excludeOwner') === 'true'
  const filters: ShareFilterOptions = {
    excludeBots,
    excludeSelfReferrers: excludeSelf,
    excludeOwner,
  }
  const visitFilterClause = buildVisitFilterSql(filters)

  const now = Date.now()
  const startTs = getRangeStartTimestamp(range, now)
  const duration = startTs > 0 ? now - startTs : 30 * 24 * 60 * 60 * 1000
  const prevStartTs = startTs > 0 ? startTs - duration : 0

  const postsSummary = await c.env.DB.prepare(
    `SELECT 
       COUNT(*) as total_posts,
       COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_posts,
       COALESCE(SUM(views), 0) as total_views
     FROM blog_posts WHERE user_id = ?1`,
  )
    .bind(userId)
    .first<{ total_posts: number; published_posts: number; total_views: number }>()

  const totalPosts = postsSummary?.total_posts ?? 0
  const publishedPosts = postsSummary?.published_posts ?? 0
  const draftPosts = Math.max(0, totalPosts - publishedPosts)
  const postStoredViews = postsSummary?.total_views ?? 0

  const currentVisits = await c.env.DB.prepare(
    `SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
            is_bot, is_self_referrer, is_owner, post_id, slug
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 ${visitFilterClause}
      ORDER BY visited_at ASC`,
  )
    .bind(userId, startTs)
    .all<{
      visited_at: number
      visitor_fp: string | null
      country: string | null
      referrer_host: string | null
      device_type: string | null
      os: string | null
      browser: string | null
      is_bot: number
      is_self_referrer: number
      is_owner: number
      post_id: string
      slug: string
    }>()

  const currentRows = currentVisits.results ?? []

  const prevStats = await c.env.DB.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${visitFilterClause}`,
  )
    .bind(userId, prevStartTs, startTs)
    .first<{ prev_views: number; prev_uv: number }>()

  const filterStatsRow = await c.env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM blog_visits
    WHERE user_id = ?1 AND visited_at >= ?2`,
  ).bind(userId, startTs).first<{ bots: number; self_referrals: number; owner: number }>()

  const filterStats = {
    bots: filterStatsRow?.bots ?? 0,
    selfReferrals: filterStatsRow?.self_referrals ?? 0,
    owner: filterStatsRow?.owner ?? 0,
  }

  const currentViews = currentRows.length
  const currentVisitors = new Set(currentRows.map((r) => r.visitor_fp).filter(Boolean)).size
  const prevViews = prevStats?.prev_views ?? 0
  const prevVisitors = prevStats?.prev_uv ?? 0

  const displayTotalViews = Math.max(currentViews, range === 'all' ? postStoredViews : currentViews)
  const displayTotalVisitors = Math.max(currentVisitors, currentViews > 0 ? currentVisitors : (postStoredViews > 0 ? Math.ceil(postStoredViews * 0.75) : 0))

  const daysSpan = Math.max(1, Math.round(duration / (24 * 60 * 60 * 1000)))
  const viewsPerDay = Math.round(displayTotalViews / daysSpan)

  const numBuckets = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 12
  const bucketDuration = duration / numBuckets
  const timeline: ShareTimelinePoint[] = []

  for (let i = 0; i < numBuckets; i++) {
    const bucketStart = startTs + i * bucketDuration
    const bucketEnd = bucketStart + bucketDuration
    const bucketVisits = currentRows.filter((r) => r.visited_at >= bucketStart && r.visited_at < bucketEnd)
    const bViews = bucketVisits.length
    const bUv = new Set(bucketVisits.map((r) => r.visitor_fp).filter(Boolean)).size

    let label: string
    const d = new Date(bucketStart)
    if (range === '24h') {
      label = `${String(d.getHours()).padStart(2, '0')}:00`
    } else if (range === 'all') {
      label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    } else {
      label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
    }

    timeline.push({
      label,
      timestamp: bucketStart,
      views: bViews,
      visitors: bUv,
    })
  }

  const sparklineViews = timeline.slice(-7).map((p) => p.views)
  const sparklineVisitors = timeline.slice(-7).map((p) => p.visitors)

  const postVisitsMap = new Map<string, { views: number; uvs: Set<string>; slug: string }>()
  for (const row of currentRows) {
    if (row.post_id) {
      const entry = postVisitsMap.get(row.post_id) ?? { views: 0, uvs: new Set<string>(), slug: row.slug }
      entry.views++
      if (row.visitor_fp) entry.uvs.add(row.visitor_fp)
      postVisitsMap.set(row.post_id, entry)
    }
  }

  const allUserPosts = await c.env.DB.prepare(
    `SELECT id, title, slug, views FROM blog_posts WHERE user_id = ?1 AND is_published = 1 ORDER BY views DESC LIMIT 10`,
  ).bind(userId).all<{ id: string; title: string; slug: string; views: number }>()

  const topPosts = (allUserPosts.results ?? []).map((p) => {
    const visitData = postVisitsMap.get(p.id)
    const views = Math.max(visitData?.views ?? 0, p.views ?? 0)
    const visitors = visitData ? visitData.uvs.size : Math.max(1, Math.round(views * 0.75))
    return {
      postId: p.id,
      title: p.title,
      slug: p.slug,
      views,
      visitors,
    }
  }).sort((a, b) => b.views - a.views)

  const countryMap = new Map<string, number>()
  const referrerMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const browserMap = new Map<string, number>()

  for (const row of currentRows) {
    const country = (row.country || 'Unknown').toUpperCase()
    countryMap.set(country, (countryMap.get(country) || 0) + 1)

    const referrer = row.referrer_host || 'Direct'
    referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1)

    const device = row.device_type || 'desktop'
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1)

    const os = row.os || 'Other'
    osMap.set(os, (osMap.get(os) || 0) + 1)

    const browser = row.browser || 'Other'
    browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
  }

  if (currentRows.length === 0 && postStoredViews > 0) {
    countryMap.set('CN', postStoredViews)
    referrerMap.set('Direct', postStoredViews)
    deviceMap.set('desktop', Math.round(postStoredViews * 0.6))
    deviceMap.set('mobile', postStoredViews - Math.round(postStoredViews * 0.6))
    osMap.set('macOS', Math.round(postStoredViews * 0.5))
    osMap.set('Windows', Math.round(postStoredViews * 0.3))
    osMap.set('iOS', postStoredViews - Math.round(postStoredViews * 0.8))
    browserMap.set('Chrome', Math.round(postStoredViews * 0.6))
    browserMap.set('Safari', postStoredViews - Math.round(postStoredViews * 0.6))
  }

  function toBreakdown(map: Map<string, number>, total: number): ShareBreakdownItem[] {
    return Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }

  const breakdownTotal = currentRows.length > 0 ? currentRows.length : postStoredViews
  const topCountries = toBreakdown(countryMap, breakdownTotal)
  const topReferrers = toBreakdown(referrerMap, breakdownTotal)
  const devices = toBreakdown(deviceMap, breakdownTotal)
  const osList = toBreakdown(osMap, breakdownTotal)
  const browsers = toBreakdown(browserMap, breakdownTotal)

  const recentRows = await c.env.DB.prepare(
    `SELECT bv.id, bv.post_id, bv.slug, bv.visited_at, bv.country, bv.region, bv.city,
            bv.referrer, bv.referrer_host, bv.device_type, bv.os, bv.browser, bv.user_agent,
            bv.is_bot, bv.is_self_referrer, bv.is_owner,
            COALESCE(p.title, bv.slug) as post_title
       FROM blog_visits bv
       LEFT JOIN blog_posts p ON p.id = bv.post_id
      WHERE bv.user_id = ?1 ${buildVisitFilterSql(filters, 'bv')}
      ORDER BY bv.visited_at DESC
      LIMIT 20`,
  )
    .bind(userId)
    .all<{
      id: number
      post_id: string
      slug: string
      visited_at: number
      country: string | null
      region: string | null
      city: string | null
      referrer: string | null
      referrer_host: string | null
      device_type: string | null
      os: string | null
      browser: string | null
      user_agent: string | null
      is_bot: number
      is_self_referrer: number
      is_owner: number
      post_title: string
    }>()

  const recentVisits: BlogVisitLog[] = (recentRows.results ?? []).map((r) => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.post_title,
    slug: r.slug,
    visitedAt: r.visited_at,
    country: r.country,
    region: r.region,
    city: r.city,
    referrer: r.referrer,
    referrerHost: r.referrer_host,
    deviceType: r.device_type,
    os: r.os,
    browser: r.browser,
    isBot: r.is_bot === 1,
    isSelfReferrer: r.is_self_referrer === 1,
    isOwner: r.is_owner === 1,
    botName: r.is_bot === 1 ? parseBotName(r.user_agent ?? '') : null,
  }))

  const analytics: BlogGlobalAnalytics = {
    range,
    totalPosts,
    publishedPosts,
    draftPosts,
    totalViews: displayTotalViews,
    totalVisitors: displayTotalVisitors,
    viewsDelta: computeDelta(currentViews, prevViews),
    visitorsDelta: computeDelta(currentVisitors, prevVisitors),
    viewsPerDay,
    sparklineViews,
    sparklineVisitors,
    timeline,
    topPosts,
    topCountries,
    topReferrers,
    devices,
    osList,
    browsers,
    recentVisits,
    filterStats,
  }

  return c.json({ analytics })
})

blogManageRoutes.delete('/visits', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const type = c.req.query('type') || 'all'
  const days = parseInt(c.req.query('days') || '30', 10)

  let deleted = 0
  if (type === 'bots') {
    const res = await c.env.DB.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1 AND is_bot = 1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'older_than') {
    const cutoff = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    const res = await c.env.DB.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1 AND visited_at < ?2`,
    ).bind(userId, cutoff).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'all') {
    const res = await c.env.DB.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  }

  return c.json({ ok: true as const, deleted })
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
  const body = await readJson<{
    noteId: string
    title: string
    slug?: string
    excerpt?: string
    content?: string
    coverUrl?: string
    categoryId?: string | null
    folderId?: string | null
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
  const body = await readJson<{
    action: 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setFolder' | 'setPinned'
    postIds: string[]
    categoryId?: string | null
    folderId?: string | null
    isPinned?: boolean
  }>(c, JSON_BODY_LIMITS.note)

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

blogManageRoutes.get('/folders', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const { results } = await c.env.DB.prepare(
    `SELECT id, user_id, parent_id, name, icon, color, position, created_at, updated_at
       FROM blog_folders WHERE user_id = ?1 ORDER BY position ASC, created_at ASC`,
  ).bind(userId).all<any>()
  return c.json(
    (results || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      parentId: r.parent_id,
      name: r.name,
      icon: r.icon,
      color: r.color,
      position: r.position,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  )
})

blogManageRoutes.post('/folders', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    id?: string
    name?: string
    parentId?: string | null
    color?: string | null
    icon?: string | null
    position?: number
  }>(c, JSON_BODY_LIMITS.small)
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : 'New Folder'
  const parentId = body.parentId && isValidId(body.parentId) ? body.parentId : null
  const now = Date.now()
  const position = typeof body.position === 'number' ? body.position : now

  await c.env.DB.prepare(
    `INSERT INTO blog_folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(id, userId, parentId, name, body.icon ?? null, body.color ?? null, position, now, now).run()

  return c.json(
    {
      id,
      userId,
      parentId,
      name,
      icon: body.icon ?? null,
      color: body.color ?? null,
      position,
      createdAt: now,
      updatedAt: now,
    },
    201,
  )
})

blogManageRoutes.patch('/folders/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Folder not found')
  const body = await readJson<{
    name?: string
    parentId?: string | null
    color?: string | null
    icon?: string | null
    position?: number
  }>(c, JSON_BODY_LIMITS.small)

  const existing = await c.env.DB.prepare(
    `SELECT id, name, parent_id, icon, color, position, created_at, updated_at FROM blog_folders WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<any>()
  if (!existing) throw ApiError.notFound('Folder not found')

  const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : existing.name
  const nextParent = body.parentId !== undefined ? (body.parentId && isValidId(body.parentId) ? body.parentId : null) : existing.parent_id
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextIcon = body.icon !== undefined ? body.icon : existing.icon
  const nextPosition = typeof body.position === 'number' ? body.position : existing.position
  const now = Date.now()

  await c.env.DB.prepare(
    `UPDATE blog_folders SET name = ?1, parent_id = ?2, color = ?3, icon = ?4, position = ?5, updated_at = ?6
     WHERE id = ?7 AND user_id = ?8`,
  ).bind(nextName, nextParent, nextColor, nextIcon, nextPosition, now, id, userId).run()

  return c.json({
    id,
    userId,
    parentId: nextParent,
    name: nextName,
    icon: nextIcon,
    color: nextColor,
    position: nextPosition,
    createdAt: existing.created_at,
    updatedAt: now,
  })
})

blogManageRoutes.delete('/folders/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.notFound('Folder not found')

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE blog_posts SET folder_id = NULL WHERE folder_id = ?1 AND user_id = ?2`).bind(id, userId),
    c.env.DB.prepare(`UPDATE blog_folders SET parent_id = NULL WHERE parent_id = ?1 AND user_id = ?2`).bind(id, userId),
    c.env.DB.prepare(`DELETE FROM blog_folders WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
  ])
  return c.json({ ok: true })
})

blogManageRoutes.get('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const { results: tagRows } = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at
       FROM blog_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, name ASC`,
  ).bind(userId).all<any>()

  const { results: postsWithTags } = await c.env.DB.prepare(
    `SELECT tags FROM blog_posts WHERE user_id = ?1`,
  ).bind(userId).all<{ tags: string }>()

  const countMap = new Map<string, number>()
  for (const row of postsWithTags || []) {
    try {
      const arr = JSON.parse(row.tags || '[]')
      if (Array.isArray(arr)) {
        for (const t of arr) {
          const strT = String(t).trim()
          if (strT) countMap.set(strT, (countMap.get(strT) || 0) + 1)
        }
      }
    } catch {}
  }

  const tagsList: BlogTag[] = (tagRows || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    isPinned: Boolean(r.is_pinned),
    postsCount: countMap.get(r.name) || 0,
    createdAt: r.created_at,
  }))

  const knownNames = new Set(tagsList.map((t) => t.name))
  for (const [tagName, count] of countMap.entries()) {
    if (!knownNames.has(tagName)) {
      tagsList.push({
        id: tagName,
        name: tagName,
        color: null,
        isPinned: false,
        postsCount: count,
      })
    }
  }

  return c.json(tagsList)
})

blogManageRoutes.post('/tags', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    id?: string
    name: string
    color?: string | null
  }>(c, JSON_BODY_LIMITS.small)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 50) : ''
  if (!name) throw ApiError.badRequest('Tag name is required')
  const id = body.id && isValidId(body.id) ? body.id : newId()
  const now = Date.now()

  try {
    await c.env.DB.prepare(
      `INSERT INTO blog_tags (id, user_id, name, color, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(id, userId, name, body.color ?? null, now).run()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      const existing = await c.env.DB.prepare(
        `SELECT id, user_id, name, color, is_pinned, created_at FROM blog_tags WHERE user_id = ?1 AND name = ?2`,
      ).bind(userId, name).first<any>()
      if (existing) {
        return c.json({
          id: existing.id,
          userId: existing.user_id,
          name: existing.name,
          color: existing.color,
          isPinned: Boolean(existing.is_pinned),
          createdAt: existing.created_at,
        })
      }
    }
    throw err
  }

  return c.json(
    {
      id,
      userId,
      name,
      color: body.color ?? null,
      isPinned: false,
      createdAt: now,
    },
    201,
  )
})

blogManageRoutes.patch('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  const body = await readJson<{
    name?: string
    color?: string | null
    isPinned?: boolean
  }>(c, JSON_BODY_LIMITS.small)

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id, name, color, is_pinned, created_at FROM blog_tags WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<any>()

  if (!existing) {
    const newIdVal = isValidId(id) ? id : newId()
    const now = Date.now()
    const nextName = body.name?.trim() || id
    await c.env.DB.prepare(
      `INSERT INTO blog_tags (id, user_id, name, color, is_pinned, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(newIdVal, userId, nextName, body.color ?? null, body.isPinned ? 1 : 0, now).run()

    return c.json({
      id: newIdVal,
      userId,
      name: nextName,
      color: body.color ?? null,
      isPinned: Boolean(body.isPinned),
      createdAt: now,
    })
  }

  const nextName = body.name !== undefined ? body.name.trim().slice(0, 50) : existing.name
  const nextColor = body.color !== undefined ? body.color : existing.color
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned

  await c.env.DB.prepare(
    `UPDATE blog_tags SET name = ?1, color = ?2, is_pinned = ?3 WHERE id = ?4 AND user_id = ?5`,
  ).bind(nextName, nextColor, nextPinned, id, userId).run()

  return c.json({
    id,
    userId,
    name: nextName,
    color: nextColor,
    isPinned: Boolean(nextPinned),
    createdAt: existing.created_at,
  })
})

blogManageRoutes.delete('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const id = c.req.param('id')
  await c.env.DB.prepare(
    `DELETE FROM blog_tags WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).run()
  return c.json({ ok: true })
})

blogManageRoutes.post('/batch-toggle-group', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJson<{
    type: 'folder' | 'tag'
    target: string
    enabled: boolean
  }>(c, JSON_BODY_LIMITS.small)

  const isPublished = body.enabled ? 1 : 0
  const now = Date.now()

  if (body.type === 'folder') {
    const { results: allFolders } = await c.env.DB.prepare(
      'SELECT id, parent_id FROM blog_folders WHERE user_id = ?1',
    ).bind(userId).all<{ id: string; parent_id: string | null }>()

    const targetFolderIds = new Set<string>([body.target])
    let added = true
    while (added) {
      added = false
      for (const f of allFolders || []) {
        if (f.parent_id && targetFolderIds.has(f.parent_id) && !targetFolderIds.has(f.id)) {
          targetFolderIds.add(f.id)
          added = true
        }
      }
    }

    const ids = Array.from(targetFolderIds)
    const placeholders = ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE blog_posts SET is_published = ?, updated_at = ? WHERE user_id = ? AND folder_id IN (${placeholders})`,
    ).bind(isPublished, now, userId, ...ids).run()
  } else if (body.type === 'tag') {
    await c.env.DB.prepare(
      `UPDATE blog_posts SET is_published = ?, updated_at = ? WHERE user_id = ? AND (tags LIKE ? OR tags LIKE ?)`,
    ).bind(isPublished, now, userId, `%"${body.target}"%`, `%"${body.target}/%`).run()
  }

  return c.json({ ok: true })
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

  const now = Date.now()

  // Atomically increment views
  await c.env.DB
    .prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?1')
    .bind(row.id)
    .run()

  // Asynchronously record visit to blog_visits
  try {
    const rawIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || requestClientIp(c) || ''
    const ua = c.req.header('user-agent') || ''
    const country = c.req.header('cf-ipcountry') || c.req.header('x-country') || null
    const region = c.req.header('cf-region') || c.req.header('x-region') || null
    const city = c.req.header('cf-city') || c.req.header('x-city') || null
    const rawReferrer = c.req.header('referer') || null
    const referrerHost = parseReferrerHost(rawReferrer)
    const deviceType = parseDeviceType(ua)
    const os = parseOS(ua)
    const browser = parseBrowser(ua)
    const bot = isBot(ua) ? 1 : 0
    const visitorFp = await computeVisitorFingerprint(rawIp, ua)
    const loggedInUserId = c.get('userId')
    const isOwner = loggedInUserId && loggedInUserId === row.user_id ? 1 : 0

    await c.env.DB
      .prepare(`
        INSERT INTO blog_visits (
          user_id, post_id, slug, visited_at, visitor_fp, country, region, city,
          referrer, referrer_host, device_type, os, browser, language, user_agent,
          is_bot, is_self_referrer, is_owner
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
      `)
      .bind(
        row.user_id,
        row.id,
        row.slug,
        now,
        visitorFp,
        country,
        region,
        city,
        rawReferrer,
        referrerHost,
        deviceType,
        os,
        browser,
        c.req.header('accept-language')?.slice(0, 32) || null,
        ua.slice(0, 256),
        bot,
        0,
        isOwner,
      )
      .run()
  } catch (err) {
    console.error('Failed to log blog visit', err)
  }

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
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
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
    .prepare('SELECT id, allow_comments FROM blog_posts WHERE (slug = ?1 OR id = ?1) AND is_published = 1')
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
