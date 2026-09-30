import { Hono } from 'hono'
import type { BlogGlobalAnalytics, BlogStats, BlogVisitLog, ShareBreakdownItem } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { clampInt, JSON_BODY_LIMITS, readOptionalJsonValidated } from '../../lib/request'
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
import {
  blogPostFolderCountsStatement,
  blogPostTagCountsStatement,
  toBlogPostFolderCounts,
  toBlogPostTagCounts,
  type BlogPostFolderCountRow,
  type BlogPostTagCountRow,
} from './post-counts'

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
  blogManageRoutes.get('/stats', async (c) => {
    const userId = c.get('userId')!
    const stats = await loadBlogStats(c.env.DB, userId)
    return c.json({ stats })
  })
}

/**
 * The dashboard's counts in one batch: five aggregates instead of seven serial reads and two full
 * scans of `blog_posts`. The folder and tag counts read the posts' JSON in SQL rather than bringing
 * every row back to parse it here (`post-counts.ts`), the half `GET /tags` reuses.
 */
async function loadBlogStats(db: D1Database, userId: string): Promise<BlogStats> {
  const [postsResult, commentsResult, categoriesResult, foldersResult, tagsResult] = await db.batch([
    blogPostsSummaryStatement(db, userId),
    blogCommentsSummaryStatement(db, userId),
    db.prepare('SELECT COUNT(*) AS count FROM blog_categories WHERE user_id = ?1').bind(userId),
    blogPostFolderCountsStatement(db, userId),
    blogPostTagCountsStatement(db, userId),
  ])
  const posts = firstRow<BlogPostsSummaryRow>(postsResult)
  const comments = firstRow<BlogCommentsSummaryRow>(commentsResult)
  const totalPosts = posts?.total_posts ?? 0
  const publishedPosts = posts?.published_posts ?? 0
  const { tagCounts, tagsCount } = toBlogPostTagCounts(rowsOf<BlogPostTagCountRow>(tagsResult))

  return {
    totalPosts,
    publishedPosts,
    draftPosts: totalPosts - publishedPosts,
    pinnedPosts: posts?.pinned_posts ?? 0,
    totalViews: posts?.total_views ?? 0,
    totalComments: comments?.total_comments ?? 0,
    pendingComments: comments?.pending_comments ?? 0,
    categoriesCount: firstRow<BlogCountRow>(categoriesResult)?.count ?? 0,
    tagsCount,
    folderCounts: toBlogPostFolderCounts(rowsOf<BlogPostFolderCountRow>(foldersResult)),
    tagCounts,
  }
}

interface BlogPostsSummaryRow {
  total_posts: number
  published_posts: number
  pinned_posts: number
  total_views: number
}

interface BlogCommentsSummaryRow {
  total_comments: number
  pending_comments: number
}

interface BlogCountRow {
  count: number
}

function blogPostsSummaryStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as total_posts,
            COUNT(CASE WHEN is_published = 1 THEN 1 END) as published_posts,
            COUNT(CASE WHEN is_pinned = 1 THEN 1 END) as pinned_posts,
            COALESCE(SUM(views), 0) as total_views
       FROM blog_posts WHERE user_id = ?1`,
  ).bind(userId)
}

function blogCommentsSummaryStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as total_comments,
            COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_comments
       FROM blog_comments c
       JOIN blog_posts p ON c.post_id = p.id
      WHERE p.user_id = ?1`,
  ).bind(userId)
}

interface D1ResultRows {
  results?: unknown[]
}

/** Row readers for `db.batch` results, which is how every aggregate on this page comes back. */
function firstRow<Row>(result: D1ResultRows | undefined): Row | null {
  return (result?.results?.[0] as Row | undefined) ?? null
}

function rowsOf<Row>(result: D1ResultRows | undefined): Row[] {
  return (result?.results ?? []) as Row[]
}

function registerBlogAnalyticsRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/analytics', async (c) => {
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

