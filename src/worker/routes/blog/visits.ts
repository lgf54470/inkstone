import type { Context } from 'hono'
import type { AppBindings } from '../../env'
import { requestClientIp } from '../../lib/request'
import { VIEW_DEDUPE_WINDOW_MS, isBot, isSelfReferrer, parseDeviceType, parseOS, parseBrowser, computeVisitorFingerprint, sanitizeVisitReferrer } from '../../lib/share-analytics'
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
  isSelfReferrer: number
  isOwner: number
}

interface VisitContext {
  /** The reader's own referrer. Absent on the server-side read path, which forwards none. */
  referrer?: string | null
  /** The site the blog is served at, used to tell a referral from the blog itself. */
  selfReferrerHost?: string | null
}

async function collectVisitParams(
  c: Context<AppBindings>,
  row: BlogPostPublicRow,
  now: number,
  context: VisitContext,
): Promise<BlogVisitParams> {
  // CF-Connecting-IP is injected by the Cloudflare edge (see requestClientIp);
  // raw x-forwarded-for is client-controlled and must not feed analytics.
  const rawIp = requestClientIp(c) || ''
  const ua = c.req.header('user-agent') || ''
  const loggedInUserId = c.get('userId')
  // Same rules as share visit recording (SH-04/SH-08, mirrored for blog here):
  // the dedupe key excludes the UA, salt is HMAC under the instance secret and
  // per owner, and a missing secret records no fingerprint at all.
  const fpSecret = c.env.VISIT_FP_SECRET ? `${c.env.VISIT_FP_SECRET}:${row.user_id}` : null
  const visitorFp = fpSecret ? await computeVisitorFingerprint(rawIp, '', fpSecret) : null
  const referrerCandidate = context.referrer ?? c.req.header('referer') ?? null
  const referrerInfo = sanitizeVisitReferrer(referrerCandidate)
  return {
    userId: row.user_id,
    postId: row.id,
    slug: row.slug,
    visitedAt: now,
    visitorFp,
    country: c.req.header('cf-ipcountry') || c.req.header('x-country') || null,
    region: c.req.header('cf-region') || c.req.header('x-region') || null,
    city: c.req.header('cf-city') || c.req.header('x-city') || null,
    referrer: referrerInfo.referrer,
    referrerHost: referrerInfo.referrerHost,
    deviceType: parseDeviceType(ua),
    os: parseOS(ua),
    browser: parseBrowser(ua),
    language: c.req.header('accept-language')?.slice(0, 32) || null,
    userAgent: ua.slice(0, 256),
    isBot: isBot(ua) ? 1 : 0,
    // The same judgement the share side applies (server-side, against the host the request arrived
    // on): the column was written as a literal 0, so the dashboard's "exclude self-referrals"
    // switch had nothing to exclude and reported a number that was never measured.
    isSelfReferrer: isSelfReferrer(referrerCandidate, context.selfReferrerHost ?? new URL(c.req.url).host) ? 1 : 0,
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
      params.isSelfReferrer,
      params.isOwner,
    )
    .run()
}

// The analytics row is written for every visit; the boolean tells the caller
// whether this visit should bump the post's views counter (new fingerprint
// within the dedupe window, not a bot).
export async function recordBlogVisit(
  c: Context<AppBindings>,
  row: BlogPostPublicRow,
  now: number,
  context: VisitContext = {},
): Promise<boolean> {
  try {
    const params = await collectVisitParams(c, row, now, context)
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