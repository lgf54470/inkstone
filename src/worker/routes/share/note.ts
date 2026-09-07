import { Hono } from 'hono';
import { LIMITS } from '@shared/constants';
import type { AppBindings } from '../../env';
import { ApiError } from '../../lib/errors';
import { isValidId, newSlug } from '../../lib/id';
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request';
import { hashPassword } from '../../lib/password';
import { isValidCustomSlug } from '../../lib/share-analytics';
import { shareCreateSchema } from './schemas';
import { ShareRow, toShareInfo } from './shares';

export function registerShareNoteRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareNoteGetRoute(shareManageRoutes)
  registerShareNoteUpsertRoute(shareManageRoutes)
  registerShareNoteDeleteRoute(shareManageRoutes)
}

function registerShareNoteGetRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/:noteId', async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT s.*, n.title as note_title, n.folder_id
         FROM shares s
         JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
        WHERE s.note_id = ?1 AND s.user_id = ?2 AND n.deleted_at IS NULL`,
    )
      .bind(c.req.param('noteId'), c.get('userId'))
      .first<ShareRow & { note_title: string; folder_id: string | null }>()
    if (!row) return c.json({ share: null })
    const uniqueVisitors = await loadUniqueVisitors(c.env.DB, row.note_id)
    return c.json({
      share: toShareInfo(row, new URL(c.req.url).origin, {
        noteTitle: row.note_title,
        folderId: row.folder_id,
        uniqueVisitors,
      }),
    })
  })
}

function registerShareNoteUpsertRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/:noteId', async (c) => {
    const userId = c.get('userId')
    const noteId = c.req.param('noteId')
    const body = await readJsonValidated(c, shareCreateSchema, JSON_BODY_LIMITS.small)
    const note = await loadNoteForShare(c.env.DB, userId, noteId)
    if (!note) throw ApiError.notFound('Note not found')
    const existingShare = await c.env.DB.prepare(
      `SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`,
    )
      .bind(noteId, userId)
      .first<ShareRow>()
    const targetSlug = await resolveShareSlug(c.env.DB, noteId, body.customSlug, existingShare?.slug)
    validateShareAccessOptions(body)
    const fields = await computeShareFields(body, existingShare)
    await upsertShareRow(c.env.DB, userId, noteId, existingShare, targetSlug, fields)
    const row = await c.env.DB.prepare(`SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`)
      .bind(noteId, userId)
      .first<ShareRow>()
    const uniqueVisitors = await loadUniqueVisitors(c.env.DB, noteId)
    return c.json({
      share: toShareInfo(row!, new URL(c.req.url).origin, {
        noteTitle: note.title,
        folderId: row?.folder_id,
        uniqueVisitors,
        isPinned: note.is_pinned === 1,
        isStarred: note.is_starred === 1,
      }),
    })
  })
}

function registerShareNoteDeleteRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.delete('/:noteId', async (c) => {
    await c.env.DB.prepare(`DELETE FROM shares WHERE note_id = ?1 AND user_id = ?2`)
      .bind(c.req.param('noteId'), c.get('userId'))
      .run()
    return c.json({ ok: true })
  })
}

async function loadUniqueVisitors(db: D1Database, noteId: string): Promise<number> {
  const uvRow = await db.prepare(
    `SELECT COUNT(DISTINCT visitor_fp) as uvs FROM share_visits WHERE note_id = ?1`,
  )
    .bind(noteId)
    .first<{ uvs: number }>()
  return uvRow?.uvs ?? 0
}

async function loadNoteForShare(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<{ id: string; title: string; folder_id: string | null; is_pinned: number; is_starred: number } | null> {
  return db.prepare(
    `SELECT id, title, folder_id, is_pinned, is_starred FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<{ id: string; title: string; folder_id: string | null; is_pinned: number; is_starred: number }>()
}

async function resolveShareSlug(
  db: D1Database,
  noteId: string,
  customSlug: string | undefined,
  existingSlug: string | undefined,
): Promise<string> {
  let targetSlug = existingSlug ?? newSlug()
  if (customSlug === undefined) return targetSlug
  const custom = customSlug.trim()
  if (!custom) return targetSlug
  if (!isValidCustomSlug(custom)) {
    throw ApiError.badRequest('Custom slug can only contain letters, numbers, hyphens, and underscores (3-64 chars)')
  }
  const collision = await db.prepare(
    `SELECT note_id FROM shares WHERE slug = ?1 AND note_id != ?2`,
  )
    .bind(custom, noteId)
    .first<{ note_id: string }>()
  if (collision) {
    throw ApiError.conflict('This custom link is already in use by another share')
  }
  return custom
}

function validateShareAccessOptions(body: {
  password?: string | null
  expiresIn?: number | null
}): void {
  if (typeof body.password === 'string' && body.password.length > LIMITS.passwordMaxLength) {
    throw ApiError.badRequest(`The access password must not exceed ${LIMITS.passwordMaxLength} characters`)
  }
  if (typeof body.password === 'string' && body.password.length > 0 && body.password.length < 4) {
    throw ApiError.badRequest('The access password must be at least 4 characters')
  }
  if (typeof body.expiresIn === 'number' && (!Number.isFinite(body.expiresIn) || body.expiresIn < 0)) {
    throw ApiError.badRequest('expiresIn must be a non-negative number or null')
  }
}

async function computeShareFields(
  body: {
    password?: string | null
    expiresIn?: number | null
    isEnabled?: boolean
    folderId?: string | null
    tags?: string[] | null
  },
  existingShare: ShareRow | undefined | null,
): Promise<{ passwordHash: string | null; expiresAt: number | null; isEnabled: number; folderId: string | null; tagsJson: string }> {
  const expiresAt =
    typeof body.expiresIn === 'number' && body.expiresIn > 0
      ? Date.now() + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
      : body.expiresIn === 0
        ? null
        : existingShare?.expires_at ?? null
  const passwordHash =
    body.password === null
      ? null
      : typeof body.password === 'string' && body.password
        ? await hashPassword(body.password)
        : existingShare?.password_hash ?? null
  const isEnabled = body.isEnabled !== undefined ? (body.isEnabled ? 1 : 0) : (existingShare?.is_enabled ?? 1)
  const folderId = body.folderId !== undefined ? (body.folderId && isValidId(body.folderId) ? body.folderId : null) : (existingShare?.folder_id ?? null)
  const tagsJson = body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : (existingShare?.tags ?? '[]')
  return { passwordHash, expiresAt, isEnabled, folderId, tagsJson }
}

async function upsertShareRow(
  db: D1Database,
  userId: string,
  noteId: string,
  existingShare: ShareRow | undefined | null,
  targetSlug: string,
  fields: { passwordHash: string | null; expiresAt: number | null; isEnabled: number; folderId: string | null; tagsJson: string },
): Promise<void> {
  if (existingShare) {
    await db.prepare(
      `UPDATE shares
          SET slug = ?1,
              password_hash = ?2,
              expires_at = ?3,
              is_enabled = ?4,
              folder_id = ?5,
              tags = ?6
        WHERE note_id = ?7 AND user_id = ?8`,
    )
      .bind(targetSlug, fields.passwordHash, fields.expiresAt, fields.isEnabled, fields.folderId, fields.tagsJson, noteId, userId)
      .run()
  } else {
    await db.prepare(
      `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, folder_id, tags, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9)`,
    )
      .bind(targetSlug, noteId, userId, fields.passwordHash, fields.expiresAt, fields.isEnabled, fields.folderId, fields.tagsJson, Date.now())
      .run()
  }
}
