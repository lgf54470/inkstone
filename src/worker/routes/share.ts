import { Hono, type Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { LIMITS } from '@shared/constants'
import { escapeHtml } from '@shared/escape'
import {
  PublicNote,
  ShareBreakdownItem,
  ShareGlobalAnalytics,
  ShareInfo,
  ShareListResponse,
  ShareNoteAnalytics,
  ShareTimelinePoint,
  ShareTimelineRange,
  ShareVisitLog,
} from '@shared/types'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { isValidId, isValidSlug, newSlug } from '../lib/id'
import { JSON_BODY_LIMITS, readJson, readOptionalJson, requestClientIp } from '../lib/request'
import { hashPassword, verifyPassword } from '../lib/password'
import {
  createScopedFolder,
  createScopedTag,
  deleteScopedFolder,
  deleteScopedTag,
  listScopedFolders,
  listScopedTags,
  updateScopedFolder,
  updateScopedTag,
} from '../lib/scoped-organizer'
import {
  buildVisitFilterSql,
  computeDelta,
  computeVisitorFingerprint,
  getRangeStartTimestamp,
  isBot,
  isSelfReferrer,
  isValidCustomSlug,
  parseBotName,
  parseBrowser,
  parseDeviceType,
  parseOS,
  parseReferrerHost,
  type ShareFilterOptions,
} from '../lib/share-analytics'
import {
  createShareAssetSession,
  shareAssetCookieName,
} from '../lib/share-asset-session'
import {
  assertNotLocked,
  clearLoginFailures,
  consumeAttemptBudget,
  recordLoginFailure,
  ThrottleError,
} from '../lib/throttle'
import { loadSession, requireAuth } from '../middleware/auth'

export const shareManageRoutes = new Hono<AppBindings>()
export const shareRoutes = new Hono<AppBindings>()
export const sharePageRoutes = new Hono<AppBindings>()

shareRoutes.use('*', loadSession)

interface ShareRow {
  slug: string
  note_id: string
  user_id: string
  folder_id?: string | null
  tags?: string
  password_hash: string | null
  expires_at: number | null
  views: number
  is_enabled: number
  last_viewed_at: number | null
  created_at: number
}

function toShareInfo(
  row: ShareRow,
  origin: string,
  extras?: {
    noteTitle?: string
    noteExcerpt?: string
    folderId?: string | null
    tags?: string[]
    uniqueVisitors?: number
    isPinned?: boolean
    isStarred?: boolean
  },
): ShareInfo {
  let parsedTags: string[] = []
  if (extras?.tags) {
    parsedTags = extras.tags
  } else if (row.tags) {
    try {
      parsedTags = JSON.parse(row.tags)
    } catch { /* Malformed legacy tags degrade to "no tags" instead of failing the share render. */ }
  }
  const shareFolderId = extras?.folderId !== undefined ? extras.folderId : (row.folder_id ?? null)

  return {
    slug: row.slug,
    noteId: row.note_id,
    url: `${origin}/s/${row.slug}`,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    views: row.views,
    createdAt: row.created_at,
    isEnabled: row.is_enabled !== 0,
    lastViewedAt: row.last_viewed_at ?? null,
    uniqueVisitors: extras?.uniqueVisitors,
    noteTitle: extras?.noteTitle,
    noteExcerpt: extras?.noteExcerpt,
    shareFolderId,
    folderId: shareFolderId,
    shareTags: parsedTags,
    tags: parsedTags,
    isPinned: extras?.isPinned,
    isStarred: extras?.isStarred,
  }
}

shareManageRoutes.use('*', requireAuth)

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

shareManageRoutes.get('/check-slug', async (c) => {
  const slug = c.req.query('slug') || ''
  const currentNoteId = c.req.query('currentNoteId')
  if (!isValidCustomSlug(slug)) {
    return c.json({ available: false, reason: 'invalid_format' })
  }
  const existing = await c.env.DB.prepare(
    `SELECT note_id FROM shares WHERE slug = ?1`,
  )
    .bind(slug)
    .first<{ note_id: string }>()

  if (existing && existing.note_id !== currentNoteId) {
    return c.json({ available: false, reason: 'already_taken' })
  }
  return c.json({ available: true })
})

shareManageRoutes.get('/folders', async (c) => {
  return c.json(await listScopedFolders(c.env.DB, 'share_folders', c.get('userId')))
})

shareManageRoutes.post('/folders', async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedFolder>[3]>()
  return c.json(await createScopedFolder(c.env.DB, 'share_folders', c.get('userId'), body), 201)
})

shareManageRoutes.patch('/folders/:id', async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedFolder>[3]>()
  return c.json(await updateScopedFolder(c.env.DB, 'share_folders', c.get('userId'), c.req.param('id'), body))
})

