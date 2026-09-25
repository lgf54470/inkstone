import type { Context } from 'hono'
import type { ApiErrorCode } from '@shared/types'

/**
 * Worker-side ApiError (producer of the HTTP boundary). Deliberately mirrors
 * the client's ApiError (src/client/lib/api.ts) without sharing the class:
 * the two layers must stay import-decoupled, and the worker adds static
 * factories and a strict status union the client does not need.
 */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 502 | 503,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details)
  }
  static unauthenticated(message = 'Please sign in first') {
    return new ApiError(401, 'unauthenticated', message)
  }
  static forbidden(message = 'Permission denied') {
    return new ApiError(403, 'forbidden', message)
  }
  static notFound(message = 'Content not found', details?: unknown) {
    return new ApiError(404, 'not_found', message, details)
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'conflict', message, details)
  }
  static tooLarge(message: string) {
    return new ApiError(413, 'payload_too_large', message)
  }
  /** The file itself is bigger than this deployment accepts, whatever the request size was. */
  static mediaTooLarge(message: string) {
    return new ApiError(413, 'media_too_large', message)
  }
  /** The library, or the upstream host behind it, is out of space rather than out of payload room. */
  static storageQuotaReached(message: string) {
    return new ApiError(413, 'storage_quota_reached', message)
  }
  /** A 409 that is not a stale write: the name is simply taken. */
  static playlistFull() {
    return new ApiError(413, 'playlist_full', 'This playlist is full')
  }
  static tagNameTaken() {
    return new ApiError(409, 'tag_name_taken', 'A tag with this name already exists')
  }
  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, 'too_many_attempts', message)
  }
  static internal(message = 'Internal server error') {
    return new ApiError(500, 'internal', message)
  }
}

/**
 * The message alone for a `console.warn` line: a raw error object can carry driver internals
 * (statement shape, binding values) that belong to the account, not to observability output.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      err.status,
    )
  }
  console.error('[inkstone] Unhandled error:', err)

  return c.json({ error: { code: 'internal', message: 'Internal server error' } }, 500)
}
