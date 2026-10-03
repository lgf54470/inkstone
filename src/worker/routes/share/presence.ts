import { Hono } from 'hono'
import type { Context } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { LIMITS } from '@shared/constants'
import { SHARE_PRESENCE_TTL_MS, type PublicSharePresence, type SharePresencePosition, type SharePresenceSession } from '@shared/share-presence'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated, readOptionalJsonValidated, requestClientIp } from '../../lib/request'
import { hashToken, newSessionToken } from '../../lib/session-store'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'
import { sharePresenceAccessSchema, sharePresenceWriteSchema } from './schemas'

/**
 * The audience-side show position (ADR-0006): the presenter writes where the talk is, a viewer on their
 * own device reads it and turns its own page.
 *
 * Two halves live here because they are one contract seen from both ends. The owner half is a normal
 * authenticated share route; the public half is the one that has to be careful — it is reachable by a
 * stranger, so it answers with a capability token rather than a session, and it never writes a visitor
 * row: the position is not a view, and counting every heartbeat would turn "how many people opened
 * this link" into "how many seconds they sat there".
 */

/** A row of `share_presence`, shaped the way D1 hands it back. */
interface SharePresenceRow {
  slug: string
  user_id: string
  note_id: string
  token_hash: string
  slide: number
  page: number
  step: number
  updated_at: number
  expires_at: number
}

/** The share a show needs: a live link, the note it points at, and the note's own title for the viewer. */
interface PresentableShare {
  slug: string
  note_id: string
  user_id: string
  expires_at: number | null
  title: string
}

export function registerSharePresenceRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerSharePresenceStartRoute(shareManageRoutes)
  registerSharePresenceWriteRoute(shareManageRoutes)
  registerSharePresenceStopRoute(shareManageRoutes)
  registerSharePresenceStatusRoute(shareManageRoutes)
}

/**
 * Starting a show mints the capability the audience URL will carry. It is returned exactly once: the
 * row keeps a hash, so a database read cannot hand out a working link, and a speaker who loses the
 * link starts a new show rather than recovering an old one.
 */
function registerSharePresenceStartRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/:noteId/present/start', async (c) => {
    const share = await loadPresentableShare(c.env.DB, c.get('userId'), c.req.param('noteId'))
    const token = newSessionToken()
    const now = Date.now()
    const expiresAt = presenceExpiry(share.expires_at, now)
    await c.env.DB.prepare(
      `INSERT INTO share_presence (slug, user_id, note_id, token_hash, slide, page, step, updated_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, 0, 0, 0, ?5, ?6)
       ON CONFLICT(slug) DO UPDATE SET token_hash = ?4, slide = 0, page = 0, step = 0, updated_at = ?5, expires_at = ?6`,
    )
      .bind(share.slug, share.user_id, share.note_id, await hashToken(token), now, expiresAt)
      .run()
    const response: SharePresenceSession = { token, expiresAt, slug: share.slug, slide: 0, page: 0, step: 0 }
    return c.json(response, 200, { 'Cache-Control': 'no-store' })
  })
}

/**
 * Writing the position refreshes the lease: a talk that runs long is not cut off, while a show that
 * was simply left open expires on its own. There is no INSERT here on purpose — a position can only
 * be written into a show that was started, so a stale client cannot resurrect a revoked token.
 */
function registerSharePresenceWriteRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/:noteId/present', async (c) => {
    const share = await loadPresentableShare(c.env.DB, c.get('userId'), c.req.param('noteId'))
    const body = await readJsonValidated(c, sharePresenceWriteSchema, JSON_BODY_LIMITS.small) as SharePresencePosition
    const now = Date.now()
    const updated = await c.env.DB.prepare(
      `UPDATE share_presence SET slide = ?2, page = ?3, step = ?4, updated_at = ?5, expires_at = ?6
        WHERE slug = ?1 AND user_id = ?7 AND expires_at > ?5`,
    )
      .bind(share.slug, body.slide, body.page, body.step, now, presenceExpiry(share.expires_at, now), share.user_id)
      .run()
    if (!updated.meta.changes) throw ApiError.notFound('The presentation is not running')
    return c.json({ updatedAt: now }, 200, { 'Cache-Control': 'no-store' })
  })
}

/** Stopping is idempotent: the presenter presses it once and the browser may press it again on unload. */
function registerSharePresenceStopRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/:noteId/present/stop', async (c) => {
    const share = await loadPresentableShare(c.env.DB, c.get('userId'), c.req.param('noteId'))
    await c.env.DB.prepare(`DELETE FROM share_presence WHERE slug = ?1 AND user_id = ?2`).bind(share.slug, share.user_id).run()
    return c.json({ stopped: true }, 200, { 'Cache-Control': 'no-store' })
  })
}

/**
 * The owner's own question, asked when the share sheet opens: is a show running, so the control can
 * say "stop" instead of "start". It never returns the token — that left the server once.
 */
function registerSharePresenceStatusRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/:noteId/present', async (c) => {
    const share = await loadPresentableShare(c.env.DB, c.get('userId'), c.req.param('noteId'))
    const row = await loadPresenceRow(c.env.DB, share.slug)
    if (!row) return c.json({ running: false }, 200, { 'Cache-Control': 'no-store' })
    const running: PublicSharePresence = { slide: row.slide, page: row.page, step: row.step, updatedAt: row.updated_at, title: share.title }
    return c.json({ running: true, expiresAt: row.expires_at, presence: running }, 200, { 'Cache-Control': 'no-store' })
  })
}

