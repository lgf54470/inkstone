import { LIMITS } from '@shared/constants'
import { ApiError } from '../../lib/errors'
import { consumeAttemptBudget, ThrottleError } from '../../lib/throttle'

const HOUR_MS = 60 * 60 * 1000

export type MusicBudgetFamily = 'webdav' | 'play' | 'write' | 'playback' | 'lookup' | 'lyric'

// Each family that can trigger outbound requests or storage work gets one
// named hourly key, so no music route can be looped into unbounded load.
const BUDGETS: Record<MusicBudgetFamily, { maxAttempts: number; message: string }> = {
  webdav: { maxAttempts: LIMITS.musicWebdavRequestsPerHour, message: 'Too many WebDAV requests' },
  play: { maxAttempts: LIMITS.musicPlayEventsPerHour, message: 'Too many play events' },
  write: { maxAttempts: LIMITS.musicLibraryWritesPerHour, message: 'Too many library writes' },
  playback: { maxAttempts: LIMITS.musicPlaybackSavesPerHour, message: 'Too many playback saves' },
  lookup: { maxAttempts: LIMITS.musicCoverLookupsPerHour, message: 'Too many cover lookups' },
  lyric: { maxAttempts: LIMITS.musicLyricLookupsPerHour, message: 'Too many lyric lookups' },
}

interface MusicBudget {
  maxAttempts: number
  message: string
}

export type MusicPublicBudgetFamily = 'library' | 'stream' | 'cover'

// A published library has no account to charge, so the public surfaces are metered by client IP
// instead. Each family keeps its own key: loading a page of album art must not spend the same
// allowance that streaming a track draws on. The cap is deliberately per visitor rather than
// per owner — one scraper must not be able to exhaust a budget every listener shares.
export const MUSIC_PUBLIC_BUDGETS: Record<MusicPublicBudgetFamily, MusicBudget> = {
  library: { maxAttempts: LIMITS.musicPublicLibraryPerHour, message: 'Too many public library requests' },
  stream: { maxAttempts: LIMITS.musicPublicStreamsPerHour, message: 'Too many public stream requests' },
  cover: { maxAttempts: LIMITS.musicPublicCoversPerHour, message: 'Too many public cover requests' },
}

export async function enforceMusicBudget(db: D1Database, family: MusicBudgetFamily, userId: string): Promise<void> {
  await consumeMusicBudget(db, `music-${family}:${userId}`, BUDGETS[family])
}

export async function enforceMusicPublicBudget(
  db: D1Database,
  family: MusicPublicBudgetFamily,
  clientIp: string,
): Promise<void> {
  await consumeMusicBudget(db, `music-public-${family}:ip:${clientIp}`, MUSIC_PUBLIC_BUDGETS[family])
}

async function consumeMusicBudget(db: D1Database, key: string, budget: MusicBudget): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key,
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
