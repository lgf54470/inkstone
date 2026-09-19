import { LIMITS } from '@shared/constants'
import { ApiError } from '../../lib/errors'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'

const HOUR_MS = 60 * 60 * 1000

export type MusicBudgetFamily = 'webdav' | 'play' | 'write' | 'lookup' | 'lyric'

// Each family that can trigger outbound requests or storage work gets one
// named hourly key, so no music route can be looped into unbounded load.
const BUDGETS: Record<MusicBudgetFamily, { maxAttempts: number; message: string }> = {
  webdav: { maxAttempts: LIMITS.musicWebdavRequestsPerHour, message: 'Too many WebDAV requests' },
  play: { maxAttempts: LIMITS.musicPlayEventsPerHour, message: 'Too many play events' },
  write: { maxAttempts: LIMITS.musicLibraryWritesPerHour, message: 'Too many library writes' },
  lookup: { maxAttempts: LIMITS.musicCoverLookupsPerHour, message: 'Too many cover lookups' },
  lyric: { maxAttempts: LIMITS.musicLyricLookupsPerHour, message: 'Too many lyric lookups' },
}

export async function enforceMusicBudget(db: D1Database, family: MusicBudgetFamily, userId: string): Promise<void> {
  const budget = BUDGETS[family]
  try {
    await consumeAttemptBudget(db, [{
      key: `music-${family}:${userId}`,
      maxAttempts: budget.maxAttempts,
      windowMs: HOUR_MS,
      lockMs: HOUR_MS,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `${budget.message}. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}