export function registerSharePublicPresenceRoutes(shareRoutes: Hono<AppBindings>): void {
  shareRoutes.post('/:slug/present', async (c) => {
    const slug = c.req.param('slug')
    if (!isValidSlug(slug)) throw shareNotFound()
    await enforcePresenceReadBudget(c, slug)
    const body = await readOptionalJsonValidated(c, sharePresenceAccessSchema, JSON_BODY_LIMITS.small, {}) as { token?: string }
    const row = await loadPresenceRow(c.env.DB, slug)
    // One answer for "no such share", "no show running", "no token", "wrong token" and "the show is
    // over": the existence of a presentation is the owner's information, not the caller's to learn.
    if (!row || !body.token || !(await tokenMatches(row, body.token))) throw shareNotFound()
    const share = await loadLiveShareBySlug(c.env.DB, slug)
    if (!share) {
      // The share was revoked or expired while the row was still inside its lease. Take the row with
      // it, so the next heartbeat answers the same way the first one did rather than waiting out the TTL.
      await c.env.DB.prepare(`DELETE FROM share_presence WHERE slug = ?1`).bind(slug).run()
      throw shareNotFound()
    }
    const presence: PublicSharePresence = { slide: row.slide, page: row.page, step: row.step, updatedAt: row.updated_at, title: share.title }
    // A viewer polls on a beat, and most beats nothing has changed. The validator is taken over the
    // answer's own numbers, which is what makes a hit cheap: 304 carries no row, no title and no work.
    const etag = `W/"${row.slide}-${row.page}-${row.step}-${row.updated_at}"`
    const headers = { ETag: etag, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304, headers)
    return c.json(presence, 200, headers)
  })
}

/**
 * The read budget is its own keys (`share-present:view:*`), deliberately not the page-view budget: a
 * viewer who opens the shared page and a viewer whose client is polling are different kinds of traffic,
 * and sharing a bucket would let one heartbeat starve the other's page load.
 *
 * The numbers are the ADR's: 2 s over a 10-minute window is 300 reads a head, which is above the budget
 * on purpose — the 304 path is what makes an idle viewer cheap, and if the budget has to be raised, the
 * poll interval has to be measured first (ADR-0006 section 4).
 */
const READ_SLUG_IP_BUDGET = { maxAttempts: 120, windowMs: 10 * 60 * 1000 }
const READ_IP_BUDGET = { maxAttempts: 300, windowMs: 10 * 60 * 1000 }

async function enforcePresenceReadBudget(c: Context<AppBindings>, slug: string): Promise<void> {
  const clientIp = requestClientIp(c)
  try {
    await consumeAttemptBudget(c.env.DB, [
      { key: `share-present:view:${slug}:ip:${clientIp}`, ...READ_SLUG_IP_BUDGET },
      { key: `share-present:view:ip:${clientIp}`, ...READ_IP_BUDGET },
    ])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${error.retryAfterSec} seconds`, { retryAfter: error.retryAfterSec })
    }
    throw error
  }
}

async function tokenMatches(row: SharePresenceRow, token: string): Promise<boolean> {
  if (token.length > LIMITS.sharePresentTokenMaxLength) return false
  return await hashToken(token) === row.token_hash
}

/** A show lives at most `SHARE_PRESENCE_TTL_MS`, and never past the link it rides on. */
function presenceExpiry(shareExpiresAt: number | null, now: number): number {
  const lease = now + SHARE_PRESENCE_TTL_MS
  return shareExpiresAt && shareExpiresAt < lease ? shareExpiresAt : lease
}

async function loadPresenceRow(db: D1Database, slug: string): Promise<SharePresenceRow | null> {
  return await db.prepare(
    `SELECT slug, user_id, note_id, token_hash, slide, page, step, updated_at, expires_at
       FROM share_presence WHERE slug = ?1 AND expires_at > ?2`,
  )
    .bind(slug, Date.now())
    .first<SharePresenceRow>()
}

async function loadPresentableShare(db: D1Database, userId: string, noteId: string): Promise<PresentableShare> {
  const share = await db.prepare(
    `SELECT s.slug, s.note_id, s.user_id, s.expires_at, n.title
       FROM shares s JOIN notes n ON n.id = s.note_id
      WHERE s.user_id = ?1 AND s.note_id = ?2 AND s.is_enabled = 1`,
  )
    .bind(userId, noteId)
    .first<PresentableShare & { expires_at: number | null }>()
  if (!share || (share.expires_at && share.expires_at < Date.now())) throw ApiError.notFound('Note not found')
  return { slug: share.slug, note_id: share.note_id, user_id: share.user_id, expires_at: share.expires_at, title: share.title }
}

async function loadLiveShareBySlug(db: D1Database, slug: string): Promise<PresentableShare | null> {
  const share = await db.prepare(
    `SELECT s.slug, s.note_id, s.user_id, s.expires_at, n.title
       FROM shares s JOIN notes n ON n.id = s.note_id
      WHERE s.slug = ?1 AND s.is_enabled = 1`,
  )
    .bind(slug)
    .first<PresentableShare & { expires_at: number | null }>()
  if (!share || (share.expires_at && share.expires_at < Date.now())) return null
  return share
}

/** The same words `loadShareOrThrow` answers with: a revoked link, an expired one and one that never
 * existed do not differ, and neither does a show the caller has no part in. */
function shareNotFound(): ApiError {
  return ApiError.notFound('The link does not exist or has been revoked')
}
