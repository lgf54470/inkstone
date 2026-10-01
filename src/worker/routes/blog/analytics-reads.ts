import type { BlogVisitLog } from '@shared/types'
import type { VisitTrafficFilters } from '@shared/share-selection'
import { visitTrafficSql } from '../../lib/share-selection-sql'
import {
  analyticsWindow,
  parseAnalyticsRequest,
  parseBotName,
  type AnalyticsRequest,
  type AnalyticsWindow,
} from '../../lib/share-analytics'

/**
 * The reads the dashboard and the single-post drilldown (FEA-09) have in common. Both answer the
 * same question about the same rows; resolving the window, folding visit rows and building the visit
 * log were written once here so the drilldown cannot come to mean a different window or a different
 * shape of visit than the dashboard that led to it.
 *
 * Every statement takes an optional `postId`: the dashboard omits it, the drilldown passes one, and
 * the SQL differs only by that one condition.
 */

export type BlogAnalyticsContext = AnalyticsRequest & AnalyticsWindow

interface MinVisitedRow {
  min_ts: number | null
}

/**
 * The range, the traffic filters and the resolved window. `range='all'` starts at the earliest visit
 * the caller can see — the account's earliest, or the post's own when a post is in scope — because a
 * single post is not older than the blog that contains it.
 */
export async function blogAnalyticsContext(
  db: D1Database,
  c: { req: { query(key: string): string | undefined } },
  userId: string,
  postId?: string,
): Promise<BlogAnalyticsContext> {
  const request = parseAnalyticsRequest(c)
  const minRow = request.range === 'all' ? await minVisitedAtStatement(db, userId, postId).first<MinVisitedRow>() : null
  return { ...request, ...analyticsWindow(request.range, request.now, minRow?.min_ts ?? null) }
}

function minVisitedAtStatement(db: D1Database, userId: string, postId?: string): D1PreparedStatement {
  if (postId) {
    return db.prepare('SELECT MIN(visited_at) as min_ts FROM blog_visits WHERE user_id = ?1 AND post_id = ?2').bind(userId, postId)
  }
  return db.prepare('SELECT MIN(visited_at) as min_ts FROM blog_visits WHERE user_id = ?1').bind(userId)
}

export interface BlogPrevVisitsRow {
  prev_views: number
  prev_uv: number
}

/** The previous window's totals, for the delta badges; scoped to one post when one is given. */
export function blogPrevVisitsStatement(
  db: D1Database,
  userId: string,
  prevStartTs: number,
  startTs: number,
  clause: string,
  postId?: string,
): D1PreparedStatement {
  const postCondition = postId ? ' AND post_id = ?4' : ''
  const statement = db.prepare(
    `SELECT COUNT(*) as prev_views, COUNT(DISTINCT visitor_fp) as prev_uv
       FROM blog_visits
      WHERE user_id = ?1 AND visited_at >= ?2 AND visited_at < ?3 ${clause}${postCondition}`,
  )
  return postId ? statement.bind(userId, prevStartTs, startTs, postId) : statement.bind(userId, prevStartTs, startTs)
}

export interface BlogRecentVisitRow {
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

/** The visit tail both surfaces list; the drilldown's copy is the same rows for one post. */
export function blogRecentVisitsStatement(
  db: D1Database,
  userId: string,
  filters: VisitTrafficFilters,
  postId?: string,
): D1PreparedStatement {
  const postCondition = postId ? ' AND bv.post_id = ?2' : ''
  const statement = db.prepare(
    `SELECT bv.id, bv.post_id, bv.slug, bv.visited_at, bv.country, bv.region, bv.city,
            bv.referrer, bv.referrer_host, bv.device_type, bv.os, bv.browser, bv.user_agent,
            bv.is_bot, bv.is_self_referrer, bv.is_owner,
            COALESCE(p.title, bv.slug) as post_title
       FROM blog_visits bv
       LEFT JOIN blog_posts p ON p.id = bv.post_id
      WHERE bv.user_id = ?1 ${visitTrafficSql(filters, 'bv')}${postCondition}
      ORDER BY bv.visited_at DESC
      LIMIT 20`,
  )
  return postId ? statement.bind(userId, postId) : statement.bind(userId)
}

export function toBlogVisitLogs(rows: BlogRecentVisitRow[]): BlogVisitLog[] {
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
