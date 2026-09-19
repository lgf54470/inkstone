import { Hono, type Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { LIMITS } from '@shared/constants'
import { escapeHtml } from '@shared/escape'
import { PublicNote } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readOptionalJsonValidated, requestClientIp } from '../../lib/request'
import { verifyPassword } from '../../lib/password'
import { VIEW_DEDUPE_WINDOW_MS, computeVisitorFingerprint, isBot, isSelfReferrer, parseBrowser, parseDeviceType, parseOS, parseReferrerHost } from '../../lib/share-analytics'
import { createShareAssetSession, shareAssetCookieName } from '../../lib/share-asset-session'
import { assertNotLocked, clearLoginFailures, consumeAttemptBudget, recordLoginFailure, ThrottleError } from '../../lib/throttle'
import { shareAccessSchema } from './schemas'
import { ShareRow } from './shares'

interface ShareAccessBody {
  password?: string
  referrer?: string
}

export async function renderShareShell(
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


function publicShareTitle(title: string): string {
  return title || 'Untitled note'
}

export function registerSharePublicRoutes(shareRoutes: Hono<AppBindings>): void {
  shareRoutes.post('/:slug', async (c) => {
    const slug = c.req.param('slug')
    if (!isValidSlug(slug)) throw ApiError.notFound('The link does not exist or has been revoked')
    await enforceShareViewBudget(c, slug)
    const body = await readOptionalJsonValidated(c, shareAccessSchema, JSON_BODY_LIMITS.small, {}) as ShareAccessBody
    const password = typeof body.password === 'string'
      ? body.password.slice(0, LIMITS.passwordMaxLength)
      : ''
    const share = await loadShareOrThrow(c.env.DB, slug)
    const denied = await authenticateShareAccess(c, share, slug, password)
    if (denied) return denied
    const note = await loadSharedNote(c.env.DB, share)
    const now = Date.now()
    c.executionCtx?.waitUntil(recordShareVisit(c, { share, slug, body, now }))
    await issueShareAssetCookie(c, share, slug)
    const response: PublicNote = {
      title: note.title,
      content: note.content,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      author: { name: note.name, avatarUrl: note.avatar_url },
      site: { name: c.env.APP_NAME || 'Inkstone' },
      share: { slug },
    }
    return c.json(response)
  })
}

const VIEW_SLUG_IP_BUDGET = { maxAttempts: 20, windowMs: 10 * 60 * 1000 }
const VIEW_IP_BUDGET = { maxAttempts: 60, windowMs: 10 * 60 * 1000 }

async function enforceShareViewBudget(c: Context<AppBindings>, slug: string): Promise<void> {
  const clientIp = requestClientIp(c)
  try {
    await consumeAttemptBudget(c.env.DB, [
      { key: `share-view:${slug}:ip:${clientIp}`, ...VIEW_SLUG_IP_BUDGET },
      { key: `share-view:ip:${clientIp}`, ...VIEW_IP_BUDGET },
    ])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}

async function loadShareOrThrow(db: D1Database, slug: string): Promise<ShareRow> {
  const share = await db.prepare(`SELECT * FROM shares WHERE slug = ?1`)
    .bind(slug)
    .first<ShareRow>()
  if (!share) throw ApiError.notFound('The link does not exist or has been revoked')
  if (share.is_enabled === 0) {
    throw ApiError.forbidden('This share link has been temporarily disabled by the author')
  }
  if (share.expires_at && share.expires_at < Date.now()) throw ApiError.notFound('The link has expired')
  return share
}

async function authenticateShareAccess(
  c: Context<AppBindings>,
  share: ShareRow,
  slug: string,
  password: string,
): Promise<Response | null> {
  if (!share.password_hash) return null
  if (!password) {
    return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
  }
  const clientIp = requestClientIp(c)
  const throttleKeys = [
    `share:${slug}:ip:${clientIp}`,
    { key: `share-slug:${slug}`, freeFails: 40 },
  ]
  const workKeys = [
    {
      key: `share-work:${slug}:ip:${clientIp}`,
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
  return null
}

async function loadSharedNote(db: D1Database, share: ShareRow): Promise<{
  title: string
  content: string
  created_at: number
  updated_at: number
  name: string
  avatar_url: string
}> {
  const note = await db.prepare(
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
  return note
}

async function recordShareVisit(
  c: Context<AppBindings>,
  params: { share: ShareRow; slug: string; body: ShareAccessBody; now: number },
): Promise<void> {
  const { share, slug, body, now } = params
  try {
    const clientIp = requestClientIp(c)
    const ua = c.req.header('user-agent') || ''
    // The dedupe key must not include the UA: rotating it would mint a fresh view and row per request.
    const visitorFp = await computeVisitorFingerprint(clientIp, '')
    const referrerInfo = deriveShareReferrer(c, body, slug)
    const deviceType = parseDeviceType(ua)
    const os = parseOS(ua)
    const browser = parseBrowser(ua)
    const language = c.req.header('accept-language')?.slice(0, 32) || null
    const bot = isBot(ua) ? 1 : 0
    const isSelf = referrerInfo.selfReferrer ? 1 : 0
    const loggedInUserId = c.get('userId')
    const isOwner = loggedInUserId && loggedInUserId === share.user_id ? 1 : 0
    const recentlySeen = await isRecentlySeenVisit(c.env.DB, slug, visitorFp, now)
    const countsForViews = bot === 0 && !recentlySeen
    const updateShareStmt = countsForViews
      ? c.env.DB.prepare(`UPDATE shares SET views = views + 1, last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug)
      : c.env.DB.prepare(`UPDATE shares SET last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug)
    const geo = {
      country: c.req.header('cf-ipcountry') || null,
      region: c.req.header('cf-region') || null,
      city: c.req.header('cf-ipcity') || null,
    }

    const statements = [updateShareStmt]
    if (countsForViews) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO share_visits (
           user_id, note_id, slug, visited_at, visitor_fp, country, region, city,
           referrer, referrer_host, device_type, os, browser, language, user_agent,
           is_bot, is_self_referrer, is_owner
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
      ).bind(share.user_id, share.note_id, slug, now, visitorFp,
        geo.country, geo.region, geo.city, referrerInfo.referrer, referrerInfo.referrerHost,
        deviceType, os, browser, language, ua.slice(0, 256), bot, isSelf, isOwner))
    }
    await c.env.DB.batch(statements)
  } catch (error) {
    console.warn('[share] failed to record visit', error)
  }
}

async function isRecentlySeenVisit(
  db: D1Database,
  slug: string,
  visitorFp: string | null,
  now: number,
): Promise<boolean> {
  if (!visitorFp) return false
  const seen = await db
    .prepare('SELECT 1 AS seen FROM share_visits WHERE slug = ?1 AND visitor_fp = ?2 AND visited_at > ?3')
    .bind(slug, visitorFp, now - VIEW_DEDUPE_WINDOW_MS)
    .first()
  return Boolean(seen)
}

const REFERRER_PROTOCOLS = new Set(['http:', 'https:', 'android-app:', 'ios-app:'])

function storedReferrerValue(u: URL): string {
  // The raw candidate may carry query tokens or fragments; only origin+path earns a column.
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    return `${u.origin}${u.pathname}`.slice(0, LIMITS.shareReferrerMaxLength)
  }
  return u.href.slice(0, LIMITS.shareReferrerMaxLength)
}

function deriveShareReferrer(
  c: Context<AppBindings>,
  body: ShareAccessBody,
  slug: string,
): { selfReferrer: boolean; referrer: string | null; referrerHost: string | null } {
  const clientReferrer = typeof body.referrer === 'string' && body.referrer.trim() ? body.referrer.trim() : null
  const candidateReferrer = clientReferrer ?? headerReferrerCandidate(c, slug)
  const requestHost = new URL(c.req.url).host
  const selfReferrer = isSelfReferrer(candidateReferrer, requestHost, slug)
  let referrer: string | null = null
  let referrerHost: string | null = null
  if (candidateReferrer) {
    try {
      const u = new URL(candidateReferrer)
      if (REFERRER_PROTOCOLS.has(u.protocol) && u.pathname !== `/s/${slug}` && u.pathname !== `/s/${slug}/`) {
        referrer = storedReferrerValue(u)
        referrerHost = parseReferrerHost(candidateReferrer)
      }
    } catch { /* Unparseable referer candidates are skipped; analytics degrade to a null referrer. */ }
  }
  return { selfReferrer, referrer, referrerHost }
}

function headerReferrerCandidate(c: Context<AppBindings>, slug: string): string | null {
  const headerRef = c.req.header('referer') || null
  if (!headerRef) return null
  try {
    const u = new URL(headerRef)
    if (u.pathname === `/s/${slug}` || u.pathname === `/s/${slug}/`) return null
    return headerRef
  } catch { /* An unparseable referer header simply means "no external referrer". */ return null }
}

async function issueShareAssetCookie(c: Context<AppBindings>, share: ShareRow, slug: string): Promise<void> {
  if (!share.password_hash) return
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
