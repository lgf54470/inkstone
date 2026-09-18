import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, mergeSettings } from '@shared/constants'
import { initializeDatabase } from '../db/schema'
import type { AppBindings } from '../env'
import { hashToken, isSessionToken } from '../lib/session-store'
import { toBase64Url } from '../lib/encoding'

export function registerSecurityHeaders(app: Hono<AppBindings>): void {
  app.use('*', async (c, next) => {
    await next()
    const isHttps = new URL(c.req.url).protocol === 'https:'
    const contentType = c.res.headers.get('Content-Type') ?? ''
    // External https images: only signed-in SPA pages may load them, and only
    // when the user opted in via preview.externalImages. API/authorize/share
    // pages always omit `https:` from img-src — share visitors never opt in, so
    // third parties cannot track them through images in shared notes. This CSP
    // is the enforcement layer for raw-HTML <img> tags, which the client-side
    // renderer gate cannot see.
    const imageSchemes = contentType.includes('text/html') && (await viewerAllowsExternalImages(c))
      ? (isHttps ? 'https:' : 'https: http:')
      : ''
    // Inline scripts (theme bootstrap, MCP login page, dev React preamble)
    // are allowed through a fresh per-response nonce instead of
    // 'unsafe-inline', so a future injection point cannot execute scripts.
    // User js-example code runs inside a dedicated Worker whose asset is
    // served without this document CSP, so the page itself never needs eval.
    // /api/* is excluded: API bodies are data, not first-party documents, and
    // a third-party-backed body (e.g. a WebDAV server) must never receive a
    // valid same-origin nonce that would re-enable inline execution.
    const isApiPath = c.req.path.startsWith('/api/')
    const scriptSource = !isApiPath && contentType.includes('text/html')
      ? applyScriptNonce(c)
      : "'self'"
    const formAction = authorizationFormAction(c.req.url, c.res)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header(
      'Content-Security-Policy',
        `default-src 'self'; base-uri 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; ` +
        `img-src 'self' data: blob: ${imageSchemes}; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; ` +
        `manifest-src 'self'; media-src 'self' blob:; form-action ${formAction}; frame-src 'none'; ` +
        "frame-ancestors 'none'; object-src 'none'",
    )
    if (isHttps) {
      c.header('Strict-Transport-Security', 'max-age=31536000')
    }
    if (isApiPath && !c.res.headers.has('Cache-Control')) {
      c.header('Cache-Control', 'no-store')
    }
  })
}

/**
 * Whether this response may reference external https images. Resolves to `false`
 * for API/share/authorize pages, when no (valid) session cookie is present, or
 * when the signed-in user's `preview.externalImages` setting is off. Mirrors the
 * client-side renderer gate; for raw-HTML images this is the only enforcement.
 */
async function viewerAllowsExternalImages(c: Context<AppBindings>): Promise<boolean> {
  const path = c.req.path
  if (path.startsWith('/api/') || path.startsWith('/s/') || path === '/authorize')
    return false
  const token = getCookie(c, SESSION_COOKIE) ?? getCookie(c, LEGACY_SESSION_COOKIE)
  if (!token || !isSessionToken(token))
    return false
  // Ensure the schema exists (WeakMap-cached), then read against the raw D1.
  await initializeDatabase(c.env)
  const row = await c.env.DB.prepare(
    `SELECT u.settings FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
  )
    .bind(await hashToken(token), Date.now())
    .first<{ settings: string }>()
  if (!row)
    return false
  try {
    return mergeSettings(JSON.parse(row.settings)).preview.externalImages === true
  }
  catch {
    return false
  }
}

/** Adds a per-response nonce to every inline script in an HTML response and returns the CSP script source. */
function applyScriptNonce(c: Context<AppBindings>): string {
  const nonce = randomNonce()
  c.res = new HTMLRewriter()
    .on('script', {
      element(element) {
        if (!element.hasAttribute('src') && !element.hasAttribute('nonce')) {
          element.setAttribute('nonce', nonce)
        }
      },
    })
    .transform(new Response(c.res.body, c.res))
  return `'self' 'nonce-${nonce}'`
}

function randomNonce(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(18)))
}

function authorizationFormAction(requestUrl: string, response: Response): string {
  const sources = ["'self'"]
  const url = new URL(requestUrl)
  if (url.pathname !== '/authorize' || response.status !== 200 ||
      !response.headers.get('Content-Type')?.includes('text/html')) {
    return sources.join(' ')
  }
  const redirectUri = url.searchParams.get('redirect_uri')
  if (!redirectUri) return sources.join(' ')
  try {
    const callback = new URL(redirectUri)
    if ((callback.protocol === 'http:' || callback.protocol === 'https:') && callback.origin !== url.origin) {
      sources.push(callback.origin)
    }
  } catch { /* An unparseable redirect_uri simply contributes no extra origin to the CSP. */ }
  return sources.join(' ')
}
