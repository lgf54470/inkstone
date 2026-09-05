import { Hono } from "hono";
import type { AppBindings } from "../../env";
import { isValidId, newSlug } from "../../lib/id";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { shareBatchSchema } from './schemas';
import { shareFolderToggleSchema } from './schemas';
import { shareTagToggleSchema } from './schemas';

export function registerShareBatchRoutes(shareManageRoutes: Hono<AppBindings>): void {
shareManageRoutes.post('/batch', async (c) => {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, shareBatchSchema, JSON_BODY_LIMITS.small)

  const noteIds = body.noteIds.slice(0, 1000)
  const now = Date.now()

  if (body.action === 'enable') {
    for (const noteId of noteIds) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(noteId, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(noteId, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, noteId, userId, now)
          .run()
      }
    }
  } else if (body.action === 'disable') {
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(userId, ...noteIds)
      .run()
  } else if (body.action === 'revoke') {
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `DELETE FROM shares WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(userId, ...noteIds)
      .run()
  } else if (body.action === 'expire') {
    const expiresAt =
      typeof body.expiresIn === 'number' && body.expiresIn > 0
        ? now + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
        : null
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET expires_at = ? WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(expiresAt, userId, ...noteIds)
      .run()
  } else if (body.action === 'move') {
    const targetFolderId = body.folderId && isValidId(body.folderId) ? body.folderId : null
    const placeholders = noteIds.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE shares SET folder_id = ? WHERE user_id = ? AND note_id IN (${placeholders})`,
    )
      .bind(targetFolderId, userId, ...noteIds)
      .run()
  }

  return c.json({ ok: true, count: noteIds.length })
})

shareManageRoutes.post('/batch-folder', async (c) => {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, shareFolderToggleSchema, JSON_BODY_LIMITS.small)

  const notes = await c.env.DB.prepare(
    `SELECT id FROM notes WHERE folder_id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  )
    .bind(body.folderId, userId)
    .all<{ id: string }>()

  const noteList = notes.results ?? []
  const now = Date.now()

  if (body.enabled) {
    for (const note of noteList) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(note.id, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(note.id, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, note.id, userId, now)
          .run()
      }
    }
  } else {
    if (noteList.length > 0) {
      const placeholders = noteList.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
      )
        .bind(userId, ...noteList.map((n) => n.id))
        .run()
    }
  }

  return c.json({ ok: true, count: noteList.length })
})

shareManageRoutes.post('/batch-tag', async (c) => {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, shareTagToggleSchema, JSON_BODY_LIMITS.small)

  const tagRow = await c.env.DB.prepare(
    `SELECT id FROM tags WHERE name = ?1 AND user_id = ?2`,
  )
    .bind(body.tag, userId)
    .first<{ id: string }>()

  if (!tagRow) {
    return c.json({ ok: true, count: 0 })
  }

  const notes = await c.env.DB.prepare(
    `SELECT n.id
       FROM note_tags nt
       JOIN notes n ON n.id = nt.note_id
      WHERE nt.tag_id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  )
    .bind(tagRow.id, userId)
    .all<{ id: string }>()

  const noteList = notes.results ?? []
  const now = Date.now()

  if (body.enabled) {
    for (const note of noteList) {
      const existing = await c.env.DB.prepare(
        `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(note.id, userId)
        .first<{ slug: string }>()

      if (existing) {
        await c.env.DB.prepare(
          `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
        )
          .bind(note.id, userId)
          .run()
      } else {
        const slug = newSlug()
        await c.env.DB.prepare(
          `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
        )
          .bind(slug, note.id, userId, now)
          .run()
      }
    }
  } else {
    if (noteList.length > 0) {
      const placeholders = noteList.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = 0 WHERE user_id = ? AND note_id IN (${placeholders})`,
      )
        .bind(userId, ...noteList.map((n) => n.id))
        .run()
    }
  }

  return c.json({ ok: true, count: noteList.length })
})
}

