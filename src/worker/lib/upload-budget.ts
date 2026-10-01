import { LIMITS } from '@shared/constants'
import { ApiError } from './errors'
import { consumeAttemptBudget, ThrottleError } from './throttle'

/**
 * The hourly attachment upload budget. The attachment library, the MCP library and the blog's
 * media library all write into the same attachments table and the same object storage, so they
 * must not hand out a budget of their own: a caller that has run out in one place has run out in
 * all of them, and one path cannot be used to get around another's ceiling.
 */
export async function enforceAttachmentUploadBudget(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `attachment-upload:${userId}`,
      maxAttempts: LIMITS.attachmentUploadsPerHour,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many uploads. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }
}
