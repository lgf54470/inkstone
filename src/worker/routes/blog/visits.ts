import type { Context } from 'hono'
import type { AppBindings } from '../../env'
import { requestClientIp } from '../../lib/request'
import { VIEW_DEDUPE_WINDOW_MS, isBot, parseDeviceType, parseOS, parseBrowser, parseReferrerHost, computeVisitorFingerprint } from '../../lib/share-analytics'
import type { BlogPostPublicRow } from '../../db/rows'

interface BlogVisitParams {
  userId: string | null
  postId: string
  slug: string
  visitedAt: number
  visitorFp: string | null
  country: string | null
  region: string | null
  city: string | null
  referrer: string | null
  referrerHost: string | null
  deviceType: string
  os: string
  browser: string
  language: string | null
  userAgent: string
  isBot: number
  isOwner: number
}

async function collectVisitParams(c: Context<AppBindings>, row: BlogPostPublicRow, now: number): Promise<BlogVisitParams> {
  // CF-Connecting-IP is injected by the Cloudflare edge (see requestClientIp);
  // raw x-forwarded-for is client-controlled and must not feed analytics.
  const rawIp = requestClientIp(c) || ''
  const ua = c.req.header('user-agent') || ''
  const rawReferrer = c.req.header('referer') || null
  const loggedInUserId = c.get('userId')
  return {
    userId: row.user_id,
    postId: row.id,
    slug: row.slug,
    visitedAt: now,
    visitorFp: await computeVisitorFingerprint(rawIp, ua),
    country: c.req.header('cf-ipcountry') || c.req.header('x-country') || null,
    region: c.req.header('cf-region') || c.req.header('x-region') || null,
    city: c.req.header('cf-city') || c.req.header('x-city') || null,
    referrer: rawReferrer,
    referrerHost: parseReferrerHost(rawReferrer),
    deviceType: parseDeviceType(ua),
    os: parseOS(ua),
    browser: parseBrowser(ua),
    language: c.req.header('accept-language')?.slice(0, 32) || null,
    userAgent: ua.slice(0, 256),
    isBot: isBot(ua) ? 1 : 0,
    isOwner: loggedInUserId && loggedInUserId === row.user_id ? 1 : 0,
  }
}

async function insertBlogVisit(db: D1Database, params: BlogVisitParams): Promise<void> {
  await db
    .prepare(`
      INSERT INTO blog_visits (
        user_id, post_id, slug, visited_at, visitor_fp, country, region, city,
        referrer, referrer_host, device_type, os, browser, language, user_agent,
        is_bot, is_self_referrer, is_owner
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
    `)
    .bind(
      params.userId,
      params.postId,
      params.slug,
      params.visitedAt,
      params.visitorFp,
      params.country,
      params.region,
      params.city,
      params.referrer,
      params.referrerHost,
      params.deviceType,
      params.os,
      params.browser,
      params.language,
      params.userAgent,
      params.isBot,
      0,
      params.isOwner,
    )
    .run()
}

// The analytics row is written for every visit; the boolean tells the caller
// whether this visit should bump the post's views counter (new fingerprint
// within the dedupe window, not a bot).
export async function recordBlogVisit(c: Context<AppBindings>, row: BlogPostPublicRow, now: number): Promise<boolean> {
  try {
    const params = await collectVisitParams(c, row, now)
    if (params.visitorFp) {
      const seen = await c.env.DB
        .prepare('SELECT 1 AS seen FROM blog_visits WHERE post_id = ?1 AND visitor_fp = ?2 AND visited_at > ?3')
        .bind(row.id, params.visitorFp, now - VIEW_DEDUPE_WINDOW_MS)
        .first()
      if (seen) return false
    }
    await insertBlogVisit(c.env.DB, params)
    return !params.isBot
  } catch (err) {
    console.error('Failed to log blog visit', err)
    return false
  }
}