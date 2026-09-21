import { Hono } from 'hono'
import type { BlogGlobalAnalytics, BlogStats, BlogVisitLog, ShareBreakdownItem, ShareTimelineRange } from '@shared/types'
import type { AppBindings } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { ApiError } from '../../lib/errors'
import { JSON_BODY_LIMITS, readOptionalJsonValidated } from '../../lib/request'
import { requireCurrentPassword } from '../../lib/reauth'
import { blogVisitWipeSchema } from './schemas'
import {
  analyticsWindow,
  buildBucketedTimeline,
  computeDelta,
  parseAnalyticsRequest,
  parseBotName,
  toBreakdown,
  type AnalyticsRequest,
  type AnalyticsWindow,
} from '../../lib/share-analytics'
import type { VisitTrafficFilters } from '@shared/share-selection'
import { visitTrafficSql } from '../../lib/share-selection-sql'
import {
  BLOG_VISIT_SOURCE,
  visitAggregateFromResults,
  visitAggregateStatements,
  type VisitAggregate,
  type VisitDistributionMaps,
  type VisitTargetStat,
} from '../../lib/visit-aggregates'

const DAY_MS = 24 * 60 * 60 * 1000

interface MinVisitedRow {
  min_ts: number | null
}

type AnalyticsContext = AnalyticsRequest & AnalyticsWindow

export function registerBlogStatsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogStatsRoute(blogManageRoutes)
  registerBlogAnalyticsRoute(blogManageRoutes)
  registerBlogVisitsDeleteRoute(blogManageRoutes)
}

function registerBlogStatsRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/stats', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const stats = await loadBlogStats(c.env.DB, userId)
    return c.json({ stats })
  })
}

async function loadBlogStats(db: D1Database, userId: string): Promise<BlogStats> {
  const totalPosts = (await countBlogPosts(db, userId, 'SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1')) ?? 0
  const publishedPosts = (await countBlogPosts(db, userId, 'SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1 AND is_published = 1')) ?? 0
  const pinnedPosts = (await countBlogPosts(db, userId, 'SELECT COUNT(*) as count FROM blog_posts WHERE user_id = ?1 AND is_pinned = 1')) ?? 0
  const totalViews = (await countBlogPosts(db, userId, 'SELECT COALESCE(SUM(views), 0) as count FROM blog_posts WHERE user_id = ?1')) ?? 0
  const totalComments = (await countBlogComments(db, userId, false)) ?? 0
  const pendingComments = (await countBlogComments(db, userId, true)) ?? 0
  const categoriesCount = (await countBlogPosts(db, userId, 'SELECT COUNT(*) as count FROM blog_categories WHERE user_id = ?1')) ?? 0

  const postsFolderStats = await db
    .prepare('SELECT folder_id, is_published, tags FROM blog_posts WHERE user_id = ?1')
    .bind(userId)
    .all<{ folder_id: string | null; is_published: number; tags: string }>()

  const { uniqueTags, folderCounts, tagCounts } = accumulatePostCounts(postsFolderStats.results ?? [])

  return {
    totalPosts,
    publishedPosts,
    draftPosts: totalPosts - publishedPosts,
    pinnedPosts,
    totalViews,
    totalComments,
    pendingComments,
    categoriesCount,
    tagsCount: uniqueTags.size,
    folderCounts,
    tagCounts,
  }
}

async function countBlogPosts(db: D1Database, userId: string, sql: string): Promise<number> {
  const row = await db.prepare(sql).bind(userId).first<{ count: number }>()
  return row?.count ?? 0
}

async function countBlogComments(db: D1Database, userId: string, pendingOnly: boolean): Promise<number> {
  const row = await db.prepare(
    pendingOnly
      ? "SELECT COUNT(*) as count FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE p.user_id = ?1 AND c.status = 'pending'"
      : 'SELECT COUNT(*) as count FROM blog_comments c JOIN blog_posts p ON c.post_id = p.id WHERE p.user_id = ?1',
  ).bind(userId).first<{ count: number }>()
  return row?.count ?? 0
}

