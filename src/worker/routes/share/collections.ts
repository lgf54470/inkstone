import { Hono } from 'hono'
import { z } from 'zod'
import type { ShareCollection } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { isValidId, newId, newSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { hashPassword } from '../../lib/password'
import { LIMITS } from '@shared/constants'
import {
  collectionMemberCountStatement,
  collectionTargetName,
  collectionTargetNameJoin,
  collectionTargetNameSelect,
  isValidTargetValue,
} from '../../lib/share-collections'
import { isShareTargetType, resolveShareTarget, type ShareTargetType } from '@shared/share-selection'
import { firstOf, rowsOf } from './read-results'

/**
 * The owner's side of a published collection (ADR-0005). Publishing writes one record and derives
 * nothing; revoking deletes that record and leaves every member's own share exactly as it was, which
 * is why the confirm copy has to say so rather than the documentation.
 */
export function registerShareCollectionRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerCollectionListRoute(shareManageRoutes)
  registerCollectionPublishRoute(shareManageRoutes)
  registerCollectionUpdateRoute(shareManageRoutes)
  registerCollectionRevokeRoute(shareManageRoutes)
}

/** The ceiling keeps the batched live counts — one statement per collection — from growing with abuse. */
const MAX_COLLECTIONS_PER_ACCOUNT = 20

interface CollectionRow {
  id: string
  slug: string
  target_type: string
  target_value: string
  password_hash: string | null
  expires_at: number | null
  is_enabled: number
  created_at: number
  target_name: string | null
}

function registerCollectionListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/collections', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const now = Date.now()
    const rows = rowsOf<CollectionRow>(await db.prepare(
      `SELECT c.id, c.slug, c.target_type, c.target_value, c.password_hash, c.expires_at, c.is_enabled, c.created_at,
              ${collectionTargetNameSelect()} AS target_name
         FROM share_collections c ${collectionTargetNameJoin()}
        WHERE c.user_id = ?1 ORDER BY c.created_at DESC, c.id DESC`,
    ).bind(userId).all<CollectionRow>())
    // The count is read now, not stored: a folder collection whose folder gained a share a second
    // ago reports the new number, because the number and the page both come from the same predicate.
    // Each collection keeps its own count statement (the shared member rule), and the batch keeps
    // them at one round trip instead of two flights per collection.
    const counts = rows.length
      ? await db.batch(rows.map((row) => collectionMemberCountStatement(db, {
          userId,
          target: resolveShareTarget({ type: row.target_type as ShareTargetType, value: row.target_value }, row.target_name),
          now,
        })))
      : []
    const collections = rows.map((row, index) => toShareCollection(row, firstOf<{ members: number }>(counts[index])))
    return c.json({ collections })
  })
}

function toShareCollection(row: CollectionRow, count: { members: number } | null): ShareCollection {
  const record = { type: row.target_type as ShareTargetType, value: row.target_value }
  return {
    id: row.id,
    slug: row.slug,
    title: row.target_name ?? '',
    targetType: record.type,
    targetValue: record.value,
    count: count?.members ?? 0,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
  }
}

const publishSchema = z.object({
  targetType: z.enum(['folder', 'tag']),
  targetValue: z.string().min(1).max(200),
  password: z.string().max(LIMITS.passwordMaxLength).optional(),
  expiresAt: z.number().int().positive().nullable().optional(),
}).strict()

/**
 * A paused collection can be resumed and a live one paused; nothing else is patched here. The
 * password and the end date are part of what "published" means, so they are re-stated through the
 * publish route — one write path for the policy rather than two that could disagree about whether a
 * password-less update means "leave it" or "remove it".
 */
const updateSchema = z.object({
  isEnabled: z.boolean(),
}).strict()

function registerCollectionPublishRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/collections', async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, publishSchema, JSON_BODY_LIMITS.small)
    if (!isShareTargetType(body.targetType) || !isValidTargetValue(body.targetValue)) {
      throw ApiError.badRequest('The collection target is not valid')
    }
    const target = { type: body.targetType, value: body.targetValue }
    if ((await collectionTargetName(c.env.DB, userId, target)) === null) {
      throw ApiError.notFound('The folder or tag does not exist')
    }
    const now = Date.now()
    // The name is read before the record is written, so a collection can never address a folder the
    // account does not own — the same check that would otherwise be a lookup the page has to repeat.
    const existing = await c.env.DB.prepare(
      `SELECT id, slug FROM share_collections
        WHERE user_id = ?1 AND target_type = ?2 AND target_value = ?3 AND is_enabled = 1`,
    ).bind(userId, target.type, target.value).first<{ id: string; slug: string }>()
    const passwordHash = body.password ? await hashPassword(body.password) : null
    if (existing) {
      // Re-publishing an already published folder is a re-statement of its policy, not a second page:
      // two live addresses for one folder would mean two passwords to remember and two links to revoke.
      await c.env.DB.prepare(
        `UPDATE share_collections
            SET password_hash = ?1, expires_at = ?2, updated_at = ?3
          WHERE id = ?4 AND user_id = ?5`,
      ).bind(passwordHash, body.expiresAt ?? null, now, existing.id, userId).run()
      return c.json({ id: existing.id, slug: existing.slug })
    }
    const live = await c.env.DB.prepare(
      `SELECT COUNT(*) AS live FROM share_collections WHERE user_id = ?1 AND is_enabled = 1`,
    ).bind(userId).first<{ live: number }>()
    if ((live?.live ?? 0) >= MAX_COLLECTIONS_PER_ACCOUNT) {
      throw ApiError.badRequest(`An account can publish at most ${MAX_COLLECTIONS_PER_ACCOUNT} collections`)
    }
    const id = newId()
    const slug = newSlug()
    await c.env.DB.prepare(
      `INSERT INTO share_collections
         (id, slug, user_id, target_type, target_value, password_hash, expires_at, is_enabled, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)`,
    ).bind(id, slug, userId, target.type, target.value, passwordHash, body.expiresAt ?? null, now).run()
    return c.json({ id, slug })
  })
}

function registerCollectionUpdateRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.patch('/collections/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!isValidId(id)) throw ApiError.notFound('The collection does not exist')
    const body = await readJsonValidated(c, updateSchema, JSON_BODY_LIMITS.small)
    const row = await c.env.DB.prepare(
      `SELECT id, is_enabled FROM share_collections WHERE id = ?1 AND user_id = ?2`,
    ).bind(id, userId).first<{ id: string; is_enabled: number }>()
    if (!row) throw ApiError.notFound('The collection does not exist')
    const nextEnabled = body.isEnabled ? 1 : 0
    if (nextEnabled === 1 && row.is_enabled === 0) {
      // Resuming is not always possible: the target may have been published again while this record
      // was paused, and two live records for one folder is exactly what the partial unique index
      // forbids. Answering 400 names the conflict instead of failing on a constraint.
      const conflict = await c.env.DB.prepare(
        `SELECT id FROM share_collections
          WHERE user_id = ?1 AND is_enabled = 1 AND id <> ?2
            AND (target_type, target_value) = (SELECT target_type, target_value FROM share_collections WHERE id = ?2)`,
      ).bind(userId, id).first<{ id: string }>()
      if (conflict) throw ApiError.badRequest('This folder or tag already has a published collection')
    }
    await c.env.DB.prepare(
      `UPDATE share_collections SET is_enabled = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4`,
    ).bind(nextEnabled, Date.now(), id, userId).run()
    return c.json({ ok: true })
  })
}

function registerCollectionRevokeRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.delete('/collections/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!isValidId(id)) throw ApiError.notFound('The collection does not exist')
    // Revoking removes the record and nothing else: the shares it listed keep their own links, their
    // own passwords and their own visit history.
    await c.env.DB.prepare(`DELETE FROM share_collections WHERE id = ?1 AND user_id = ?2`).bind(id, userId).run()
    return c.json({ ok: true })
  })
}
