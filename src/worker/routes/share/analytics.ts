import { Hono } from 'hono'
import { ShareBreakdownItem, ShareGlobalAnalytics, ShareNoteAnalytics, ShareVisitLog } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { consumeShareReadBudget } from './read-budget'
import {
  analyticsWindow,
  buildBucketedTimeline,
  buildVisitFilterSql,
  computeDelta,
  perDayRate,
  parseAnalyticsRequest,
  parseBotName,
  toBreakdown,
  type AnalyticsRequest,
  type AnalyticsWindow,
} from '../../lib/share-analytics'
import {
  SHARE_VISIT_SOURCE,
  visitAggregateFromResults,
  visitAggregateStatements,
  type VisitAggregate,
  type VisitDistributionMaps,
  type VisitTargetStat,
} from '../../lib/visit-aggregates'
import { firstOf, rowsOf } from './read-results'
import { ShareRow } from './shares'

const DAY_MS = 24 * 60 * 60 * 1000

interface ShareSummaryRow {
  total_shares: number
  active_shares: number
}

interface PrevStatsRow {
  prev_views: number
  prev_uv: number
}

interface FilterStatsRow {
  bots: number
  self_referrals: number
  owner: number
}

interface MinVisitedRow {
  min_ts: number | null
}

type AnalyticsContext = AnalyticsRequest & AnalyticsWindow

interface RecentVisitRow {
  id: number
  note_id: string
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
  note_title?: string
}

export function registerShareAnalyticsRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerGlobalAnalyticsRoute(shareManageRoutes)
  registerNoteAnalyticsRoute(shareManageRoutes)
}

function registerGlobalAnalyticsRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/analytics/global', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const ctx = await analyticsContext(db, c, { userId })
    // Only the unbounded range is charged: a bounded one fetches a single window of rows,
    // while `all` summarizes the account's entire history (see consumeShareReadBudget).
    if (ctx.range === 'all') await consumeShareReadBudget(db, userId)
    const [summaryResult, prevStatsResult, filterStatsResult, recentResult, ...visitResults] = await db.batch([
      shareSummaryStatement(db, userId, ctx.now),
      prevVisitStatsStatement(db, userId, ctx.prevStartTs, ctx.startTs, ctx.clause),
      visitFilterStatsStatement(db, userId, ctx.startTs),
      recentVisitsStatement(db, { userId, startTs: ctx.startTs, clause: buildVisitFilterSql(ctx.filters, 'sv') }),
      ...visitAggregateStatements(db, SHARE_VISIT_SOURCE, { userId }, ctx),
    ])
    const aggregate = visitAggregateFromResults(visitResults, ctx, SHARE_VISIT_SOURCE)
    const topNotes = await loadTopNotes(db, userId, aggregate.targets)
    return c.json(composeGlobalAnalytics({
      ctx,
      aggregate,
      summary: firstOf<ShareSummaryRow>(summaryResult),
      prevStats: firstOf<PrevStatsRow>(prevStatsResult),
      filterStats: firstOf<FilterStatsRow>(filterStatsResult),
      topNotes,
      recentVisits: toVisitLogs(rowsOf<RecentVisitRow>(recentResult)),
    }))
  })
}