function accumulatePostCounts(rows: Array<{ folder_id: string | null; is_published: number; tags: string }>): {
  uniqueTags: Set<string>
  folderCounts: Record<string, { total: number; published: number }>
  tagCounts: Record<string, { total: number; published: number }>
} {
  const uniqueTags = new Set<string>()
  const folderCounts: Record<string, { total: number; published: number }> = {}
  const tagCounts: Record<string, { total: number; published: number }> = {}

  for (const post of rows) {
    accumulatePostFolder(folderCounts, post.folder_id, post.is_published === 1)
    accumulatePostTags(uniqueTags, tagCounts, post.tags, post.is_published === 1)
  }

  return { uniqueTags, folderCounts, tagCounts }
}

function accumulatePostFolder(
  folderCounts: Record<string, { total: number; published: number }>,
  folderId: string | null,
  published: boolean,
): void {
  if (!folderId) return
  if (!folderCounts[folderId]) {
    folderCounts[folderId] = { total: 0, published: 0 }
  }
  folderCounts[folderId].total += 1
  if (published) {
    folderCounts[folderId].published += 1
  }
}

function accumulatePostTags(
  uniqueTags: Set<string>,
  tagCounts: Record<string, { total: number; published: number }>,
  raw: string,
  published: boolean,
): void {
  let arr: unknown
  try {
    arr = JSON.parse(raw || '[]')
  } catch { /* Corrupt post tags are skipped so one bad row cannot break the dashboard. */ }
  if (!Array.isArray(arr)) return
  for (const t of arr) {
    const strT = String(t).trim()
    if (!strT) continue
    uniqueTags.add(strT)
    if (!tagCounts[strT]) {
      tagCounts[strT] = { total: 0, published: 0 }
    }
    tagCounts[strT].total += 1
    if (published) {
      tagCounts[strT].published += 1
    }
  }
}

function registerBlogAnalyticsRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/analytics', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const analytics = await loadBlogAnalyticsPayload(c.env.DB, await analyticsContext(c.env.DB, c, userId), userId)
    return c.json({ analytics })
  })
}

async function analyticsContext(db: D1Database, c: { req: { query(key: string): string | undefined } }, userId: string): Promise<AnalyticsContext> {
  const request = parseAnalyticsRequest(c)
  const minRow = request.range === 'all'
    ? await db.prepare('SELECT MIN(visited_at) as min_ts FROM blog_visits WHERE user_id = ?1').bind(userId).first<MinVisitedRow>()
    : null
  return { ...request, ...analyticsWindow(request.range, request.now, minRow?.min_ts ?? null) }
}

async function loadBlogAnalyticsPayload(
  db: D1Database,
  ctx: AnalyticsContext,
  userId: string,
): Promise<BlogGlobalAnalytics> {
  const posts = blogPostCounts(await loadBlogPostsSummary(db, userId))

  const aggregate = visitAggregateFromResults(
    await db.batch(visitAggregateStatements(db, BLOG_VISIT_SOURCE, { userId }, ctx)),
    ctx,
    BLOG_VISIT_SOURCE,
  )
  const prevStats = await loadBlogPrevVisits(db, userId, ctx.prevStartTs, ctx.startTs, ctx.clause)
  const filterStats = await loadBlogFilterStats(db, userId, ctx.startTs)

  const totals = blogDisplayTotals({
    currentViews: aggregate.views,
    currentVisitors: aggregate.visitors,
    postStoredViews: posts.postStoredViews,
    range: ctx.range,
    duration: ctx.duration,
  })

  const timeline = buildBucketedTimeline(aggregate.buckets, ctx.range, ctx.startTs, ctx.duration)
  const sparklineViews = timeline.slice(-7).map((p) => p.views)
  const sparklineVisitors = timeline.slice(-7).map((p) => p.visitors)

  const topPosts = await loadBlogTopPosts(db, userId, aggregate.targets)
  const breakdown = breakdownStats(aggregate, posts.postStoredViews)

  const recentVisits = await loadBlogRecentVisits(db, userId, ctx.filters)

  return {
    range: ctx.range,
    totalPosts: posts.totalPosts,
    publishedPosts: posts.publishedPosts,
    draftPosts: posts.draftPosts,
    totalViews: totals.views,
    totalVisitors: totals.visitors,
    viewsDelta: computeDelta(aggregate.views, prevStats?.prev_views ?? 0),
    visitorsDelta: computeDelta(aggregate.visitors, prevStats?.prev_uv ?? 0),
    viewsPerDay: totals.viewsPerDay,
    sparklineViews,
    sparklineVisitors,
    timeline,
    topPosts,
    ...breakdown,
    recentVisits,
    filterStats,
  }
}