shareManageRoutes.delete('/folders/:id', async (c) => {
  await deleteScopedFolder(c.env.DB, 'share_folders', 'shares', c.get('userId'), c.req.param('id'))
  return c.json({ ok: true })
})

shareManageRoutes.get('/tags', async (c) => {
  return c.json(await listScopedTags(c.env.DB, 'share_tags', c.get('userId')))
})

shareManageRoutes.post('/tags', async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedTag>[4]>()
  const { tag, status } = await createScopedTag(c.env.DB, 'share_tags', 'keep-existing', c.get('userId'), body)
  return c.json(tag, status)
})

shareManageRoutes.patch('/tags/:id', async (c) => {
  const body = await c.req.json<Parameters<typeof updateScopedTag>[4]>()
  const { tag } = await updateScopedTag(c.env.DB, 'share_tags', c.get('userId'), c.req.param('id'), body)
  return c.json(tag)
})

shareManageRoutes.delete('/tags/:id', async (c) => {
  await deleteScopedTag(c.env.DB, 'share_tags', c.get('userId'), c.req.param('id'))
  return c.json({ ok: true })
})

shareManageRoutes.post('/batch-toggle-group', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    type: 'folder' | 'tag'
    target: string
    enabled: boolean
  }>()
  const isEnabled = body.enabled ? 1 : 0

  if (body.type === 'folder') {
    await c.env.DB.prepare(
      `UPDATE shares SET is_enabled = ?1 WHERE folder_id = ?2 AND user_id = ?3`,
    ).bind(isEnabled, body.target, userId).run()
  } else if (body.type === 'tag') {
    await c.env.DB.prepare(
      `UPDATE shares SET is_enabled = ?1 WHERE user_id = ?2 AND tags LIKE ?3`,
    ).bind(isEnabled, userId, `%"${body.target}"%`).run()
  }
  return c.json({ ok: true })
})

