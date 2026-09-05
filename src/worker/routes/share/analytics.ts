import { Hono } from "hono";
import { ShareBreakdownItem, ShareGlobalAnalytics, ShareNoteAnalytics, ShareTimelineRange, ShareVisitLog } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { buildShareTimeline, buildVisitFilterSql, computeDelta, getRangeStartTimestamp, parseBotName, toBreakdown, type ShareFilterOptions } from "../../lib/share-analytics";
import { ShareRow } from "./shares";

const DAY_MS = 24 * 60 * 60 * 1000

interface AnalyticsContext {
  range: ShareTimelineRange
  clause: string
  filters: ShareFilterOptions
  now: number
  startTs: number
  duration: number
  prevStartTs: number
}

interface VisitRow {
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
  note_id: string
  slug: string
}

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
    const userId = c.get('userId')
    const ctx = analyticsContext(c)
    const summary = await loadShareSummary(c.env.DB, userId, ctx.now)
    const rows = await loadRangeVisits(c.env.DB, { userId, startTs: ctx.startTs, clause: ctx.clause })
    const prevStats = await loadPrevVisitStats(c.env.DB, userId, ctx.prevStartTs, ctx.startTs, ctx.clause)
    const filterStatsRow = await loadVisitFilterStats(c.env.DB, userId, ctx.startTs)
    const maps = aggregateVisitMaps(rows)
    const topNotes = await loadTopNotes(c.env.DB, maps.topNoteMap)
    const recentVisits = await loadRecentVisits(c.env.DB, { userId, clause: buildVisitFilterSql(ctx.filters, 'sv') })
    const timeline = buildShareTimeline(rows, ctx.range, ctx.startTs, ctx.duration)
    const stats = currentVisitStats(rows, prevStats, ctx.duration)
    const breakdown = breakdownTotals(maps, stats.currentViews)

    const response: ShareGlobalAnalytics = {
      range: ctx.range,
      totalShares: summary?.total_shares ?? 0,
      activeShares: summary?.active_shares ?? 0,
      totalViews: stats.currentViews,
      totalVisitors: stats.currentVisitors,
      viewsDelta: computeDelta(stats.currentViews, stats.prevViews),
      visitorsDelta: computeDelta(stats.currentVisitors, stats.prevVisitors),
      viewsPerDay: stats.viewsPerDay,
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
        bots: filterStatsRow?.bots ?? 0,
        selfReferrals: filterStatsRow?.self_referrals ?? 0,
        owner: filterStatsRow?.owner ?? 0,
      },
    }
    return c.json(response)
  })
}

function registerNoteAnalyticsRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/analytics/note/:noteId', async (c) => {
    const userId = c.get('userId')
    const noteId = c.req.param('noteId')
    const ctx = analyticsContext(c)
    const row = await loadNoteShare(c.env.DB, userId, noteId)
    if (!row) throw ApiError.notFound('Share or note not found')
    const rows = await loadRangeVisits(c.env.DB, { userId, noteId, startTs: ctx.startTs, clause: ctx.clause })
    const recentVisits = await loadRecentVisits(c.env.DB, {
      userId,
      noteId,
      clause: buildVisitFilterSql(ctx.filters, 'sv'),
      noteTitle: row.note_title,
    })
    const timeline = buildShareTimeline(rows, ctx.range, ctx.startTs, ctx.duration)
    const maps = aggregateVisitMaps(rows)
    const totalVisitors = currentVisitStats(rows, undefined, ctx.duration).currentVisitors
    const breakdown = breakdownTotals(maps, rows.length)

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
      totalViews: rows.length,
      totalVisitors,
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

function analyticsContext(c: { req: { query(key: string): string | undefined } }): AnalyticsContext {
  const range = (c.req.query('range') || '7d') as ShareTimelineRange
  const filters: ShareFilterOptions = {
    excludeBots: c.req.query('excludeBots') !== 'false',
    excludeSelfReferrers: c.req.query('excludeSelf') === 'true',
    excludeOwner: c.req.query('excludeOwner') === 'true',
  }
  const now = Date.now()
  const startTs = getRangeStartTimestamp(range, now)
  const duration = startTs > 0 ? now - startTs : 30 * DAY_MS
  return {
    range,
    filters,
    clause: buildVisitFilterSql(filters),
    now,
    startTs,
    duration,
    prevStartTs: startTs > 0 ? startTs - duration : 0,
  }
}

async function loadShareSummary(db: D1Database, userId: string, now: number): Promise<{ total_shares: number; active_shares: number } | null> {
  return db.prepare(
    `SELECT
       COUNT(*) as total_shares,
       COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
       COALESCE(SUM(views), 0) as total_views
     FROM shares WHERE user_id = ?1`,
  )
    .bind(userId, now)
    .first<{ total_shares: number; active_shares: number }>()
}

async function loadRangeVisits(db: D1Database, params: {
  userId: string
  noteId?: string
  startTs: number
  clause: string
}): Promise<VisitRow[]> {
  const { userId, noteId, startTs, clause } = params
  const noteWhere = noteId ? `note_id = ?1 AND user_id = ?2 AND visited_at >= ?3` : `user_id = ?1 AND visited_at >= ?2`
  const binds = noteId ? [noteId, userId, startTs] : [userId, startTs]
  const { results } = await db.prepare(
    `SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
            is_bot, is_self_referrer, is_owner, note_id, slug
       FROM share_visits
      WHERE ${noteWhere} ${clause}
      ORDER BY visited_at ASC`,
  )
    .bind(...binds)
    .all<VisitRow>()
  return results ?? []
}

