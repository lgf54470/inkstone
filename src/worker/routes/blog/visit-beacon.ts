import type { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { JSON_BODY_LIMITS, readJsonValidated, requestClientIp } from '../../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'
import { getBlogSettings } from './settings'
import { blogOwnerOf } from './owner'
import { loadPublicPostBySlug } from './public-post'
import { recordBlogVisit } from './visits'
import { blogVisitBeaconSchema } from './schemas'

/**
 * A page view is reported by the browser that rendered the page, not by the server that fetched it:
 * the reader's own request is the only one that carries their user-agent and their referrer, and the
 * server-side fetch had neither (which is why every recorded visit used to be a bot and the counter
 * never moved). The endpoint is public and write-once-per-window, so it is budgeted per client and
 * deduplicated per (post, fingerprint) like the rest of the visit path.
 */
const VISIT_BEACON_BUDGET = { maxAttempts: 120, windowMs: 10 * 60 * 1000, lockMs: 60 * 1000 }

export function registerBlogPublicVisitBeaconRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.post('/visits', async (c) => {
    const db = c.env.DB
    const ownerId = blogOwnerOf(c).userId
    const body = await readJsonValidated(c, blogVisitBeaconSchema, JSON_BODY_LIMITS.small)

    await enforceBeaconBudget(db, c)
    const row = await loadPublicPostBySlug(db, ownerId, body.slug)

    // A referral counts as one of the blog's own when it comes from the site the blog is served at,
    // which is the address its own settings name rather than this API host.
    const settings = await getBlogSettings(db, ownerId)
    const frontendHost = safeHost(settings.frontendUrl)
    const counted = await recordBlogVisit(c, row, Date.now(), {
      referrer: body.referrer ?? null,
      selfReferrerHost: frontendHost,
    })

    if (counted) {
      await db
        .prepare('UPDATE blog_posts SET views = views + 1 WHERE id = ?1 AND user_id = ?2')
        .bind(row.id, ownerId)
        .run()
    }

    return c.json({ ok: true, counted })
  })
}

async function enforceBeaconBudget(
  db: D1Database,
  c: { req: { header: (name: string) => string | undefined; raw?: Request } },
): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{ ...VISIT_BEACON_BUDGET, key: `blog-visit-beacon:${requestClientIp(c)}` }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many page views. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}

function safeHost(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return null
  }
}
