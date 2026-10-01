import { ApiError } from '../../lib/errors'
import { ThrottleError, consumeAttemptBudget } from '../../lib/throttle'

/**
 * The graph read can be the heaviest read an account makes: a global page aggregates the degrees of a
 * whole library in one pass over `links` before a single node is drawn, and every filter change, mode
 * switch and debounced search asks for it again. A session stuck in a retry loop — or a stolen one —
 * can therefore burn the account's own read quota without ever writing anything, which the write-side
 * budgets never see.
 *
 * The window follows the share center's read budget: wide enough that a person browsing the graph
 * (open, toggle, search, switch modes) cannot reach 120 in five minutes, narrow enough that a runaway
 * loop reaches it in seconds. Expiry follows the primitive it borrows: crossing the budget locks the
 * key for a minute and answers 429 with a retry hint.
 */
const GRAPH_READ_MAX_PER_WINDOW = 120
const GRAPH_READ_WINDOW_MS = 5 * 60 * 1000
const GRAPH_READ_LOCK_MS = 60 * 1000

export async function consumeGraphReadBudget(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `graph-read:${userId}`,
      maxAttempts: GRAPH_READ_MAX_PER_WINDOW,
      windowMs: GRAPH_READ_WINDOW_MS,
      lockMs: GRAPH_READ_LOCK_MS,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many graph requests. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}
