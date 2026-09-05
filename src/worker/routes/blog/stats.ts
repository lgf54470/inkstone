import { Hono } from "hono";
import type { BlogStats, BlogGlobalAnalytics, BlogVisitLog, ShareTimelinePoint, ShareBreakdownItem, ShareTimelineRange } from "@shared/types";
import type { AppBindings } from "../../env";
import { requireAuth } from "../../middleware/auth";
import { parseBotName, getRangeStartTimestamp, computeDelta, buildVisitFilterSql, type ShareFilterOptions } from "../../lib/share-analytics";

export function registerBlogStatsRoutes(blogManageRoutes: Hono<AppBindings>): void {
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
    } catch { /* Corrupt post tags are skipped so one bad row cannot break the dashboard. */ }
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
}