shareManageRoutes.get('/note-share/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
  const origin = new URL(c.req.url).origin
  const row = await c.env.DB.prepare(
    `SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt, n.is_pinned, n.is_starred,
            s.slug, s.folder_id, s.tags as share_tags_json, s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
       FROM notes n
       LEFT JOIN shares s ON s.note_id = n.id AND s.user_id = n.user_id
      WHERE n.id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  ).bind(noteId, userId).first<{
    note_id: string
    note_title: string
    note_excerpt: string
    is_pinned: number
    is_starred: number
    slug: string | null
    folder_id: string | null
    share_tags_json: string | null
    password_hash: string | null
    expires_at: number | null
    views: number | null
    is_enabled: number | null
    last_viewed_at: number | null
    created_at: number | null
  }>()

  if (!row) throw ApiError.notFound('Note not found')
  if (!row.slug) {
    return c.json({
      share: null,
      noteTitle: row.note_title,
      isPinned: row.is_pinned === 1,
      isStarred: row.is_starred === 1,
    })
  }

  let shareTags: string[] = []
  try {
    shareTags = JSON.parse(row.share_tags_json || '[]')
  } catch {}

  return c.json({
    share: {
      slug: row.slug,
      noteId: row.note_id,
      url: `${origin}/s/${row.slug}`,
      hasPassword: Boolean(row.password_hash),
      expiresAt: row.expires_at,
      views: row.views ?? 0,
      createdAt: row.created_at ?? 0,
      isEnabled: row.is_enabled !== 0,
      lastViewedAt: row.last_viewed_at ?? null,
      noteTitle: row.note_title,
      noteExcerpt: row.note_excerpt,
      shareFolderId: row.folder_id,
      folderId: row.folder_id,
      shareTags,
      tags: shareTags,
      isPinned: row.is_pinned === 1,
      isStarred: row.is_starred === 1,
    },
    noteTitle: row.note_title,
    isPinned: row.is_pinned === 1,
    isStarred: row.is_starred === 1,
  })
})

shareManageRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const origin = new URL(c.req.url).origin
  const rawFolderId = c.req.query('folderId')
  const folderId = rawFolderId && rawFolderId !== 'null' && rawFolderId !== 'undefined' ? rawFolderId : null
  const rawTag = c.req.query('tag')
  const tag = rawTag && rawTag !== 'null' && rawTag !== 'undefined' ? rawTag : null
  const status = c.req.query('status') || 'all'
  const search = (c.req.query('search') || '').trim()
  const sort = c.req.query('sort') || 'views_desc'
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

  const folderCountRows = await c.env.DB.prepare(
    `SELECT sf.id as folder_id,
            COUNT(s.slug) as total_shares,
            COUNT(CASE WHEN s.slug IS NOT NULL AND (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) as shared_notes
       FROM share_folders sf
       LEFT JOIN shares s ON s.folder_id = sf.id AND s.user_id = sf.user_id
      WHERE sf.user_id = ?1
      GROUP BY sf.id`,
  )
    .bind(userId, now)
    .all<{ folder_id: string; total_shares: number; shared_notes: number }>()

  const folderCounts: Record<string, { total: number; shared: number }> = {}
  for (const r of folderCountRows.results ?? []) {
    folderCounts[r.folder_id] = { total: r.total_shares, shared: Math.min(r.shared_notes, r.total_shares) }
  }

  const allShareTags = await c.env.DB.prepare(
    `SELECT name FROM share_tags WHERE user_id = ?1`,
  ).bind(userId).all<{ name: string }>()

  const tagCounts: Record<string, { total: number; shared: number }> = {}
  for (const t of allShareTags.results ?? []) {
    const tRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?3) THEN 1 END) as shared
         FROM shares
        WHERE user_id = ?1 AND tags LIKE ?2`,
    ).bind(userId, `%"${t.name}"%`, now).first<{ total: number; shared: number }>()
    tagCounts[t.name] = { total: tRow?.total ?? 0, shared: Math.min(tRow?.shared ?? 0, tRow?.total ?? 0) }
  }

  const globalSummary = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_shares,
            COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
            COUNT(CASE WHEN is_enabled = 0 THEN 1 END) as paused_shares,
            COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ?2 THEN 1 END) as expired_shares,
            COALESCE(SUM(views), 0) as total_views
       FROM shares
      WHERE user_id = ?1`,
  )
    .bind(userId, now)
    .first<{ total_shares: number; active_shares: number; paused_shares: number; expired_shares: number; total_views: number }>()

  const filteredGlobalStats = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_views, COUNT(DISTINCT visitor_fp) as total_uv
       FROM share_visits
      WHERE user_id = ?1 ${visitFilterClause}`,
  )
    .bind(userId)
    .first<{ total_views: number; total_uv: number }>()

  const pinStarRow = await c.env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN n.is_pinned = 1 THEN 1 END) as pinned_shares,
       COUNT(CASE WHEN n.is_starred = 1 THEN 1 END) as starred_shares
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE s.user_id = ?1 AND n.deleted_at IS NULL`,
  ).bind(userId).first<{ pinned_shares: number; starred_shares: number }>()

  const globalStats = {
    totalShares: globalSummary?.total_shares ?? 0,
    activeShares: globalSummary?.active_shares ?? 0,
    pinnedShares: pinStarRow?.pinned_shares ?? 0,
    starredShares: pinStarRow?.starred_shares ?? 0,
    pausedShares: globalSummary?.paused_shares ?? 0,
    expiredShares: globalSummary?.expired_shares ?? 0,
    totalViews: filteredGlobalStats?.total_views ?? (globalSummary?.total_views ?? 0),
    totalVisitors: filteredGlobalStats?.total_uv ?? 0,
    folderCounts,
    tagCounts,
  }

  const conditions: string[] = [`s.user_id = ?1`, `n.deleted_at IS NULL`]
  const binds: Array<string | number> = [userId]
  let bindIndex = 2

  if (folderId) {
    conditions.push(`s.folder_id = ?${bindIndex}`)
    binds.push(folderId)
    bindIndex++
  }

  if (tag) {
    conditions.push(`s.tags LIKE ?${bindIndex}`)
    binds.push(`%"${tag}"%`)
    bindIndex++
  }

  if (status === 'active') {
    conditions.push(`(s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?${bindIndex})`)
    binds.push(now)
    bindIndex++
  } else if (status === 'paused') {
    conditions.push(`s.is_enabled = 0`)
  } else if (status === 'starred') {
    conditions.push(`n.is_starred = 1`)
  } else if (status === 'pinned') {
    conditions.push(`n.is_pinned = 1`)
  } else if (status === 'password') {
    conditions.push(`s.password_hash IS NOT NULL`)
  } else if (status === 'expiring') {
    conditions.push(`s.expires_at IS NOT NULL`)
  } else if (status === 'permanent') {
    conditions.push(`s.expires_at IS NULL`)
  } else if (status === 'expired') {
    conditions.push(`s.expires_at IS NOT NULL AND s.expires_at <= ?${bindIndex}`)
    binds.push(now)
    bindIndex++
  }

  if (search) {
    conditions.push(`(n.title LIKE ?${bindIndex} OR n.excerpt LIKE ?${bindIndex} OR s.slug LIKE ?${bindIndex} OR s.tags LIKE ?${bindIndex})`)
    binds.push(`%${search}%`)
    bindIndex++
  }

  let orderClause = `ORDER BY n.is_pinned DESC, s.views DESC, n.updated_at DESC`
  if (sort === 'views_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.views ASC, n.updated_at DESC`
  } else if (sort === 'recent_visit') {
    orderClause = `ORDER BY n.is_pinned DESC, s.last_viewed_at IS NOT NULL DESC, s.last_viewed_at DESC, n.updated_at DESC`
  } else if (sort === 'created_desc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.created_at IS NOT NULL DESC, s.created_at DESC, n.created_at DESC`
  } else if (sort === 'title_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, n.title ASC`
  } else if (sort === 'pinned_first') {
    orderClause = `ORDER BY n.is_pinned DESC, s.views DESC, n.updated_at DESC`
  } else if (sort === 'expires_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.expires_at IS NULL, s.expires_at ASC, n.updated_at DESC`
  }

  const query = `
    SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt,
           n.is_pinned, n.is_starred,
           s.slug, s.folder_id, s.tags as share_tags_json,
           s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE ${conditions.join(' AND ')}
     ${orderClause}
     LIMIT 500
  `

  const rows = await c.env.DB.prepare(query)
    .bind(...binds)
    .all<{
      note_id: string
      note_title: string
      note_excerpt: string
      is_pinned: number
      is_starred: number
      slug: string
      folder_id: string | null
      share_tags_json: string | null
      password_hash: string | null
      expires_at: number | null
      views: number | null
      is_enabled: number | null
      last_viewed_at: number | null
      created_at: number | null
    }>()

  const noteIds = (rows.results ?? []).map((r) => r.note_id)
  const noteStatsMap = new Map<string, { pvs: number; uvs: number }>()
  if (noteIds.length > 0) {
    const placeholders = noteIds.map(() => '?').join(',')
    const statsRows = await c.env.DB.prepare(
      `SELECT note_id, COUNT(*) as pvs, COUNT(DISTINCT visitor_fp) as uvs
         FROM share_visits
        WHERE note_id IN (${placeholders}) ${visitFilterClause}
        GROUP BY note_id`,
    )
      .bind(...noteIds)
      .all<{ note_id: string; pvs: number; uvs: number }>()

    for (const sr of statsRows.results ?? []) {
      noteStatsMap.set(sr.note_id, { pvs: sr.pvs, uvs: sr.uvs })
    }
  }

  const shares: ShareInfo[] = (rows.results ?? []).map((r) => {
    const stats = noteStatsMap.get(r.note_id)
    const noteViews = stats ? stats.pvs : (r.views ?? 0)
    const noteVisitors = stats ? stats.uvs : 0
    let parsedTags: string[] = []
    try {
      parsedTags = JSON.parse(r.share_tags_json || '[]')
    } catch {}
    return {
      slug: r.slug,
      noteId: r.note_id,
      url: `${origin}/s/${r.slug}`,
      hasPassword: Boolean(r.password_hash),
      expiresAt: r.expires_at ?? null,
      views: noteViews,
      createdAt: r.created_at ?? 0,
      isEnabled: r.is_enabled !== 0,
      lastViewedAt: r.last_viewed_at ?? null,
      uniqueVisitors: noteVisitors,
      noteTitle: r.note_title,
      noteExcerpt: r.note_excerpt,
      shareFolderId: r.folder_id,
      folderId: r.folder_id,
      shareTags: parsedTags,
      tags: parsedTags,
      isPinned: r.is_pinned === 1,
      isStarred: r.is_starred === 1,
    }
  })

  const response: ShareListResponse = {
    shares,
    total: shares.length,
    globalStats,
  }

  return c.json(response)
})

