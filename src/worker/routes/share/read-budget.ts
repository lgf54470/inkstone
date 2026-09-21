import { ApiError } from '../../lib/errors'
import { ThrottleError, consumeAttemptBudget } from '../../lib/throttle'

/**
 * The read side of the share center is not free: an unbounded analytics range is
 * summarized in eight passes over the account's whole visit history, measured at ~1.25 s
 * of CPU over 200k rows (see the SH-74 note in the ledger). A session stuck in a retry
 * loop — or a stolen session — can therefore burn the account's own quota without ever
 * writing anything, which the write-side budget on public visits never sees.
 *
 * The window is deliberately wide: opening the hub, switching ranges, paging the log and
 * toggling filters are all one request each, so a person cannot reach 120 in five minutes,
 * while a runaway loop reaches it in seconds. Expiry follows the primitive it borrows:
 * crossing the budget locks the key for a minute and answers 429 with a retry hint.
 */
const SHARE_READ_MAX_PER_WINDOW = 120
const SHARE_READ_WINDOW_MS = 5 * 60 * 1000
const SHARE_READ_LOCK_MS = 60 * 1000

export async function consumeShareReadBudget(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `share-read:${userId}`,
      maxAttempts: SHARE_READ_MAX_PER_WINDOW,
      windowMs: SHARE_READ_WINDOW_MS,
      lockMs: SHARE_READ_LOCK_MS,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many requests. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}