function composeGlobalAnalytics(params: {
  ctx: AnalyticsContext
  aggregate: VisitAggregate
  summary: ShareSummaryRow | null
  prevStats: PrevStatsRow | null
  filterStats: FilterStatsRow | null
  topNotes: ShareGlobalAnalytics['topNotes']
  recentVisits: ShareVisitLog[]
}): ShareGlobalAnalytics {
  const { ctx, aggregate, summary, prevStats, filterStats, topNotes, recentVisits } = params
  const timeline = buildBucketedTimeline(aggregate.buckets, ctx.range, ctx.startTs, ctx.duration)
  const daysSpan = Math.max(1, Math.round(ctx.duration / DAY_MS))
  const breakdown = breakdownTotals(aggregate, aggregate.views)
  // The per-day rate gets its own comparison: the same rate over the previous window of the same
  // length, so "average per day" answers whether the rate moved, not whether the window grew.
  const viewsPerDay = perDayRate(aggregate.views, daysSpan)
  const prevViewsPerDay = perDayRate(prevStats?.prev_views ?? 0, daysSpan)
  return {
    range: ctx.range,
    totalShares: summary?.total_shares ?? 0,
    activeShares: summary?.active_shares ?? 0,
    totalViews: aggregate.views,
    totalVisitors: aggregate.visitors,
    viewsDelta: computeDelta(aggregate.views, prevStats?.prev_views ?? 0),
    visitorsDelta: computeDelta(aggregate.visitors, prevStats?.prev_uv ?? 0),
    viewsPerDay,
    viewsPerDayDelta: prevStats ? computeDelta(viewsPerDay, prevViewsPerDay) : undefined,
    sparklineViews: timeline.map((t) => t.views),
    sparklineVisitors: timeline.map((t) => t.visitors),
    timeline,
    topNotes,
    topCountries: breakdown.countries.slice(0, 10),
    topReferrers: breakdown.referrers.slice(0, 10),
    devices: breakdown.devices,
    osList: breakdown.osList,
    browsers: breakdown.browsers,
    recentVisits,
    filterStats: {
      bots: filterStats?.bots ?? 0,
      selfReferrals: filterStats?.self_referrals ?? 0,
      owner: filterStats?.owner ?? 0,
    },
  }
}

function registerNoteAnalyticsRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/analytics/note/:noteId', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const noteId = c.req.param('noteId')
    const row = await loadNoteShare(db, userId, noteId)
    if (!row) throw ApiError.notFound('Share or note not found')
    const ctx = await analyticsContext(db, c, { userId, noteId })
    if (ctx.range === 'all') await consumeShareReadBudget(db, userId)
    const [recentResult, ...visitResults] = await db.batch([
      recentVisitsStatement(db, { userId, noteId, startTs: ctx.startTs, clause: buildVisitFilterSql(ctx.filters, 'sv') }),
      ...visitAggregateStatements(db, SHARE_VISIT_SOURCE, { userId, targetId: noteId }, ctx),
    ])
    const aggregate = visitAggregateFromResults(visitResults, ctx, SHARE_VISIT_SOURCE)
    const recentVisits = toVisitLogs(rowsOf<RecentVisitRow>(recentResult), row.note_title)
    const timeline = buildBucketedTimeline(aggregate.buckets, ctx.range, ctx.startTs, ctx.duration)
    const breakdown = breakdownTotals(aggregate, aggregate.views)

    const response: ShareNoteAnalytics = {
      range: ctx.range,
      noteId: row.note_id,
      noteTitle: row.note_title,
      slug: row.slug,
      url: `${new URL(c.req.url).origin}/s/${row.slug}`,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      hasPassword: Boolean(row.password_hash),
      isEnabled: row.is_enabled === 1,
      totalViews: aggregate.views,
      totalVisitors: aggregate.visitors,
      timeline,
      topCountries: breakdown.countries.slice(0, 10),
      topReferrers: breakdown.referrers.slice(0, 10),
      devices: breakdown.devices,
      osList: breakdown.osList,
      browsers: breakdown.browsers,
      recentVisits,
    }
    return c.json(response)
  })
}

async function analyticsContext(
  db: D1Database,
  c: { req: { query(key: string): string | undefined } },
  scope: { userId: string; noteId?: string },
): Promise<AnalyticsContext> {
  const request = parseAnalyticsRequest(c)
  const minRow = request.range === 'all'
    ? await minVisitedAtStatement(db, scope).first<MinVisitedRow>()
    : null
  return { ...request, ...analyticsWindow(request.range, request.now, minRow?.min_ts ?? null) }
}

function minVisitedAtStatement(db: D1Database, params: { userId: string; noteId?: string }): D1PreparedStatement {
  const noteWhere = params.noteId ? 'note_id = ?1 AND user_id = ?2' : 'user_id = ?1'
  const binds = params.noteId ? [params.noteId, params.userId] : [params.userId]
  return db.prepare(
    `SELECT MIN(visited_at) as min_ts FROM share_visits WHERE ${noteWhere}`,
  )
    .bind(...binds)
}

function shareSummaryStatement(db: D1Database, userId: string, now: number): D1PreparedStatement {
  return db.prepare(
    `SELECT
       COUNT(*) as total_shares,
       COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
       COALESCE(SUM(views), 0) as total_views
     FROM shares WHERE user_id = ?1`,
  )
    .bind(userId, now)
}

