import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { PublicCollection, PublicCollectionNote } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, clampInt, readOptionalJsonValidated, requestClientIp } from '../../lib/request'
import { verifyPassword } from '../../lib/password'
import { assertNotLocked, clearLoginFailures, consumeAttemptBudget, recordLoginFailure, ThrottleError } from '../../lib/throttle'
import { collectionMemberCountStatement, collectionMembersStatement, collectionTargetName, decodeCollectionCursor, nextCollectionCursor, type CollectionMemberRow } from '../../lib/share-collections'
import { resolveShareTarget, type ShareTargetType } from '@shared/share-selection'
import { rowsOf } from './read-results'

/** One page of a directory, and a ceiling on how much of an account one request can walk. */
const COLLECTION_LIMIT_DEFAULT = 50
const COLLECTION_LIMIT_MAX = 100

const accessSchema = z.object({
  password: z.string().optional(),
}).strict()

interface CollectionRow {
  id: string
  user_id: string
  target_type: string
  target_value: string
  password_hash: string | null
  expires_at: number | null
  is_enabled: number
}

/**
 * The public side of a published collection (ADR-0005). Before the password is accepted this answers
 * the directory to nobody — not the note titles, not the member count, and not the collection's own
 * title. A missing collection, a paused one and an expired one answer with the same response, because
 * whether a given address exists is not public information.
 */
export function registerShareCollectionPublicRoutes(shareRoutes: Hono<AppBindings>): void {
  shareRoutes.post('/collection/:slug', async (c) => {
    const slug = c.req.param('slug')
    if (!isValidSlug(slug)) throw ApiError.notFound('The collection does not exist or has been revoked')
    await enforceCollectionViewBudget(c, slug)
    const body = await readOptionalJsonValidated(c, accessSchema, JSON_BODY_LIMITS.small, {}) as { password?: string }
    const password = typeof body.password === 'string' ? body.password : ''
    const collection = await loadCollectionOrThrow(c.env.DB, slug)
    const denied = await authenticateCollectionAccess(c, collection, slug, password)
    if (denied) return denied
    const record = { type: collection.target_type as ShareTargetType, value: collection.target_value }
    const now = Date.now()
    const limit = clampInt(c.req.query('limit'), 1, COLLECTION_LIMIT_MAX, COLLECTION_LIMIT_DEFAULT)
    const cursor = collectionCursor(c.req.query('cursor'))
    // One lookup answers both questions: the name in the title, and the value the members have to
    // carry. A tag whose row is gone resolves to a target that matches nothing.
    const name = await collectionTargetName(c.env.DB, collection.user_id, record)
    const target = resolveShareTarget(record, name)
    const [page, count] = await Promise.all([
      collectionMembersStatement(c.env.DB, { userId: collection.user_id, target, now, cursor, limit })
        .all<CollectionMemberRow>(),
      collectionMemberCountStatement(c.env.DB, { userId: collection.user_id, target, now })
        .first<{ members: number }>(),
    ])
    const rows = rowsOf<CollectionMemberRow>(page)
    const response: PublicCollection = {
      title: name ?? '',
      count: count?.members ?? 0,
      // The marker that says "arrived from a directory" is not stored on the member: the client puts
      // `?ref=collection` on the links it renders, so the visit row keeps its own share link as the
      // smallest unit of the analytics (ADR-0004, ADR-0005 phase 3).
      notes: rows.map((row): PublicCollectionNote => ({
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        hasPassword: Boolean(row.password_hash),
      })),
      nextCursor: nextCollectionCursor(rows, limit),
      limit,
    }
    return c.json(response)
  })
}

const VIEW_SLUG_IP_BUDGET = { maxAttempts: 20, windowMs: 10 * 60 * 1000 }
const VIEW_IP_BUDGET = { maxAttempts: 60, windowMs: 10 * 60 * 1000 }

async function enforceCollectionViewBudget(c: Context<AppBindings>, slug: string): Promise<void> {
  const clientIp = requestClientIp(c)
  try {
    await consumeAttemptBudget(c.env.DB, [
      { key: `collection-view:${slug}:ip:${clientIp}`, ...VIEW_SLUG_IP_BUDGET },
      { key: `collection-view:ip:${clientIp}`, ...VIEW_IP_BUDGET },
    ])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${error.retryAfterSec} seconds`, {
        retryAfter: error.retryAfterSec,
      })
    }
    throw error
  }
}

async function loadCollectionOrThrow(db: D1Database, slug: string): Promise<CollectionRow> {
  const collection = await db.prepare(
    `SELECT id, user_id, target_type, target_value, password_hash, expires_at, is_enabled
       FROM share_collections WHERE slug = ?1`,
  ).bind(slug).first<CollectionRow>()
  // One identical answer for paused, expired and unknown: the status of a collection is not public.
  if (!collection || collection.is_enabled === 0 || (collection.expires_at && collection.expires_at < Date.now())) {
    throw ApiError.notFound('The collection does not exist or has been revoked')
  }
  return collection
}

/**
 * The collection's own password gate. It is deliberately the same shape as the per-share one — the
 * same throttle keys under a different prefix, the same body for "required" and "wrong" — because two
 * gates that answered differently would let a probe tell them apart.
 */
async function authenticateCollectionAccess(
  c: Context<AppBindings>,
  collection: CollectionRow,
  slug: string,
  password: string,
): Promise<Response | null> {
  if (!collection.password_hash) return null
  if (!password) {
    return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
  }
  const clientIp = requestClientIp(c)
  const throttleKeys = [
    `collection:${slug}:ip:${clientIp}`,
    { key: `collection-slug:${slug}`, freeFails: 10 },
  ]
  const workKeys = [
    { key: `collection-work:${slug}:ip:${clientIp}`, maxAttempts: 8, windowMs: 10 * 60 * 1000 },
    { key: `collection-work-slug:${slug}`, maxAttempts: 60, windowMs: 10 * 60 * 1000 },
  ]
  try {
    await consumeAttemptBudget(c.env.DB, workKeys)
    await assertNotLocked(c.env.DB, throttleKeys)
  } catch (err) {
    if (err instanceof ThrottleError) {
      throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${err.retryAfterSec} seconds`, {
        retryAfter: err.retryAfterSec,
      })
    }
    throw err
  }
  if (!(await verifyPassword(password, collection.password_hash))) {
    await recordLoginFailure(c.env.DB, throttleKeys)
    return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
  }
  await clearLoginFailures(c.env.DB, [...throttleKeys, ...workKeys.map((target) => target.key)])
  return null
}

/** A cursor this worker did not mint is a client bug, so it is a 400 rather than a silent first page. */
function collectionCursor(raw: string | undefined) {
  try {
    return decodeCollectionCursor(raw)
  } catch {
    throw ApiError.badRequest('The collection cursor is not valid')
  }
}
