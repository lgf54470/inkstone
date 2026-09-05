import { Hono } from "hono";
import { LIMITS } from "@shared/constants";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { isValidId, newSlug } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { hashPassword } from "../../lib/password";
import { isValidCustomSlug } from "../../lib/share-analytics";
import { shareCreateSchema } from './schemas';
import { ShareRow } from "./shares";
import { toShareInfo } from "./shares";

export function registerShareNoteRoutes(shareManageRoutes: Hono<AppBindings>): void {
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

  const uvRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT visitor_fp) as uvs FROM share_visits WHERE note_id = ?1`,
  )
    .bind(row.note_id)
    .first<{ uvs: number }>()

  return c.json({
    share: toShareInfo(row, new URL(c.req.url).origin, {
      noteTitle: row.note_title,
      folderId: row.folder_id,
      uniqueVisitors: uvRow?.uvs ?? 0,
    }),
  })
})

shareManageRoutes.post('/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
  const body = await readJsonValidated(c, shareCreateSchema, JSON_BODY_LIMITS.small)

  const note = await c.env.DB.prepare(
    `SELECT id, title, folder_id, is_pinned, is_starred FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(noteId, userId)
    .first<{ id: string; title: string; folder_id: string | null; is_pinned: number; is_starred: number }>()
  if (!note) throw ApiError.notFound('Note not found')

  const existingShare = await c.env.DB.prepare(
    `SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`,
  )
    .bind(noteId, userId)
    .first<ShareRow>()

  let targetSlug = existingShare ? existingShare.slug : newSlug()

  if (body.customSlug !== undefined) {
    const custom = body.customSlug.trim()
    if (custom) {
      if (!isValidCustomSlug(custom)) {
        throw ApiError.badRequest('Custom slug can only contain letters, numbers, hyphens, and underscores (3-64 chars)')
      }
      const collision = await c.env.DB.prepare(
        `SELECT note_id FROM shares WHERE slug = ?1 AND note_id != ?2`,
      )
        .bind(custom, noteId)
        .first<{ note_id: string }>()

      if (collision) {
        throw ApiError.conflict('This custom link is already in use by another share')
      }
      targetSlug = custom
    }
  }

  if (body.password !== undefined && body.password !== null && typeof body.password !== 'string') {
    throw ApiError.badRequest('password must be a string or null')
  }
  if (typeof body.password === 'string' && body.password.length > LIMITS.passwordMaxLength) {
    throw ApiError.badRequest(`The access password must not exceed ${LIMITS.passwordMaxLength} characters`)
  }
  if (typeof body.password === 'string' && body.password.length > 0 && body.password.length < 4) {
    throw ApiError.badRequest('The access password must be at least 4 characters')
  }
  if (
    body.expiresIn !== undefined &&
    body.expiresIn !== null &&
    (!Number.isFinite(body.expiresIn) || body.expiresIn < 0)
  ) {
    throw ApiError.badRequest('expiresIn must be a non-negative number or null')
  }

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

  if (existingShare) {
    await c.env.DB.prepare(
      `UPDATE shares
          SET slug = ?1,
              password_hash = ?2,
              expires_at = ?3,
              is_enabled = ?4,
              folder_id = ?5,
              tags = ?6
        WHERE note_id = ?7 AND user_id = ?8`,
    )
      .bind(targetSlug, passwordHash, expiresAt, isEnabled, folderId, tagsJson, noteId, userId)
      .run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, folder_id, tags, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9)`,
    )
      .bind(targetSlug, noteId, userId, passwordHash, expiresAt, isEnabled, folderId, tagsJson, Date.now())
      .run()
  }

  const row = await c.env.DB.prepare(`SELECT * FROM shares WHERE note_id = ?1 AND user_id = ?2`)
    .bind(noteId, userId)
    .first<ShareRow>()

  const uvRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT visitor_fp) as uvs FROM share_visits WHERE note_id = ?1`,
  )
    .bind(noteId)
    .first<{ uvs: number }>()

  return c.json({
    share: toShareInfo(row!, new URL(c.req.url).origin, {
      noteTitle: note.title,
      folderId: row?.folder_id,
      uniqueVisitors: uvRow?.uvs ?? 0,
      isPinned: note.is_pinned === 1,
      isStarred: note.is_starred === 1,
    }),
  })
})

shareManageRoutes.delete('/:noteId', async (c) => {
  const noteId = c.req.param('noteId')
  const userId = c.get('userId')
  await c.env.DB.prepare(`DELETE FROM shares WHERE note_id = ?1 AND user_id = ?2`)
    .bind(noteId, userId)
    .run()
  return c.json({ ok: true })
})
}