function prevVisitStatsStatement(
  db: D1Database,
  userId: string,
  prevStartTs: number,
  startTs: number,
  clause: string,
): D1PreparedStatement {
  return db.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM share_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${clause}`,
  )
    .bind(userId, prevStartTs, startTs)
}

function visitFilterStatsStatement(db: D1Database, userId: string, startTs: number): D1PreparedStatement {
  return db.prepare(
    `SELECT
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM share_visits
    WHERE user_id = ?1 AND visited_at >= ?2`,
  ).bind(userId, startTs)
}

async function loadTopNotes(
  db: D1Database,
  userId: string,
  targets: Map<string, VisitTargetStat>,
): Promise<Array<{ noteId: string; noteTitle: string | null; slug: string; views: number; visitors: number }>> {
  // Equal view counts have no order out of a GROUP BY, so ties break by note id
  // and both aggregation paths list the same top ten.
  const topNotesRaw = Array.from(targets, ([noteId, stat]) => ({ noteId, ...stat }))
    .sort((a, b) => b.views - a.views || (a.noteId < b.noteId ? -1 : 1))
    .slice(0, 10)
  if (!topNotesRaw.length) return []
  const noteIds = topNotesRaw.map((n) => n.noteId)
  const placeholders = noteIds.map((_, index) => `?${index + 2}`).join(',')
  const noteRows = await db.prepare(
    `SELECT id, title FROM notes WHERE user_id = ?1 AND id IN (${placeholders})`,
  )
    .bind(userId, ...noteIds)
    .all<{ id: string; title: string }>()
  const noteTitles = new Map<string, string>()
  for (const r of noteRows.results ?? []) {
    noteTitles.set(r.id, r.title)
  }
  return topNotesRaw.map((n) => ({
    noteId: n.noteId,
    noteTitle: noteTitles.get(n.noteId) ?? null,
    slug: n.slug,
    views: n.views,
    visitors: n.visitors,
  }))
}

function breakdownTotals(
  maps: VisitDistributionMaps,
  total: number,
): {
  countries: ShareBreakdownItem[]
  referrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
} {
  return {
    countries: toBreakdown(maps.countries, total),
    referrers: toBreakdown(maps.referrers, total),
    devices: toBreakdown(maps.devices, total),
    osList: toBreakdown(maps.osList, total),
    browsers: toBreakdown(maps.browsers, total),
  }
}

function recentVisitsStatement(db: D1Database, params: {
  userId: string
  noteId?: string
  startTs: number
  clause: string
}): D1PreparedStatement {
  const { userId, noteId, startTs, clause } = params
  return noteId
    ? db.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
              sv.is_bot, sv.is_self_referrer, sv.is_owner
         FROM share_visits sv
        WHERE sv.note_id = ?1 AND sv.user_id = ?2 AND sv.visited_at >= ?3 ${clause}
        ORDER BY sv.visited_at DESC
        LIMIT 20`,
    )
      .bind(noteId, userId, startTs)
    : db.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
              sv.is_bot, sv.is_self_referrer, sv.is_owner,
              n.title as note_title
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE sv.user_id = ?1 AND sv.visited_at >= ?2 ${clause}
        ORDER BY sv.visited_at DESC
        LIMIT 20`,
    )
      .bind(userId, startTs)
}

function toVisitLogs(rows: RecentVisitRow[], noteTitle?: string): ShareVisitLog[] {
  return rows.map((r) => toVisitLog(r, noteTitle))
}

function toVisitLog(r: RecentVisitRow, noteTitle?: string): ShareVisitLog {
  return {
    id: r.id,
    noteId: r.note_id,
    noteTitle: r.note_title ?? noteTitle ?? null,
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
    botName: r.is_bot === 1 ? parseBotName(r.user_agent || '') : null,
  }
}

async function loadNoteShare(db: D1Database, userId: string, noteId: string): Promise<(ShareRow & { note_title: string }) | null> {
  return db.prepare(
    `SELECT s.*, n.title as note_title
       FROM shares s
       JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.note_id = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<ShareRow & { note_title: string }>()
}