/**
 * One batch carries every segment of the answer that does not depend on another: the post summary,
 * the previous window, the filter counts, the recent visits and the eight visit aggregates. Only
 * the top-post titles need a second flight, because they are looked up once the aggregates have
 * decided which posts are on the list.
 */
async function loadBlogAnalyticsPayload(
  db: D1Database,
  ctx: AnalyticsContext,
  userId: string,
): Promise<BlogGlobalAnalytics> {
  const [summaryResult, prevResult, filterResult, recentResult, ...visitResults] = await db.batch([
    blogPostsSummaryStatement(db, userId),
    blogPrevVisitsStatement(db, userId, ctx.prevStartTs, ctx.startTs, ctx.clause),
    blogFilterStatsStatement(db, userId, ctx.startTs),
    blogRecentVisitsStatement(db, userId, ctx.filters),
    ...visitAggregateStatements(db, BLOG_VISIT_SOURCE, { userId }, ctx),
  ])
  const posts = blogPostCounts(firstRow<BlogPostsSummaryRow>(summaryResult))
  const aggregate = visitAggregateFromResults(visitResults, ctx)
  const prevStats = firstRow<BlogPrevVisitsRow>(prevResult)
  const filterStats = firstRow<BlogFilterStatsRow>(filterResult)

  const totals = blogDisplayTotals(aggregate.views, ctx.duration)

  const timeline = buildBucketedTimeline(aggregate.buckets, ctx.range, ctx.startTs, ctx.duration)
  const sparklineViews = timeline.slice(-7).map((p) => p.views)
  const sparklineVisitors = timeline.slice(-7).map((p) => p.visitors)

  const topPosts = await loadBlogTopPosts(db, userId, aggregate.targets)
  const breakdown = breakdownStats(aggregate)
  const recentVisits = toBlogVisitLogs(rowsOf<BlogRecentVisitRow>(recentResult))

  return {
    range: ctx.range,
    totalPosts: posts.totalPosts,
    publishedPosts: posts.publishedPosts,
    draftPosts: posts.draftPosts,
    totalViews: totals.views,
    totalVisitors: aggregate.visitors,
    // The counter on the posts is a different measure from the range's own visits (it also holds
    // what a browser reported before this account ever kept visit rows), so it travels separately
    // instead of being folded into the range numbers.
    storedViews: posts.postStoredViews,
    viewsDelta: computeDelta(aggregate.views, prevStats?.prev_views ?? 0),
    visitorsDelta: computeDelta(aggregate.visitors, prevStats?.prev_uv ?? 0),
    viewsPerDay: totals.viewsPerDay,
    sparklineViews,
    sparklineVisitors,
    timeline,
    topPosts,
    ...breakdown,
    recentVisits,
    filterStats: {
      bots: filterStats?.bots ?? 0,
      selfReferrals: filterStats?.self_referrals ?? 0,
      owner: filterStats?.owner ?? 0,
    },
  }
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

interface BlogPrevVisitsRow {
  prev_views: number
  prev_uv: number
}

interface BlogFilterStatsRow {
  bots: number
  self_referrals: number
  owner: number
}

function blogPrevVisitsStatement(
  db: D1Database,
  userId: string,
  prevStartTs: number,
  startTs: number,
  clause: string,
): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${clause}`,
  )
    .bind(userId, prevStartTs, startTs)
}

function blogFilterStatsStatement(db: D1Database, userId: string, startTs: number): D1PreparedStatement {
  return db.prepare(
    `SELECT
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM blog_visits
    WHERE user_id = ?1 AND visited_at >= ?2`,
  ).bind(userId, startTs)
}

/**
 * The range's own numbers, and nothing else. It used to answer with the largest of three values —
 * the range count, the cumulative counter on the posts, and a `views × 0.75` visitors estimate — so
 * a range with no visits at all reported the blog's whole history under a "this week" label, and the
 * estimate appeared next to a real PV of 0.
 */
function blogDisplayTotals(currentViews: number, duration: number): { views: number; viewsPerDay: number } {
  const daysSpan = Math.max(1, Math.round(duration / DAY_MS))
  return { views: currentViews, viewsPerDay: Math.round(currentViews / daysSpan) }
}

/**
 * The ranking is the range's own: a post is on it because this range has visits for it, and its
 * numbers are those visits. It used to be ranked by the cumulative `views` column and to invent a
 * visitor count (`max(1, views × 0.75)`) for posts the range had no data for — a fabricated number
 * was the only possible one there, because the question it answered was about a window nothing had
 * recorded.
 */
async function loadBlogTopPosts(
  db: D1Database,
  userId: string,
  targets: Map<string, VisitTargetStat>,
): Promise<BlogGlobalAnalytics['topPosts']> {
  const ranked = [...targets.entries()]
    .filter(([, stat]) => stat.views > 0)
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 10)
  if (!ranked.length) return []

  const placeholders = ranked.map((_, index) => `?${index + 2}`).join(', ')
  const titles = await db.prepare(
    `SELECT id, title, slug FROM blog_posts WHERE user_id = ?1 AND id IN (${placeholders})`,
  ).bind(userId, ...ranked.map(([postId]) => postId)).all<{ id: string; title: string; slug: string }>()
  const byId = new Map((titles.results ?? []).map((row) => [row.id, row]))

  return ranked.flatMap(([postId, stat]) => {
    const row = byId.get(postId)
    if (!row) return []
    return [{ postId, title: row.title, slug: row.slug, views: stat.views, visitors: stat.visitors }]
  })
}

interface BlogBreakdown {
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
}

/**
 * Every card is answered from the range's own rows. With no rows the maps are empty and the cards
 * say so; they used to be filled with a hard-coded picture ("China 100%, Direct 100%, desktop 60%, macOS
 * 50%, Chrome 60%") scaled by the posts' cumulative counter, which is how a blog with no collected
 * traffic showed a full audience breakdown.
 */
function breakdownStats(aggregate: VisitAggregate): BlogBreakdown {
  const maps: VisitDistributionMaps = aggregate
  return {
    topCountries: toBreakdown(maps.countries, aggregate.views),
    topReferrers: toBreakdown(maps.referrers, aggregate.views),
    devices: toBreakdown(maps.devices, aggregate.views),
    osList: toBreakdown(maps.osList, aggregate.views),
    browsers: toBreakdown(maps.browsers, aggregate.views),
  }
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

function blogRecentVisitsStatement(db: D1Database, userId: string, filters: VisitTrafficFilters): D1PreparedStatement {
  return db.prepare(
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
}

function toBlogVisitLogs(rows: BlogRecentVisitRow[]): BlogVisitLog[] {
  return rows.map((r) => ({
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
  blogManageRoutes.delete('/visits', async (c) => {
    const userId = c.get('userId')!
    const type = c.req.query('type') || 'all'
    const days = cleanupVisitDays(c.req.query('days'), type)
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

const CLEANUP_DAYS_DEFAULT = 30
const CLEANUP_DAYS_MAX = 3650

/**
 * `older_than` must name its own window: reading an unparseable count as the default would delete a
 * span the caller never asked for, and `parseInt` would take `12.7` or `30abc` as a number rather
 * than refuse them. A rejected value is a 400; an accepted one is bounded by the shared clamp.
 */
function cleanupVisitDays(raw: string | undefined, type: string): number {
  if (type !== 'older_than') return CLEANUP_DAYS_DEFAULT
  const days = Number((raw ?? '').trim())
  if (!Number.isSafeInteger(days) || days < 1) {
    throw ApiError.badRequest('Cleaning visit logs older than N days requires a positive integer for days')
  }
  return clampInt(String(days), 1, CLEANUP_DAYS_MAX, CLEANUP_DAYS_DEFAULT)
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
