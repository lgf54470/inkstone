import { Hono } from "hono";
import type { AppBindings } from "../../env";
import { rebuildFtsIndex } from "../../db/fts";
import { ApiError } from "../../lib/errors";
import { acquireLease } from "../../lib/lease";
import { consumeAttemptBudget, ThrottleError } from "../../lib/throttle";
import { requireAuth } from "../../middleware/auth";

export function registerSearchReindexRoutes(searchRoutes: Hono<AppBindings>): void {
searchRoutes.post('/search/reindex', requireAuth, async (c) => {
  const { ftsEnabled } = c.get('database')
  if (!ftsEnabled) throw new ApiError(503, 'internal', 'Full-text indexing is unavailable in this environment; search is using its fallback')
  const userId = c.get('userId')
  const release = await acquireLease(
    c.env.DB,
    `fts-reindex-run:${userId}`,
    15 * 60 * 1000,
    'Search indexing is already running',
  )
  try {
    try {
      await consumeAttemptBudget(c.env.DB, [{
        key: `fts-reindex:${userId}`,
        maxAttempts: 6,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      }])
    } catch (error) {
      if (error instanceof ThrottleError) {
        throw new ApiError(
          429,
          'too_many_attempts',
          `Too many search reindex requests. Try again in ${error.retryAfterSec} seconds`,
          { retryAfter: error.retryAfterSec },
        )
      }
      throw error
    }
    const count = await rebuildFtsIndex(c.env.DB, userId)
    return c.json({ ok: true, indexed: count })
  } finally {
    await release()
  }
})
}

