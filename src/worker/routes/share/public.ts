import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { LIMITS } from "@shared/constants";
import { escapeHtml } from "@shared/escape";
import { PublicNote } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { isValidSlug } from "../../lib/id";
import { JSON_BODY_LIMITS, readOptionalJsonValidated, requestClientIp } from "../../lib/request";
import { verifyPassword } from "../../lib/password";
import { computeVisitorFingerprint, isBot, isSelfReferrer, parseBrowser, parseDeviceType, parseOS, parseReferrerHost } from "../../lib/share-analytics";
import { createShareAssetSession, shareAssetCookieName } from "../../lib/share-asset-session";
import { assertNotLocked, clearLoginFailures, consumeAttemptBudget, recordLoginFailure, ThrottleError } from "../../lib/throttle";
import { shareAccessSchema } from './schemas';
import { ShareRow } from "./shares";

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

export function publicShareTitle(title: string): string {
  return title || 'Untitled note'
}

export function registerSharePublicRoutes(shareRoutes: Hono<AppBindings>): void {
shareRoutes.post('/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!isValidSlug(slug)) throw ApiError.notFound('The link does not exist or has been revoked')
  const body = await readOptionalJsonValidated(c, shareAccessSchema, JSON_BODY_LIMITS.small, {})
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
      } catch (error) {
        console.warn('[share] failed to record visit', error)
      }
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
}

