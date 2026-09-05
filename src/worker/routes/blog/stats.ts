import { Hono } from "hono";
import type { BlogGlobalAnalytics, BlogStats, BlogVisitLog, ShareBreakdownItem, ShareTimelineRange } from "@shared/types";
import type { AppBindings } from "../../env";
import { requireAuth } from "../../middleware/auth";
import { parseBotName, getRangeStartTimestamp, computeDelta, buildVisitFilterSql, buildShareTimeline, toBreakdown, type ShareFilterOptions } from "../../lib/share-analytics";

const DAY_MS = 24 * 60 * 60 * 1000

interface BlogVisitRow {
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
}

interface AnalyticsContext {
  range: ShareTimelineRange
  clause: string
  filters: ShareFilterOptions
  now: number
  startTs: number
  duration: number
  prevStartTs: number
}

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
    const analytics = await loadBlogAnalyticsPayload(c.env.DB, analyticsContext(c), c.get('userId')!)
    return c.json({ analytics })
  })
}

async function loadBlogAnalyticsPayload(
  db: D1Database,
  ctx: AnalyticsContext,
  userId: string,
): Promise<BlogGlobalAnalytics> {
  const postsSummary = await loadBlogPostsSummary(db, userId)
  const totalPosts = postsSummary?.total_posts ?? 0
  const publishedPosts = postsSummary?.published_posts ?? 0
  const draftPosts = Math.max(0, totalPosts - publishedPosts)
  const postStoredViews = postsSummary?.total_views ?? 0

  const currentRows = await loadBlogRangeVisits(db, userId, ctx.startTs, ctx.clause)
  const prevStats = await loadBlogPrevVisits(db, userId, ctx.prevStartTs, ctx.startTs, ctx.clause)
  const filterStats = await loadBlogFilterStats(db, userId, ctx.startTs)

  const currentViews = currentRows.length
  const currentVisitors = new Set(currentRows.map((r) => r.visitor_fp).filter(Boolean)).size
  const prevViews = prevStats?.prev_views ?? 0
  const prevVisitors = prevStats?.prev_uv ?? 0
  const totals = blogDisplayTotals({ currentViews, currentVisitors, postStoredViews, range: ctx.range, duration: ctx.duration })

  const timeline = buildShareTimeline(currentRows, ctx.range, ctx.startTs, ctx.duration)
  const sparklineViews = timeline.slice(-7).map((p) => p.views)
  const sparklineVisitors = timeline.slice(-7).map((p) => p.visitors)

  const postVisitsMap = aggregatePostVisits(currentRows)
  const topPosts = await loadBlogTopPosts(db, userId, postVisitsMap)
  const breakdown = breakdownStats(currentRows, postStoredViews)

  const recentVisits = await loadBlogRecentVisits(db, userId, ctx.filters)

  return {
    range: ctx.range,
    totalPosts,
    publishedPosts,
    draftPosts,
    totalViews: totals.views,
    totalVisitors: totals.visitors,
    viewsDelta: computeDelta(currentViews, prevViews),
    visitorsDelta: computeDelta(currentVisitors, prevVisitors),
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

function analyticsContext(c: { req: { query(key: string): string | undefined } }): AnalyticsContext {
  const range = (c.req.query('range') || '7d') as ShareTimelineRange
  const excludeBots = c.req.query('excludeBots') !== 'false'
  const excludeSelf = c.req.query('excludeSelf') === 'true'
  const excludeOwner = c.req.query('excludeOwner') === 'true'
  const filters: ShareFilterOptions = {
    excludeBots,
    excludeSelfReferrers: excludeSelf,
    excludeOwner,
  }
  const clause = buildVisitFilterSql(filters)

  const now = Date.now()
  const startTs = getRangeStartTimestamp(range, now)
  const duration = startTs > 0 ? now - startTs : 30 * DAY_MS
  return { range, clause, filters, now, startTs, duration, prevStartTs: startTs > 0 ? startTs - duration : 0 }
}

async function loadBlogPostsSummary(db: D1Database, userId: string): Promise<{ total_posts: number; published_posts: number; total_views: number } | null> {
  return db.prepare(
    `SELECT
       COUNT(*) as total_posts,
       COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_posts,
       COALESCE(SUM(views), 0) as total_views
     FROM blog_posts WHERE user_id = ?1`,
  )
    .bind(userId)
    .first<{ total_posts: number; published_posts: number; total_views: number }>()
}

async function loadBlogRangeVisits(db: D1Database, userId: string, startTs: number, clause: string): Promise<BlogVisitRow[]> {
  const rows = await db.prepare(
    `SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
            is_bot, is_self_referrer, is_owner, post_id, slug
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 ${clause}
      ORDER BY visited_at ASC`,
  )
    .bind(userId, startTs)
    .all<BlogVisitRow>()
  return rows.results ?? []
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

function aggregatePostVisits(currentRows: BlogVisitRow[]): Map<string, { views: number; uvs: Set<string>; slug: string }> {
  const postVisitsMap = new Map<string, { views: number; uvs: Set<string>; slug: string }>()
  for (const row of currentRows) {
    if (row.post_id) {
      const entry = postVisitsMap.get(row.post_id) ?? { views: 0, uvs: new Set<string>(), slug: row.slug }
      entry.views++
      if (row.visitor_fp) entry.uvs.add(row.visitor_fp)
      postVisitsMap.set(row.post_id, entry)
    }
  }
  return postVisitsMap
}

async function loadBlogTopPosts(
  db: D1Database,
  userId: string,
  postVisitsMap: Map<string, { views: number; uvs: Set<string>; slug: string }>,
): Promise<BlogGlobalAnalytics['topPosts']> {
  const allUserPosts = await db.prepare(
    `SELECT id, title, slug, views FROM blog_posts WHERE user_id = ?1 AND is_published = 1 ORDER BY views DESC LIMIT 10`,
  ).bind(userId).all<{ id: string; title: string; slug: string; views: number }>()

  return (allUserPosts.results ?? []).map((p) => {
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
}

interface BlogBreakdown {
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
}

function breakdownStats(currentRows: BlogVisitRow[], postStoredViews: number): BlogBreakdown {
  const { countryMap, referrerMap, deviceMap, osMap, browserMap } = aggregateBlogDistributions(currentRows)

  if (currentRows.length === 0 && postStoredViews > 0) {
    fillFallbackDistributions({ countryMap, referrerMap, deviceMap, osMap, browserMap }, postStoredViews)
  }

  const breakdownTotal = currentRows.length > 0 ? currentRows.length : postStoredViews
  return {
    topCountries: toBreakdown(countryMap, breakdownTotal),
    topReferrers: toBreakdown(referrerMap, breakdownTotal),
    devices: toBreakdown(deviceMap, breakdownTotal),
    osList: toBreakdown(osMap, breakdownTotal),
    browsers: toBreakdown(browserMap, breakdownTotal),
  }
}

interface BlogDistributionMaps {
  countryMap: Map<string, number>
  referrerMap: Map<string, number>
  deviceMap: Map<string, number>
  osMap: Map<string, number>
  browserMap: Map<string, number>
}

function aggregateBlogDistributions(rows: BlogVisitRow[]): BlogDistributionMaps {
  const countryMap = new Map<string, number>()
  const referrerMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const browserMap = new Map<string, number>()

  for (const row of rows) {
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

  return { countryMap, referrerMap, deviceMap, osMap, browserMap }
}

function fillFallbackDistributions(maps: BlogDistributionMaps, postStoredViews: number): void {
  const { countryMap, referrerMap, deviceMap, osMap, browserMap } = maps
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

async function loadBlogRecentVisits(db: D1Database, userId: string, filters: ShareFilterOptions): Promise<BlogVisitLog[]> {
  const rows = await db.prepare(
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
    const cutoff = Date.now() - Math.max(1, days) * DAY_MS
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
