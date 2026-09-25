import { Hono, type Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { escapeHtml } from '@shared/escape'
import { PublicNote } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError, errorMessage } from '../../lib/errors'
import { isValidSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readOptionalJsonValidated, requestClientIp } from '../../lib/request'
import { verifyPassword } from '../../lib/password'
import { VIEW_DEDUPE_WINDOW_MS, computeVisitorFingerprint, isBot, isSelfReferrer, parseBrowser, parseDeviceType, parseOS, sanitizeVisitReferrer } from '../../lib/share-analytics'
import { userSettingsBooleanSql } from '../../lib/maintenance'
import { storedChannelValue } from '@shared/share-channel'
import { createShareAssetSession, shareAssetCookieName } from '../../lib/share-asset-session'
import { assertNotLocked, clearLoginFailures, consumeAttemptBudget, recordLoginFailure, ThrottleError } from '../../lib/throttle'
import { shareAccessSchema } from './schemas'
import { ShareRow } from './shares'

interface ShareAccessBody {
  password?: string
  referrer?: string
  /** The `?ref=` marker the visitor's own URL carried, passed through by the share page. */
  ref?: string
}

/**
 * A share row plus the one account setting the visit writer needs. The owner's answer to "may a
 * marker be recorded" is read as part of the lookup the request already performs: asking in a
 * second statement would put another round trip on the busiest path in the module.
 */
type ShareRowWithChannelPolicy = ShareRow & { collect_channel: number }

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
    // The schema caps the guess at LIMITS.passwordMaxLength; oversized ones answer 400 rather than being truncated.
    const password = typeof body.password === 'string' ? body.password : ''
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

async function loadShareOrThrow(db: D1Database, slug: string): Promise<ShareRowWithChannelPolicy> {
  const share = await db.prepare(
    `SELECT s.*, ${userSettingsBooleanSql('$.share.collectChannel', true)} AS collect_channel
       FROM shares s JOIN users u ON u.id = s.user_id
      WHERE s.slug = ?1`,
  )
    .bind(slug)
    .first<ShareRowWithChannelPolicy>()
  // One identical answer for disabled, expired and unknown: the status of a share is not public information.
  if (!share || share.is_enabled === 0 || (share.expires_at && share.expires_at < Date.now())) {
    throw ApiError.notFound('The link does not exist or has been revoked')
  }
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
    // Ten wrong guesses per hour per slug (was 40): paired with the 8-char floor this bounds the offline-free window.
    { key: `share-slug:${slug}`, freeFails: 10 },
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
    // Same body as "password required": a wrong guess must be indistinguishable from no guess.
    return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
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
  params: { share: ShareRowWithChannelPolicy; slug: string; body: ShareAccessBody; now: number },
): Promise<void> {
  const { share, slug, body, now } = params
  try {
    const row = await deriveVisitRow(c, { share, slug, body, now })
    const written = row.insertStatement ? await row.insertStatement.run() : null
    const counted = Number(written?.meta.changes ?? 0) > 0
    // The counter follows the insert's own outcome instead of deciding for itself. The two are no
    // longer one batch, which is the price of that: a crash between them loses one view from the
    // analytics, where the alternative lost the guarantee that one visit is one view.
    await (counted ? row.bumpViewStmt : row.touchViewStmt).run()
  } catch (error) {
    // The message only: the raw error object can carry driver internals (statement shape,
    // binding values) that belong to the account, not to a log line a visitor's visit wrote.
    console.warn('[share] failed to record visit:', errorMessage(error))
  }
}

interface DerivedVisitRow {
  /** Null when this visit must not be written at all (a crawler); otherwise the windowed insert. */
  insertStatement: D1PreparedStatement | null
  bumpViewStmt: D1PreparedStatement
  touchViewStmt: D1PreparedStatement
}

/**
 * Everything one visit says, read off the request and the owner's policy. Split from the write so
 * the two decisions that keep the log honest — whether this visit counts at all, and whether it may
 * carry a marker — are stated where the values are derived rather than inside a bind list.
 *
 * Whether it counts is settled *by the insert* (the window is part of its WHERE), not by a read in
 * front of it: two requests from one visitor cannot both be told "not seen" and both write, because
 * there is no separate answer left to go stale.
 */
async function deriveVisitRow(
  c: Context<AppBindings>,
  params: { share: ShareRowWithChannelPolicy; slug: string; body: ShareAccessBody; now: number },
): Promise<DerivedVisitRow> {
  const { share, slug, body, now } = params
  const clientIp = requestClientIp(c)
  const ua = c.req.header('user-agent') || ''
  // The dedupe key must not include the UA: rotating it would mint a fresh view and row per request.
  // Without the instance secret record no fingerprint rather than fall back to the public date salt,
  // and salt per owner so one browser is not linkable across accounts (SH-04).
  const fpSecret = c.env.VISIT_FP_SECRET ? `${c.env.VISIT_FP_SECRET}:${share.user_id}` : null
  const visitorFp = fpSecret ? await computeVisitorFingerprint(clientIp, '', fpSecret) : null
  const referrerInfo = deriveShareReferrer(c, body, slug)
  const bot = isBot(ua) ? 1 : 0
  const loggedInUserId = c.get('userId')
  const isOwner = loggedInUserId && loggedInUserId === share.user_id ? 1 : 0
  // Switched off means nothing is stored, not "stored and hidden": the owner's choice is about
  // collection. The dedupe window means a marker on a follow-up visit within it is not written,
  // because that visit does not produce a row at all.
  const channel = share.collect_channel === 0 ? null : storedChannelValue(body.ref)
  return {
    // A crawler is not written at all. For anyone else the window rides the insert: `visitor_fp = ?5`
    // is false when the fingerprint is null, which is exactly what an instance without the secret
    // should do — nothing to match on, so every visit is its own row, and the surfaces that show
    // unique visitors say why they cannot count any (see `visitorFp` in the site info).
    insertStatement: bot === 0
      ? c.env.DB.prepare(
        `INSERT INTO share_visits (
           user_id, note_id, slug, visited_at, visitor_fp, country, region, city,
           referrer, referrer_host, device_type, os, browser, language, user_agent,
           is_bot, is_self_referrer, is_owner, channel
         )
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
          WHERE NOT EXISTS (
            SELECT 1 FROM share_visits
             WHERE slug = ?3 AND visited_at > ?20 AND visitor_fp = ?5
          )`,
      ).bind(share.user_id, share.note_id, slug, now, visitorFp,
        c.req.header('cf-ipcountry') || null, c.req.header('cf-region') || null, c.req.header('cf-ipcity') || null,
        referrerInfo.referrer, referrerInfo.referrerHost,
        parseDeviceType(ua), parseOS(ua), parseBrowser(ua), c.req.header('accept-language')?.slice(0, 32) || null,
        ua.slice(0, 256), bot, referrerInfo.selfReferrer ? 1 : 0, isOwner, channel,
        now - VIEW_DEDUPE_WINDOW_MS)
      : null,
    bumpViewStmt: c.env.DB.prepare(`UPDATE shares SET views = views + 1, last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug),
    touchViewStmt: c.env.DB.prepare(`UPDATE shares SET last_viewed_at = ?1 WHERE slug = ?2`).bind(now, slug),
  }
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
  const { referrer, referrerHost } = sanitizeVisitReferrer(candidateReferrer, `/s/${slug}`)
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