interface BlogPostsSummaryRow {
  total_posts: number
  published_posts: number
  total_views: number
}

function blogPostCounts(summary: BlogPostsSummaryRow | null): {
  totalPosts: number
  publishedPosts: number
  draftPosts: number
  postStoredViews: number
} {
  const totalPosts = summary?.total_posts ?? 0
  const publishedPosts = summary?.published_posts ?? 0
  return {
    totalPosts,
    publishedPosts,
    draftPosts: Math.max(0, totalPosts - publishedPosts),
    postStoredViews: summary?.total_views ?? 0,
  }
}

async function loadBlogPostsSummary(db: D1Database, userId: string): Promise<BlogPostsSummaryRow | null> {
  return db.prepare(
    `SELECT
       COUNT(*) as total_posts,
       COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_posts,
       COALESCE(SUM(views), 0) as total_views
     FROM blog_posts WHERE user_id = ?1`,
  )
    .bind(userId)
    .first<BlogPostsSummaryRow>()
}

async function loadBlogPrevVisits(
  db: D1Database,
  userId: string,
  prevStartTs: number,
  startTs: number,
  clause: string,
): Promise<{ prev_views: number; prev_uv: number } | null> {
  return db.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${clause}`,
  )
    .bind(userId, prevStartTs, startTs)
    .first<{ prev_views: number; prev_uv: number }>()
}

async function loadBlogFilterStats(db: D1Database, userId: string, startTs: number): Promise<{ bots: number; selfReferrals: number; owner: number }> {
  const row = await db.prepare(
    `SELECT
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM blog_visits
    WHERE user_id = ?1 AND visited_at >= ?2`,
  ).bind(userId, startTs).first<{ bots: number; self_referrals: number; owner: number }>()
  return {
    bots: row?.bots ?? 0,
    selfReferrals: row?.self_referrals ?? 0,
    owner: row?.owner ?? 0,
  }
}

function blogDisplayTotals(params: {
  currentViews: number
  currentVisitors: number
  postStoredViews: number
  range: ShareTimelineRange
  duration: number
}): { views: number; visitors: number; viewsPerDay: number } {
  const { currentViews, currentVisitors, postStoredViews, range, duration } = params
  const views = Math.max(currentViews, range === 'all' ? postStoredViews : currentViews)
  const visitors = Math.max(currentVisitors, currentViews > 0 ? currentVisitors : (postStoredViews > 0 ? Math.ceil(postStoredViews * 0.75) : 0))
  const daysSpan = Math.max(1, Math.round(duration / DAY_MS))
  return { views, visitors, viewsPerDay: Math.round(views / daysSpan) }
}

async function loadBlogTopPosts(
  db: D1Database,
  userId: string,
  targets: Map<string, VisitTargetStat>,
): Promise<BlogGlobalAnalytics['topPosts']> {
  const allUserPosts = await db.prepare(
    `SELECT id, title, slug, views FROM blog_posts WHERE user_id = ?1 AND is_published = 1 ORDER BY views DESC LIMIT 10`,
  ).bind(userId).all<{ id: string; title: string; slug: string; views: number }>()

  return (allUserPosts.results ?? []).map((p) => {
    const visitData = targets.get(p.id)
    const views = Math.max(visitData?.views ?? 0, p.views ?? 0)
    const visitors = visitData ? visitData.visitors : Math.max(1, Math.round(views * 0.75))
    return {
      postId: p.id,
      title: p.title,
      slug: p.slug,
      views,
      visitors,
    }
  }).sort((a, b) => b.views - a.views)
}

interface BlogBreakdown {
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
}

function breakdownStats(aggregate: VisitAggregate, postStoredViews: number): BlogBreakdown {
  const maps: VisitDistributionMaps = aggregate

  if (aggregate.views === 0 && postStoredViews > 0) {
    fillFallbackDistributions(maps, postStoredViews)
  }

  const breakdownTotal = aggregate.views > 0 ? aggregate.views : postStoredViews
  return {
    topCountries: toBreakdown(maps.countries, breakdownTotal),
    topReferrers: toBreakdown(maps.referrers, breakdownTotal),
    devices: toBreakdown(maps.devices, breakdownTotal),
    osList: toBreakdown(maps.osList, breakdownTotal),
    browsers: toBreakdown(maps.browsers, breakdownTotal),
  }
}

function fillFallbackDistributions(maps: VisitDistributionMaps, postStoredViews: number): void {
  maps.countries.set('CN', postStoredViews)
  maps.referrers.set('Direct', postStoredViews)
  maps.devices.set('desktop', Math.round(postStoredViews * 0.6))
  maps.devices.set('mobile', postStoredViews - Math.round(postStoredViews * 0.6))
  maps.osList.set('macOS', Math.round(postStoredViews * 0.5))
  maps.osList.set('Windows', Math.round(postStoredViews * 0.3))
  maps.osList.set('iOS', postStoredViews - Math.round(postStoredViews * 0.8))
  maps.browsers.set('Chrome', Math.round(postStoredViews * 0.6))
  maps.browsers.set('Safari', postStoredViews - Math.round(postStoredViews * 0.6))
}

interface BlogRecentVisitRow {
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
}

async function loadBlogRecentVisits(db: D1Database, userId: string, filters: VisitTrafficFilters): Promise<BlogVisitLog[]> {
  const rows = await db.prepare(
    `SELECT bv.id, bv.post_id, bv.slug, bv.visited_at, bv.country, bv.region, bv.city,
            bv.referrer, bv.referrer_host, bv.device_type, bv.os, bv.browser, bv.user_agent,
            bv.is_bot, bv.is_self_referrer, bv.is_owner,
            COALESCE(p.title, bv.slug) as post_title
       FROM blog_visits bv
       LEFT JOIN blog_posts p ON p.id = bv.post_id
      WHERE bv.user_id = ?1 ${visitTrafficSql(filters, 'bv')}
      ORDER BY bv.visited_at DESC
      LIMIT 20`,
  )
    .bind(userId)
    .all<BlogRecentVisitRow>()

  return (rows.results ?? []).map((r) => ({
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
}

function registerBlogVisitsDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/visits', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const type = c.req.query('type') || 'all'
    const days = parseInt(c.req.query('days') || '30', 10)
    if (type === 'older_than' && !(days >= 1)) {
      throw ApiError.badRequest('Cleaning visit logs older than N days requires a positive integer for days')
    }
    if (type === 'all') {
      // Wiping the whole trail is unrecoverable, so a stolen session must re-prove
      // it holds the account password before the delete runs (same as share SH-12).
      const body = await readOptionalJsonValidated(c, blogVisitWipeSchema, JSON_BODY_LIMITS.small, {})
      await requireCurrentPassword(c.env.DB, userId, body.password ?? '')
    }
    const deleted = await deleteBlogVisitLogs(c.env.DB, userId, type, days)
    return c.json({ ok: true as const, deleted })
  })
}

async function deleteBlogVisitLogs(db: D1Database, userId: string, type: string, days: number): Promise<number> {
  if (type === 'bots') {
    const res = await db.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1 AND is_bot = 1`,
    ).bind(userId).run()
    return res.meta.changes ?? 0
  }
  if (type === 'older_than') {
    const cutoff = Date.now() - days * DAY_MS
    const res = await db.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1 AND visited_at < ?2`,
    ).bind(userId, cutoff).run()
    return res.meta.changes ?? 0
  }
  if (type === 'all') {
    const res = await db.prepare(
      `DELETE FROM blog_visits WHERE user_id = ?1`,
    ).bind(userId).run()
    return res.meta.changes ?? 0
  }
  return 0
}