shareManageRoutes.post('/batch', async (c) => {
  const userId = c.get('userId')
  const body = await readJson<{
    action: 'enable' | 'disable' | 'revoke' | 'expire' | 'move'
    noteIds: string[]
    expiresIn?: number | null
    folderId?: string | null
  }>(c, JSON_BODY_LIMITS.small)

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0) {
    throw ApiError.badRequest('noteIds must be a non-empty array')
  }

  const noteIds = body.noteIds.slice(0, 1000)
  const now = Date.now()

  if (body.action === 'enable') {
    for (const noteId of noteIds) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(noteId, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(noteId, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, noteId, userId, now)
          .run()
      }
    }
  } else if (body.action === 'disable') {
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(userId, ...noteIds)
      .run()
  } else if (body.action === 'revoke') {
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `DELETE FROM shares WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(userId, ...noteIds)
      .run()
  } else if (body.action === 'expire') {
    const expiresAt =
      typeof body.expiresIn === 'number' && body.expiresIn > 0
        ? now + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
        : null
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET expires_at = ? WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(expiresAt, userId, ...noteIds)
      .run()
  } else if (body.action === 'move') {
    const targetFolderId = body.folderId && isValidId(body.folderId) ? body.folderId : null
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET folder_id = ? WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(targetFolderId, userId, ...noteIds)
      .run()
  }

  return c.json({ ok: true, count: noteIds.length })
})

shareManageRoutes.post('/batch-folder', async (c) => {
  const userId = c.get('userId')
  const body = await readJson<{ folderId: string; enabled: boolean }>(c, JSON_BODY_LIMITS.small)

  const notes = await c.env.DB.prepare(
    `SELECT id FROM notes WHERE folder_id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(body.folderId, userId)
    .all<{ id: string }>()

  const noteList = notes.results ?? []
  const now = Date.now()

  if (body.enabled) {
    for (const note of noteList) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(note.id, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(note.id, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, note.id, userId, now)
          .run()
      }
    }
  } else {
    if (noteList.length > 0) {
      const placeholders = noteList.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
      )
        .bind(userId, ...noteList.map((n) => n.id))
        .run()
    }
  }

  return c.json({ ok: true, count: noteList.length })
})

