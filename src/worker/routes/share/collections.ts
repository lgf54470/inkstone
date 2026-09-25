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
  isCollectionMemberSort,
  isValidTargetValue,
  type CollectionMemberSort,
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
  member_sort: string | null
  title: string | null
  created_at: number
  target_name: string | null
}

function registerCollectionListRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/collections', async (c) => {
    const db = c.env.DB
    const userId = c.get('userId')
    const now = Date.now()
    const rows = rowsOf<CollectionRow>(await db.prepare(
      `SELECT c.id, c.slug, c.target_type, c.target_value, c.password_hash, c.expires_at, c.is_enabled, c.member_sort, c.title, c.created_at,
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
    // A folder/tag collection is named by its target at read time; a hand-picked one by its own
    // stored title.
    title: row.target_name ?? row.title ?? '',
    targetType: record.type,
    targetValue: record.value,
    count: count?.members ?? 0,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    isEnabled: row.is_enabled === 1,
    memberSort: isCollectionMemberSort(row.member_sort) ? row.member_sort : null,
    createdAt: row.created_at,
  }
}

const MANUAL_MEMBER_LIMIT = 200

const publishSchema = z.object({
  targetType: z.enum(['folder', 'tag', 'manual']),
  targetValue: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  noteIds: z.array(z.string()).min(1).max(MANUAL_MEMBER_LIMIT).optional(),
  password: z.string().max(LIMITS.passwordMaxLength).optional(),
  expiresAt: z.number().int().positive().nullable().optional(),
  memberSort: z.enum(['default', 'newest', 'oldest', 'title']).nullable().optional(),
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
    if (body.targetType === 'manual') return publishManualCollection(c.env.DB, userId, body)
    if (!isShareTargetType(body.targetType) || !isValidTargetValue(body.targetValue)) {
      throw ApiError.badRequest('The collection target is not valid')
    }
    const target = { type: body.targetType, value: body.targetValue! }
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
    const memberSort: CollectionMemberSort | null =
      body.memberSort && isCollectionMemberSort(body.memberSort) ? body.memberSort : null
    if (existing) {
      // Re-publishing an already published folder is a re-statement of its policy, not a second page:
      // two live addresses for one folder would mean two passwords to remember and two links to revoke.
      await c.env.DB.prepare(
        `UPDATE share_collections
            SET password_hash = ?1, expires_at = ?2, member_sort = ?3, updated_at = ?4
          WHERE id = ?5 AND user_id = ?6`,
      ).bind(passwordHash, body.expiresAt ?? null, memberSort, now, existing.id, userId).run()
      return c.json({ id: existing.id, slug: existing.slug })
    }
    await countLiveCollections(c.env.DB, userId)
    const id = newId()
    const slug = newSlug()
    await c.env.DB.prepare(
      `INSERT INTO share_collections
         (id, slug, user_id, target_type, target_value, password_hash, expires_at, is_enabled, member_sort, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?9)`,
    ).bind(id, slug, userId, target.type, target.value, passwordHash, body.expiresAt ?? null, memberSort, now).run()
    return c.json({ id, slug })
  })
}

/**
 * A hand-picked collection (audit #14): the owner names it and chooses the notes; membership is
 * stored, visibility is still derived. Its address is minted here and stored as the target value —
 * one address per collection, never one per folder — and re-publishing the same slug re-states the
 * policy and the member list together.
 */
async function publishManualCollection(
  db: D1Database,
  userId: string,
  body: z.infer<typeof publishSchema>,
): Promise<Response> {
  const title = (body.title ?? '').trim()
  const noteIds = [...new Set(body.noteIds ?? [])]
  if (!title || noteIds.length === 0) {
    throw ApiError.badRequest('A hand-picked collection needs a title and at least one note')
  }
  if ((body.noteIds ?? []).length > MANUAL_MEMBER_LIMIT) {
    throw ApiError.badRequest(`A hand-picked collection can hold at most ${MANUAL_MEMBER_LIMIT} notes`)
  }
  await countLiveCollections(db, userId)
  const now = Date.now()
  const passwordHash = body.password ? await hashPassword(body.password) : null
  const id = newId()
  const slug = newSlug()
  await db.batch([
    db.prepare(
      `INSERT INTO share_collections
         (id, slug, user_id, target_type, target_value, title, password_hash, expires_at, is_enabled, member_sort, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'manual', ?2, ?4, ?5, ?6, 1, NULL, ?7, ?7)`,
    ).bind(id, slug, userId, title, passwordHash, body.expiresAt ?? null, now),
    // One replace: re-publishing the same address re-states the member list, so the stored order
    // always mirrors the request that last succeeded.
    ...memberReplaceStatements(db, id, noteIds),
  ])
  return Response.json({ id, slug })
}

function memberReplaceStatements(db: D1Database, collectionId: string, noteIds: string[]): D1PreparedStatement[] {
  return [
    db.prepare(`DELETE FROM share_collection_members WHERE collection_id = ?1`).bind(collectionId),
    ...noteIds.map((noteId, index) => db.prepare(
      `INSERT INTO share_collection_members (collection_id, note_id, sort_order) VALUES (?1, ?2, ?3)`,
    ).bind(collectionId, noteId, index)),
  ]
}

async function countLiveCollections(db: D1Database, userId: string): Promise<number> {
  const live = await db.prepare(
    `SELECT COUNT(*) AS live FROM share_collections WHERE user_id = ?1 AND is_enabled = 1`,
  ).bind(userId).first<{ live: number }>()
  if ((live?.live ?? 0) >= MAX_COLLECTIONS_PER_ACCOUNT) {
    throw ApiError.badRequest(`An account can publish at most ${MAX_COLLECTIONS_PER_ACCOUNT} collections`)
  }
  return live?.live ?? 0
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
    // own passwords and their own visit history. A hand-picked collection's member rows are part of
    // the record, so they go with it — both deletes guarded by the owner bind.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM share_collection_members WHERE collection_id IN
           (SELECT id FROM share_collections WHERE id = ?1 AND user_id = ?2)`,
      ).bind(id, userId),
      c.env.DB.prepare(`DELETE FROM share_collections WHERE id = ?1 AND user_id = ?2`).bind(id, userId),
    ])
    return c.json({ ok: true })
  })
}