async function loadPrevVisitStats(
  db: D1Database,
  userId: string,
  prevStartTs: number,
  startTs: number,
  clause: string,
): Promise<{ prev_views: number; prev_uv: number } | null> {
  return db.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM share_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${clause}`,
  )
    .bind(userId, prevStartTs, startTs)
    .first<{ prev_views: number; prev_uv: number }>()
}

async function loadVisitFilterStats(db: D1Database, userId: string, startTs: number): Promise<{ bots: number; self_referrals: number; owner: number } | null> {
  return db.prepare(
    `SELECT
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM share_visits
    WHERE user_id = ?1 AND visited_at >= ?2`,
  ).bind(userId, startTs).first<{ bots: number; self_referrals: number; owner: number }>()
}

function currentVisitStats(
  rows: VisitRow[],
  prevStats: { prev_views: number; prev_uv: number } | null | undefined,
  duration: number,
): { currentViews: number; currentVisitors: number; prevViews: number; prevVisitors: number; viewsPerDay: number } {
  const currentViews = rows.length
  const currentVisitors = new Set(rows.map((r) => r.visitor_fp).filter(Boolean)).size
  const prevViews = prevStats?.prev_views ?? 0
  const prevVisitors = prevStats?.prev_uv ?? 0
  const daysSpan = Math.max(1, Math.round(duration / DAY_MS))
  return { currentViews, currentVisitors, prevViews, prevVisitors, viewsPerDay: Math.round(currentViews / daysSpan) }
}

function aggregateVisitMaps(rows: VisitRow[]): {
  topNoteMap: Map<string, { views: number; uvs: Set<string>; slug: string }>
  countryMap: Map<string, number>
  referrerMap: Map<string, number>
  deviceMap: Map<string, number>
  osMap: Map<string, number>
  browserMap: Map<string, number>
} {
  const topNoteMap = new Map<string, { views: number; uvs: Set<string>; slug: string }>()
  const countryMap = new Map<string, number>()
  const referrerMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const browserMap = new Map<string, number>()
  for (const row of rows) {
    if (row.note_id) {
      const entry = topNoteMap.get(row.note_id) ?? { views: 0, uvs: new Set<string>(), slug: row.slug }
      entry.views++
      if (row.visitor_fp) entry.uvs.add(row.visitor_fp)
      topNoteMap.set(row.note_id, entry)
    }
    const country = (row.country || 'Unknown').toUpperCase()
    countryMap.set(country, (countryMap.get(country) || 0) + 1)
    const referrer = row.referrer_host || 'Direct'
    referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1)
    const device = row.device_type || 'desktop'
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1)
    const os = row.os || 'other'
    osMap.set(os, (osMap.get(os) || 0) + 1)
    const browser = row.browser || 'Other'
    browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
  }
  return { topNoteMap, countryMap, referrerMap, deviceMap, osMap, browserMap }
}

async function loadTopNotes(
  db: D1Database,
  topNoteMap: Map<string, { views: number; uvs: Set<string>; slug: string }>,
): Promise<Array<{ noteId: string; noteTitle: string; slug: string; views: number; visitors: number }>> {
  const topNotesRaw = Array.from(topNoteMap.entries())
    .map(([noteId, d]) => ({ noteId, views: d.views, visitors: d.uvs.size, slug: d.slug }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
  if (!topNotesRaw.length) return []
  const placeholders = topNotesRaw.map(() => '?').join(',')
  const noteRows = await db.prepare(
    `SELECT id, title FROM notes WHERE id IN (${placeholders})`,
  )
    .bind(...topNotesRaw.map((n) => n.noteId))
    .all<{ id: string; title: string }>()
  const noteTitles = new Map<string, string>()
  for (const r of noteRows.results ?? []) {
    noteTitles.set(r.id, r.title)
  }
  return topNotesRaw.map((n) => ({
    noteId: n.noteId,
    noteTitle: noteTitles.get(n.noteId) || 'Untitled note',
    slug: n.slug,
    views: n.views,
    visitors: n.visitors,
  }))
}

function breakdownTotals(
  maps: ReturnType<typeof aggregateVisitMaps>,
  total: number,
): {
  countries: ShareBreakdownItem[]
  referrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
} {
  return {
    countries: toBreakdown(maps.countryMap, total),
    referrers: toBreakdown(maps.referrerMap, total),
    devices: toBreakdown(maps.deviceMap, total),
    osList: toBreakdown(maps.osMap, total),
    browsers: toBreakdown(maps.browserMap, total),
  }
}

async function loadRecentVisits(db: D1Database, params: {
  userId: string
  noteId?: string
  clause: string
  noteTitle?: string
}): Promise<ShareVisitLog[]> {
  const { userId, noteId, clause, noteTitle } = params
  const { results } = noteId
    ? await db.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
              sv.is_bot, sv.is_self_referrer, sv.is_owner
         FROM share_visits sv
        WHERE sv.note_id = ?1 AND sv.user_id = ?2 ${clause}
        ORDER BY sv.visited_at DESC
        LIMIT 20`,
    )
      .bind(noteId, userId)
      .all<RecentVisitRow>()
    : await db.prepare(
      `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
              sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
              sv.is_bot, sv.is_self_referrer, sv.is_owner,
              COALESCE(n.title, 'Untitled note') as note_title
         FROM share_visits sv
         LEFT JOIN notes n ON n.id = sv.note_id
        WHERE sv.user_id = ?1 ${clause}
        ORDER BY sv.visited_at DESC
        LIMIT 20`,
    )
      .bind(userId)
      .all<RecentVisitRow>()
  return (results ?? []).map((r) => toVisitLog(r, noteTitle))
}

function toVisitLog(r: RecentVisitRow, noteTitle?: string): ShareVisitLog {
  return {
    id: r.id,
    noteId: r.note_id,
    noteTitle: r.note_title ?? noteTitle ?? 'Untitled note',
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
