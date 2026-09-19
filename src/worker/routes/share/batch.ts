import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { isValidId, newSlug } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { shareBatchSchema, shareFolderToggleSchema, shareTagToggleSchema } from './schemas'

export function registerShareBatchRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareBatchRoute(shareManageRoutes)
  registerShareFolderToggleRoute(shareManageRoutes)
  registerShareTagToggleRoute(shareManageRoutes)
}

function registerShareBatchRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/batch', async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, shareBatchSchema, JSON_BODY_LIMITS.small)
    const noteIds = body.noteIds.slice(0, 1000)
    const now = Date.now()

    switch (body.action) {
      case 'enable':
        await enableNoteShares(c.env.DB, userId, noteIds, now)
        break
      case 'disable':
        await disableSharesForNotes(c.env.DB, userId, noteIds)
        break
      case 'revoke':
        await revokeSharesForNotes(c.env.DB, userId, noteIds)
        break
      case 'expire': {
        const expiresAt =
          typeof body.expiresIn === 'number' && body.expiresIn > 0
            ? now + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
            : null
        await setSharesField(c.env.DB, userId, noteIds, 'expires_at', expiresAt)
        break
      }
      case 'move': {
        const targetFolderId = body.folderId && isValidId(body.folderId) ? body.folderId : null
        await setSharesField(c.env.DB, userId, noteIds, 'folder_id', targetFolderId)
        break
      }
    }
    return c.json({ ok: true, count: noteIds.length })
  })
}

function registerShareFolderToggleRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/batch-folder', async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, shareFolderToggleSchema, JSON_BODY_LIMITS.small)
    const notes = await c.env.DB.prepare(
      `SELECT id FROM notes WHERE folder_id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
    )
      .bind(body.folderId, userId)
      .all<{ id: string }>()
    const noteList = notes.results ?? []
    if (body.enabled) {
      await enableNoteShares(c.env.DB, userId, noteList.map((n) => n.id), Date.now())
    } else if (noteList.length > 0) {
      await disableSharesForNotes(c.env.DB, userId, noteList.map((n) => n.id))
    }
    return c.json({ ok: true, count: noteList.length })
  })
}

function registerShareTagToggleRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/batch-tag', async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, shareTagToggleSchema, JSON_BODY_LIMITS.small)
    const tagRow = await c.env.DB.prepare(
      `SELECT id FROM tags WHERE name = ?1 AND user_id = ?2`,
    )
      .bind(body.tag, userId)
      .first<{ id: string }>()
    if (!tagRow) return c.json({ ok: true, count: 0 })
    const notes = await c.env.DB.prepare(
      `SELECT n.id
         FROM note_tags nt
         JOIN notes n ON n.id = nt.note_id
        WHERE nt.tag_id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
    )
      .bind(tagRow.id, userId)
      .all<{ id: string }>()
    const noteList = notes.results ?? []
    if (body.enabled) {
      await enableNoteShares(c.env.DB, userId, noteList.map((n) => n.id), Date.now())
    } else if (noteList.length > 0) {
      await disableSharesForNotes(c.env.DB, userId, noteList.map((n) => n.id))
    }
    return c.json({ ok: true, count: noteList.length })
  })
}

async function enableNoteShares(db: D1Database, userId: string, noteIds: string[], now: number): Promise<void> {
  for (const noteId of noteIds) {
    const existing = await db.prepare(
      `SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2`,
    )
      .bind(noteId, userId)
      .first<{ slug: string }>()
    if (existing) {
      await db.prepare(
        `UPDATE shares SET is_enabled = 1 WHERE note_id = ?1 AND user_id = ?2`,
      )
        .bind(noteId, userId)
        .run()
    } else {
      await db.prepare(
        `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
         VALUES (?1, ?2, ?3, NULL, NULL, 0, 1, ?4)`,
      )
        .bind(newSlug(), noteId, userId, now)
        .run()
    }
  }
}

async function disableSharesForNotes(db: D1Database, userId: string, noteIds: string[]): Promise<void> {
  await setSharesField(db, userId, noteIds, 'is_enabled', 0)
}

export async function revokeSharesForNotes(db: D1Database, userId: string, noteIds: string[]): Promise<void> {
  for (const chunk of chunkNoteIds(noteIds)) {
    await db.batch([
      db.prepare(
        `DELETE FROM shares WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
      ).bind(userId, ...chunk),
      db.prepare(
        `DELETE FROM share_visits WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
      ).bind(userId, ...chunk),
    ])
  }
}

async function setSharesField(
  db: D1Database,
  userId: string,
  noteIds: string[],
  column: 'is_enabled' | 'expires_at' | 'folder_id',
  value: string | number | null,
): Promise<void> {
  for (const chunk of chunkNoteIds(noteIds)) {
    await db.prepare(
      `UPDATE shares SET ${column} = ? WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
    )
      .bind(value, userId, ...chunk)
      .run()
  }
}

const SHARE_NOTE_ID_CHUNK = 50

function chunkNoteIds(noteIds: string[]): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < noteIds.length; index += SHARE_NOTE_ID_CHUNK) {
    chunks.push(noteIds.slice(index, index + SHARE_NOTE_ID_CHUNK))
  }
  return chunks
}

function placeholdersFor(ids: string[]): string {
  return ids.map(() => '?').join(',')
}
