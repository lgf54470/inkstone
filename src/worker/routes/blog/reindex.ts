import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { rebuildBlogFtsIndex } from '../../db/blog-fts'
import { ApiError } from '../../lib/errors'
import { acquireLease } from '../../lib/lease'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'

/**
 * The operator's repair path for the blog search index, shaped like the note one: one run per
 * account at a time (a lease, so a second click cannot start a second drain over the same rows), a
 * small hourly budget, and an answer of how many posts were indexed.
 */
export function registerBlogReindexRoutes(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/search/reindex', async (c) => {
    const { ftsEnabled } = c.get('database')
    if (!ftsEnabled) throw new ApiError(503, 'internal', 'Full-text indexing is unavailable in this environment; search is using its fallback')
    const userId = c.get('userId')!
    const release = await acquireLease(
      c.env.DB,
      `blog-fts-reindex-run:${userId}`,
      15 * 60 * 1000,
      'Blog search indexing is already running',
    )
    try {
      await enforceBlogReindexBudget(c.env.DB, userId)
      const count = await rebuildBlogFtsIndex(c.env.DB, userId)
      return c.json({ ok: true, indexed: count })
    } finally {
      await release()
    }
  })
}

async function enforceBlogReindexBudget(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `blog-fts-reindex:${userId}`,
      maxAttempts: 6,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many blog search reindex requests. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }
}
