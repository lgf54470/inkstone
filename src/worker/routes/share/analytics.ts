import { Hono } from "hono";
import { ShareBreakdownItem, ShareGlobalAnalytics, ShareNoteAnalytics, ShareTimelinePoint, ShareTimelineRange, ShareVisitLog } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { buildVisitFilterSql, computeDelta, getRangeStartTimestamp, parseBotName, type ShareFilterOptions } from "../../lib/share-analytics";
import { ShareRow } from "./shares";

export function registerShareAnalyticsRoutes(shareManageRoutes: Hono<AppBindings>): void {
shareManageRoutes.get('/analytics/global', async (c) => {
  const userId = c.get('userId')
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

  const sharesSummary = await c.env.DB.prepare(
    `SELECT 
       COUNT(*) as total_shares,
       COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
       COALESCE(SUM(views), 0) as total_views
     FROM shares WHERE user_id = ?1`,
  )
    .bind(userId, now)
    .first<{ total_shares: number; activeShares?: number; active_shares: number; total_views: number }>()

  const currentVisits = await c.env.DB.prepare(
    `SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
            is_bot, is_self_referrer, is_owner, note_id, slug
       FROM share_visits
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
      note_id: string
      slug: string
    }>()

  const currentRows = currentVisits.results ?? []

  const prevStats = await c.env.DB.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM share_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${visitFilterClause}`,
  )
    .bind(userId, prevStartTs, startTs)
    .first<{ prev_views: number; prev_uv: number }>()

  const filterStatsRow = await c.env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN is_bot = 1 THEN 1 END) as bots,
       COUNT(CASE WHEN is_self_referrer = 1 THEN 1 END) as self_referrals,
       COUNT(CASE WHEN is_owner = 1 THEN 1 END) as owner
     FROM share_visits
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

  const daysSpan = Math.max(1, Math.round(duration / (24 * 60 * 60 * 1000)))
  const viewsPerDay = Math.round(currentViews / daysSpan)

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

  const topNoteMap = new Map<string, { views: number; uvs: Set<string>; slug: string }>()
  const countryMap = new Map<string, number>()
  const referrerMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const browserMap = new Map<string, number>()

  for (const row of currentRows) {
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

  const topNotesRaw = Array.from(topNoteMap.entries())
    .map(([noteId, d]) => ({ noteId, views: d.views, visitors: d.uvs.size, slug: d.slug }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  const noteTitles = new Map<string, string>()
  if (topNotesRaw.length > 0) {
    const placeholders = topNotesRaw.map(() => '?').join(',')
    const noteRows = await c.env.DB.prepare(
      `SELECT id, title FROM notes WHERE id IN (${placeholders})`,
    )
      .bind(...topNotesRaw.map((n) => n.noteId))
      .all<{ id: string; title: string }>()
    for (const r of noteRows.results ?? []) {
      noteTitles.set(r.id, r.title)
    }
  }

  const topNotes = topNotesRaw.map((n) => ({
    noteId: n.noteId,
    noteTitle: noteTitles.get(n.noteId) || 'Untitled note',
    slug: n.slug,
    views: n.views,
    visitors: n.visitors,
  }))

  function toBreakdown(map: Map<string, number>, total: number): ShareBreakdownItem[] {
    return Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }

  const recentRows = await c.env.DB.prepare(
    `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
            sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
            sv.is_bot, sv.is_self_referrer, sv.is_owner,
            COALESCE(n.title, 'Untitled note') as note_title
       FROM share_visits sv
       LEFT JOIN notes n ON n.id = sv.note_id
      WHERE sv.user_id = ?1 ${buildVisitFilterSql(filters, 'sv')}
      ORDER BY sv.visited_at DESC
      LIMIT 20`,
  )
    .bind(userId)
    .all<{
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
      note_title: string
    }>()

  const recentVisits: ShareVisitLog[] = (recentRows.results ?? []).map((r) => ({
    id: r.id,
    noteId: r.note_id,
    noteTitle: r.note_title,
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
  }))

  const response: ShareGlobalAnalytics = {
    range,
    totalShares: sharesSummary?.total_shares ?? 0,
    activeShares: sharesSummary?.active_shares ?? 0,
    totalViews: currentViews,
    totalVisitors: currentVisitors,
    viewsDelta: computeDelta(currentViews, prevViews),
    visitorsDelta: computeDelta(currentVisitors, prevVisitors),
    viewsPerDay,
    sparklineViews: timeline.map((t) => t.views),
    sparklineVisitors: timeline.map((t) => t.visitors),
    timeline,
    topNotes,
    topCountries: toBreakdown(countryMap, currentViews).slice(0, 10),
    topReferrers: toBreakdown(referrerMap, currentViews).slice(0, 10),
    devices: toBreakdown(deviceMap, currentViews),
    osList: toBreakdown(osMap, currentViews),
    browsers: toBreakdown(browserMap, currentViews),
    recentVisits,
    filterStats,
  }

  return c.json(response)
})

shareManageRoutes.get('/analytics/note/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
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
  const origin = new URL(c.req.url).origin

  const row = await c.env.DB.prepare(
    `SELECT s.*, n.title as note_title
       FROM shares s
       JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.note_id = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<ShareRow & { note_title: string }>()

  if (!row) throw ApiError.notFound('Share or note not found')

  const visits = await c.env.DB.prepare(
    `SELECT visited_at, visitor_fp, country, referrer_host, device_type, os, browser,
            is_bot, is_self_referrer, is_owner, note_id, slug
       FROM share_visits
      WHERE note_id = ?1 AND user_id = ?2 AND visited_at >= ?3 ${visitFilterClause}
      ORDER BY visited_at ASC`,
  )
    .bind(noteId, userId, startTs)
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
      note_id: string
      slug: string
    }>()

  const visitRows = visits.results ?? []
  const totalViews = visitRows.length
  const totalVisitors = new Set(visitRows.map((r) => r.visitor_fp).filter(Boolean)).size

  const numBuckets = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 12
  const bucketDuration = duration / numBuckets
  const timeline: ShareTimelinePoint[] = []

  for (let i = 0; i < numBuckets; i++) {
    const bucketStart = startTs + i * bucketDuration
    const bucketEnd = bucketStart + bucketDuration
    const bucketVisits = visitRows.filter((r) => r.visited_at >= bucketStart && r.visited_at < bucketEnd)
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

  const countryMap = new Map<string, number>()
  const referrerMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const browserMap = new Map<string, number>()

  for (const r of visitRows) {
    const country = (r.country || 'Unknown').toUpperCase()
    countryMap.set(country, (countryMap.get(country) || 0) + 1)
    const referrer = r.referrer_host || 'Direct'
    referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1)
    const device = r.device_type || 'desktop'
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1)
    const os = r.os || 'other'
    osMap.set(os, (osMap.get(os) || 0) + 1)
    const browser = r.browser || 'Other'
    browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
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

  const recentRows = await c.env.DB.prepare(
    `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
            sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
            sv.is_bot, sv.is_self_referrer, sv.is_owner
       FROM share_visits sv
      WHERE sv.note_id = ?1 AND sv.user_id = ?2 ${buildVisitFilterSql(filters, 'sv')}
      ORDER BY sv.visited_at DESC
      LIMIT 20`,
  )
    .bind(noteId, userId)
    .all<{
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
    }>()

  const recentVisits: ShareVisitLog[] = (recentRows.results ?? []).map((r) => ({
    id: r.id,
    noteId: r.note_id,
    noteTitle: row.note_title,
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
  }))

  const response: ShareNoteAnalytics = {
    range,
    noteId: row.note_id,
    noteTitle: row.note_title,
    slug: row.slug,
    url: `${origin}/s/${row.slug}`,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    hasPassword: Boolean(row.password_hash),
    isEnabled: row.is_enabled === 1,
    totalViews,
    totalVisitors,
    timeline,
    topCountries: toBreakdown(countryMap, totalViews).slice(0, 10),
    topReferrers: toBreakdown(referrerMap, totalViews).slice(0, 10),
    devices: toBreakdown(deviceMap, totalViews),
    osList: toBreakdown(osMap, totalViews),
    browsers: toBreakdown(browserMap, totalViews),
    recentVisits,
  }

  return c.json(response)
})
}