shareManageRoutes.post('/batch-tag', async (c) => {
  const userId = c.get('userId')
  const body = await readJson<{ tag: string; enabled: boolean }>(c, JSON_BODY_LIMITS.small)

  const tagRow = await c.env.DB.prepare(
    `SELECT id FROM tags WHERE name = ?1 AND user_id = ?2`,
  )
    .bind(body.tag, userId)
    .first<{ id: string }>()

  if (!tagRow) {
    return c.json({ ok: true, count: 0 })
  }

  const notes = await c.env.DB.prepare(
    `SELECT n.id
       FROM note_tags nt
       JOIN notes n ON n.id = nt.note_id
      WHERE nt.tag_id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(tagRow.id, userId)
    .all<{ id: string }>()

  const noteList = notes.results ?? []
  const now = Date.now()

  if (body.enabled) {
    for (const note of noteList) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(note.id, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(note.id, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, note.id, userId, now)
          .run()
      }
    }
  } else {
    if (noteList.length > 0) {
      const placeholders = noteList.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
      )
        .bind(userId, ...noteList.map((n) => n.id))
        .run()
    }
  }

  return c.json({ ok: true, count: noteList.length })
})

shareManageRoutes.get('/visits', async (c) => {
  const userId = c.get('userId')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(c.req.query('limit') || '50', 10)))
  const offset = (page - 1) * limit
  const noteId = c.req.query('noteId')
  const filter = c.req.query('filter') || 'all'
  const search = (c.req.query('search') || '').trim()

  const conditions = [`sv.user_id = ?1`]
  const binds: Array<string | number> = [userId]
  let bindIdx = 2

  if (noteId) {
    conditions.push(`sv.note_id = ?${bindIdx}`)
    binds.push(noteId)
    bindIdx++
  }

  if (filter === 'real') {
    conditions.push(`sv.is_bot = 0 AND sv.is_self_referrer = 0 AND sv.is_owner = 0`)
  } else if (filter === 'bot') {
    conditions.push(`sv.is_bot = 1`)
  } else if (filter === 'owner') {
    conditions.push(`sv.is_owner = 1`)
  } else if (filter === 'self') {
    conditions.push(`sv.is_self_referrer = 1`)
  }

  if (search) {
    conditions.push(`(n.title LIKE ?${bindIdx} OR sv.slug LIKE ?${bindIdx} OR sv.country LIKE ?${bindIdx} OR sv.referrer_host LIKE ?${bindIdx})`)
    binds.push(`%${search}%`)
    bindIdx++
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total
       FROM share_visits sv
       LEFT JOIN notes n ON n.id = sv.note_id
      WHERE ${conditions.join(' AND ')}`,
  ).bind(...binds).first<{ total: number }>()

  const total = countRow?.total ?? 0

  const rows = await c.env.DB.prepare(
    `SELECT sv.id, sv.note_id, sv.slug, sv.visited_at, sv.country, sv.region, sv.city,
            sv.referrer, sv.referrer_host, sv.device_type, sv.os, sv.browser, sv.user_agent,
            sv.visitor_fp, sv.is_bot, sv.is_self_referrer, sv.is_owner,
            COALESCE(n.title, 'Untitled note') as note_title
       FROM share_visits sv
       LEFT JOIN notes n ON n.id = sv.note_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sv.visited_at DESC
      LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`,
  ).bind(...binds, limit, offset).all<{
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
    visitor_fp: string | null
    is_bot: number
    is_self_referrer: number
    is_owner: number
    note_title: string
  }>()

  const visits: ShareVisitLog[] = (rows.results ?? []).map((r) => ({
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
    visitorFp: r.visitor_fp,
    isBot: r.is_bot === 1,
    isSelfReferrer: r.is_self_referrer === 1,
    isOwner: r.is_owner === 1,
    botName: r.is_bot === 1 ? parseBotName(r.user_agent || '') : null,
  }))

  return c.json({
    visits,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

shareManageRoutes.delete('/visits', async (c) => {
  const userId = c.get('userId')
  const type = c.req.query('type') || 'all'
  const days = parseInt(c.req.query('days') || '30', 10)

  let deleted = 0
  if (type === 'bots') {
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1 AND is_bot = 1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'older_than') {
    const cutoff = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1 AND visited_at < ?2`,
    ).bind(userId, cutoff).run()
    deleted = res.meta.changes ?? 0
  } else if (type === 'all') {
    const res = await c.env.DB.prepare(
      `DELETE FROM share_visits WHERE user_id = ?1`,
    ).bind(userId).run()
    deleted = res.meta.changes ?? 0
  }

  return c.json({ ok: true as const, deleted })
})

shareManageRoutes.get('/:noteId', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT s.*, n.title as note_title, n.folder_id
       FROM shares s
       JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.note_id = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(c.req.param('noteId'), c.get('userId'))
    .first<ShareRow & { note_title: string; folder_id: string | null }>()

  if (!row) return c.json({ share: null })

  const uvRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT visitor_fp) as uvs FROM share_visits WHERE note_id = ?1`,
  )
    .bind(row.note_id)
    .first<{ uvs: number }>()

  return c.json({
    share: toShareInfo(row, new URL(c.req.url).origin, {
      noteTitle: row.note_title,
      folderId: row.folder_id,
      uniqueVisitors: uvRow?.uvs ?? 0,
    }),
  })
})

shareManageRoutes.post('/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
  const body = await readJson<{
    password?: string | null
    expiresIn?: number | null
    customSlug?: string
    isEnabled?: boolean
    folderId?: string | null
    tags?: string[]
  }>(c, JSON_BODY_LIMITS.small)

  const note = await c.env.DB.prepare(
    `SELECT id, title, folder_id, is_pinned, is_starred FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<{ id: string; title: string; folder_id: string | null; is_pinned: number; is_starred: number }>()
  if (!note) throw ApiError.notFound('Note not found')

  const existingShare = await c.env.DB.prepare(
    `SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(noteId, userId)
    .first<ShareRow>()

  let targetSlug = existingShare ? existingShare.slug : newSlug()

  if (body.customSlug !== undefined) {
    const custom = body.customSlug.trim()
    if (custom) {
      if (!isValidCustomSlug(custom)) {
        throw ApiError.badRequest('Custom slug can only contain letters, numbers, hyphens, and underscores (3-64 chars)')
      }
      const collision = await c.env.DB.prepare(
        `SELECT note_id FROM shares WHERE slug = ?1 AND note_id != ?2`,
      )
        .bind(custom, noteId)
        .first<{ note_id: string }>()

      if (collision) {
        throw ApiError.conflict('This custom link is already in use by another share')
      }
      targetSlug = custom
    }
  }

  if (body.password !== undefined && body.password !== null && typeof body.password !== 'string') {
    throw ApiError.badRequest('password must be a string or null')
  }
  if (typeof body.password === 'string' && body.password.length > LIMITS.passwordMaxLength) {
    throw ApiError.badRequest(`The access password must not exceed ${LIMITS.passwordMaxLength} characters`)
  }
  if (typeof body.password === 'string' && body.password.length > 0 && body.password.length < 4) {
    throw ApiError.badRequest('The access password must be at least 4 characters')
  }
  if (
    body.expiresIn !== undefined &&
    body.expiresIn !== null &&
    (!Number.isFinite(body.expiresIn) || body.expiresIn < 0)
  ) {
    throw ApiError.badRequest('expiresIn must be a non-negative number or null')
  }

  const expiresAt =
    typeof body.expiresIn === 'number' && body.expiresIn > 0
      ? Date.now() + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
      : body.expiresIn === 0
        ? null
        : existingShare?.expires_at ?? null

  const passwordHash =
    body.password === null
      ? null
      : typeof body.password === 'string' && body.password
        ? await hashPassword(body.password)
        : existingShare?.password_hash ?? null

  const isEnabled = body.isEnabled !== undefined ? (body.isEnabled ? 1 : 0) : (existingShare?.is_enabled ?? 1)
  const folderId = body.folderId !== undefined ? (body.folderId && isValidId(body.folderId) ? body.folderId : null) : (existingShare?.folder_id ?? null)
  const tagsJson = body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : (existingShare?.tags ?? '[]')

  if (existingShare) {
    await c.env.DB.prepare(
      `UPDATE shares
          SET slug = ?1,
              password_hash = ?2,
              expires_at = ?3,
              is_enabled = ?4,
              folder_id = ?5,
              tags = ?6
        WHERE note_id = ?7 AND user_id = ?8`,
    )
      .bind(targetSlug, passwordHash, expiresAt, isEnabled, folderId, tagsJson, noteId, userId)
      .run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, folder_id, tags, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9)`,
    )
      .bind(targetSlug, noteId, userId, passwordHash, expiresAt, isEnabled, folderId, tagsJson, Date.now())
      .run()
  }

  const row = await c.env.DB.prepare(`SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`)
    .bind(noteId, userId)
    .first<ShareRow>()

  const uvRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT visitor_fp) as uvs FROM share_visits WHERE note_id = ?1`,
  )
    .bind(noteId)
    .first<{ uvs: number }>()

  return c.json({
    share: toShareInfo(row!, new URL(c.req.url).origin, {
      noteTitle: note.title,
      folderId: row?.folder_id,
      uniqueVisitors: uvRow?.uvs ?? 0,
      isPinned: note.is_pinned === 1,
      isStarred: note.is_starred === 1,
    }),
  })
})

shareManageRoutes.delete('/:noteId', async (c) => {
  const noteId = c.req.param('noteId')
  const userId = c.get('userId')
  await c.env.DB.prepare(`DELETE FROM shares WHERE note_id = ?1 AND user_id = ?2`)
    .bind(noteId, userId)
    .run()
  return c.json({ ok: true })
})

shareRoutes.post('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) throw ApiError.notFound('The link does not exist or has been revoked')
  const body = await readOptionalJson<{ password?: string; referrer?: string }>(c, JSON_BODY_LIMITS.small, {})
  const password = typeof body.password === 'string'
    ? body.password.slice(0, LIMITS.passwordMaxLength)
    : ''

  const share = await c.env.DB.prepare(`SELECT * FROM shares WHERE slug = ?1`)
    .bind(slug)
    .first<ShareRow>()
  if (!share) throw ApiError.notFound('The link does not exist or has been revoked')
  if (share.is_enabled === 0) {
    throw ApiError.forbidden('This share link has been temporarily disabled by the author')
  }
  if (share.expires_at && share.expires_at < Date.now()) throw ApiError.notFound('The link has expired')

  if (share.password_hash) {
    if (!password) {
      return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
    }
    const throttleKeys = [
      `share:${slug}:ip:${requestClientIp(c)}`,
      { key: `share-slug:${slug}`, freeFails: 40 },
    ]
    const workKeys = [
      {
        key: `share-work:${slug}:ip:${requestClientIp(c)}`,
        maxAttempts: 8,
        windowMs: 10 * 60 * 1000,
      },
      {
        key: `share-work-slug:${slug}`,
        maxAttempts: 60,
        windowMs: 10 * 60 * 1000,
      },
    ]
    try {
      await consumeAttemptBudget(c.env.DB, workKeys)
      await assertNotLocked(c.env.DB, throttleKeys)
    } catch (err) {
      if (err instanceof ThrottleError) {
        throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${err.retryAfterSec} seconds`, {
          retryAfter: err.retryAfterSec,
        })
      }
      throw err
    }
    if (!(await verifyPassword(password, share.password_hash))) {
      await recordLoginFailure(c.env.DB, throttleKeys)
      return c.json({ error: { code: 'password_invalid', message: 'Incorrect passcode' } }, 401)
    }
    await clearLoginFailures(c.env.DB, [
      ...throttleKeys,
      ...workKeys.map((target) => target.key),
    ])
  }

  const note = await c.env.DB.prepare(
    `SELECT n.title, n.content, n.created_at, n.updated_at, u.name, u.avatar_url
       FROM notes n JOIN users u ON u.id = n.user_id
      WHERE n.id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(share.note_id, share.user_id)
    .first<{
      title: string
      content: string
      created_at: number
      updated_at: number
      name: string
      avatar_url: string
    }>()
  if (!note) throw ApiError.notFound('The note has been deleted')

  const now = Date.now()
  c.executionCtx?.waitUntil(
    (async () => {
      try {
        const clientIp = requestClientIp(c)
        const ua = c.req.header('user-agent') || ''
        const visitorFp = await computeVisitorFingerprint(clientIp, ua)
        const country = c.req.header('cf-ipcountry') || null
        const region = c.req.header('cf-region') || null
        const city = c.req.header('cf-ipcity') || null
        const clientReferrer = typeof body.referrer === 'string' && body.referrer.trim() ? body.referrer.trim() : null
        let candidateReferrer = clientReferrer
        if (!candidateReferrer) {
          const headerRef = c.req.header('referer') || null
          if (headerRef) {
            try {
              const u = new URL(headerRef)
              // If header referer is simply this share page itself, it's not an external referrer
              if (u.pathname !== `/s/${slug}` && u.pathname !== `/s/${slug}/`) {
                candidateReferrer = headerRef
              }
            } catch { /* An unparseable referer header simply means "no external referrer". */ }
          }
        }

        const requestHost = new URL(c.req.url).host
        const selfReferrer = isSelfReferrer(candidateReferrer, requestHost, slug)

        let referrer: string | null = null
        let referrerHost: string | null = null
        if (candidateReferrer) {
          try {
            const u = new URL(candidateReferrer)
            if (u.pathname !== `/s/${slug}` && u.pathname !== `/s/${slug}/`) {
              referrer = candidateReferrer
              referrerHost = parseReferrerHost(candidateReferrer)
            }
          } catch { /* Unparseable referer candidates are skipped; analytics degrade to a null referrer. */ }
        }

        const deviceType = parseDeviceType(ua)
        const os = parseOS(ua)
        const browser = parseBrowser(ua)
        const language = c.req.header('accept-language')?.slice(0, 32) || null
        const bot = isBot(ua) ? 1 : 0
        const isSelf = selfReferrer ? 1 : 0
        const loggedInUserId = c.get('userId')
        const isOwner = loggedInUserId && loggedInUserId === share.user_id ? 1 : 0

        // Real human visit = not an automated bot/spider
        const isRealHumanVisit = bot === 0
        const updateShareStmt = isRealHumanVisit
          ? c.env.DB.prepare(`UPDATE shares SET views = views + 1, last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug)
          : c.env.DB.prepare(`UPDATE shares SET last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug)

        await c.env.DB.batch([
          updateShareStmt,
          c.env.DB.prepare(
            `INSERT INTO share_visits (
               user_id, note_id, slug, visited_at, visitor_fp, country, region, city,
               referrer, referrer_host, device_type, os, browser, language, user_agent,
               is_bot, is_self_referrer, is_owner
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
          ).bind(
            share.user_id,
            share.note_id,
            slug,
            now,
            visitorFp,
            country,
            region,
            city,
            referrer,
            referrerHost,
            deviceType,
            os,
            browser,
            language,
            ua.slice(0, 256),
            bot,
            isSelf,
            isOwner,
          ),
        ])
      } catch {}
    })(),
  )

  if (share.password_hash) {
    const expiresAt = Math.min(
      share.expires_at ?? Number.MAX_SAFE_INTEGER,
      Date.now() + 12 * 60 * 60 * 1000,
    )
    const token = await createShareAssetSession(c.env.DB, slug, share.password_hash, expiresAt)
    setCookie(c, shareAssetCookieName(slug), token, {
      path: '/api/files/',
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
      secure: new URL(c.req.url).protocol === 'https:',
    })
  }

  const body_: PublicNote = {
    title: note.title,
    content: note.content,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    author: { name: note.name, avatarUrl: note.avatar_url },
    site: { name: c.env.APP_NAME || 'Inkstone' },
    share: { slug },
  }
  return c.json(body_)
})

sharePageRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const url = new URL(c.req.url)

  if (!isValidSlug(slug)) {
    return renderShareShell(c, url, null)
  }

  const row = await c.env.DB.prepare(
    `SELECT s.password_hash, s.expires_at, s.is_enabled, n.title, n.excerpt
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.slug = ?1 AND n.deleted_at IS NULL`,
  )
    .bind(slug)
    .first<{
      password_hash: string | null
      expires_at: number | null
      is_enabled: number
      title: string
      excerpt: string
    }>()

  if (row && row.is_enabled === 0) {
    return renderShareShell(c, url, null)
  }

  return renderShareShell(c, url, row)
})

async function renderShareShell(
  c: Context<AppBindings>,
  url: URL,
  row: { password_hash: string | null; expires_at: number | null; title: string; excerpt: string } | null,
) {
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)))
  if (!shell.ok) return shell
  let html = await shell.text()

  const siteName = c.env.APP_NAME || 'Inkstone'
  const expired = row?.expires_at ? row.expires_at < Date.now() : false
  const title = row && !expired && !row.password_hash ? publicShareTitle(row.title) : 'Content unavailable'
  const description = row && !expired && !row.password_hash ? row.excerpt : ''

  const meta = [
    `<title>${escapeHtml(title)} · ${escapeHtml(siteName)}</title>`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : '',
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
  ]
    .filter(Boolean)
    .join('\n    ')

  html = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace('</head>', `    ${meta}\n  </head>`)

  return c.html(html, 200, {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  })
}

export function publicShareTitle(title: string): string {
  return title || 'Untitled note'
}

