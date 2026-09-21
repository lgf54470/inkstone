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

    let count = 0
    let permanent = 0
    switch (body.action) {
      case 'enable':
        count = await enableNoteShares(c.env.DB, userId, noteIds, now)
        break
      case 'extend': {
        const days = clampExtendDays(body.extendDays)
        const result = await extendSharesForNotes(c.env.DB, userId, noteIds, days * DAY_MS, now)
        count = result.extended
        permanent = result.permanent
        break
      }
      case 'disable':
        count = await disableSharesForNotes(c.env.DB, userId, noteIds)
        break
      case 'revoke':
        count = await revokeSharesForNotes(c.env.DB, userId, noteIds)
        break
      case 'expire': {
        const expiresAt =
          typeof body.expiresIn === 'number' && body.expiresIn > 0
            ? now + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
            : null
        count = await setSharesField(c.env.DB, userId, noteIds, 'expires_at', expiresAt)
        break
      }
      case 'move': {
        const targetFolderId = body.folderId && isValidId(body.folderId) ? body.folderId : null
        count = await setSharesField(c.env.DB, userId, noteIds, 'folder_id', targetFolderId)
        break
      }
    }
    // `permanent` is reported only by `extend`: no other action can leave a link alone, and a
    // field that is always 0 in the response invites reading it as the answer to the request.
    return body.action === 'extend'
      ? c.json({ ok: true, count, permanent })
      : c.json({ ok: true, count })
  })
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EXTEND_DAYS = 365

/** A missing or nonsensical day count means the shipped default, never a wild expiry. */
function clampExtendDays(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return 7
  return Math.min(Math.trunc(raw), MAX_EXTEND_DAYS)
}

/**
 * Renewal, as opposed to `expire`: `expire` writes an absolute moment, so applying it to
 * a link that already runs longer would *shorten* it. Adding days is what a person means by
 * "keep these alive a bit longer", and the two boundaries are the whole of the semantics:
 * a permanent link has no clock to move (it stays null and is reported back), and a lapsed
 * link starts from now — adding to its own past expiry could leave it lapsed again.
 */
async function extendSharesForNotes(
  db: D1Database,
  userId: string,
  noteIds: string[],
  extendMs: number,
  now: number,
): Promise<{ extended: number; permanent: number }> {
  let extended = 0
  let permanent = 0
  for (const chunk of chunkNoteIds(noteIds)) {
    const stuck = await db.prepare(
      `SELECT COUNT(*) AS n FROM shares
        WHERE user_id = ?1 AND note_id IN (${placeholdersFor(chunk)}) AND expires_at IS NULL`,
    )
      .bind(userId, ...chunk)
      .first<{ n: number }>()
    permanent += stuck?.n ?? 0
    const result = await db.prepare(
      `UPDATE shares SET expires_at = MAX(expires_at, ?2) + ?3
        WHERE user_id = ?1 AND note_id IN (${placeholdersFor(chunk)}) AND expires_at IS NOT NULL`,
    )
      .bind(userId, now, extendMs, ...chunk)
      .run()
    extended += result.meta.changes ?? 0
  }
  return { extended, permanent }
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
    let count = 0
    if (body.enabled) {
      count = await enableNoteShares(c.env.DB, userId, noteList.map((n) => n.id), Date.now())
    } else if (noteList.length > 0) {
      count = await disableSharesForNotes(c.env.DB, userId, noteList.map((n) => n.id))
    }
    return c.json({ ok: true, count })
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
    let count = 0
    if (body.enabled) {
      count = await enableNoteShares(c.env.DB, userId, noteList.map((n) => n.id), Date.now())
    } else if (noteList.length > 0) {
      count = await disableSharesForNotes(c.env.DB, userId, noteList.map((n) => n.id))
    }
    return c.json({ ok: true, count })
  })
}

async function enableNoteShares(db: D1Database, userId: string, noteIds: string[], now: number): Promise<number> {
  let affected = 0
  for (const chunk of chunkNoteIds(noteIds)) {
    // One upsert per note inside a chunked db.batch: the whole chunk commits together,
    // and both arms are owner-guarded so a foreign note_id can neither be inserted over
    // nor have its share flipped (the old read-then-insert crashed on exactly that).
    const statements = chunk.map((noteId) => db.prepare(
      `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, is_enabled, created_at)
       SELECT ?1, id, ?2, NULL, NULL, 0, 1, ?3 FROM notes WHERE id = ?4 AND user_id = ?2
       ON CONFLICT(note_id) DO UPDATE SET is_enabled = 1 WHERE shares.user_id = ?2`,
    ).bind(newSlug(), userId, now, noteId))
    const results = await db.batch(statements)
    for (const result of results) affected += result.meta.changes ?? 0
  }
  return affected
}

async function disableSharesForNotes(db: D1Database, userId: string, noteIds: string[]): Promise<number> {
  return setSharesField(db, userId, noteIds, 'is_enabled', 0)
}

export async function revokeSharesForNotes(db: D1Database, userId: string, noteIds: string[]): Promise<number> {
  let affected = 0
  for (const chunk of chunkNoteIds(noteIds)) {
    // Sessions go first: their lookup is a subquery over shares and must read the
    // still-present rows inside the same transaction.
    const [, sharesDeleted] = await db.batch([
      db.prepare(
        `DELETE FROM share_asset_sessions WHERE slug IN (SELECT slug FROM shares WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)}))`,
      ).bind(userId, ...chunk),
      db.prepare(
        `DELETE FROM shares WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
      ).bind(userId, ...chunk),
      db.prepare(
        `DELETE FROM share_visits WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
      ).bind(userId, ...chunk),
    ])
    affected += sharesDeleted.meta.changes ?? 0
  }
  return affected
}

async function setSharesField(
  db: D1Database,
  userId: string,
  noteIds: string[],
  column: 'is_enabled' | 'expires_at' | 'folder_id',
  value: string | number | null,
): Promise<number> {
  let affected = 0
  for (const chunk of chunkNoteIds(noteIds)) {
    const result = await db.prepare(
      `UPDATE shares SET ${column} = ? WHERE user_id = ? AND note_id IN (${placeholdersFor(chunk)})`,
    )
      .bind(value, userId, ...chunk)
      .run()
    affected += result.meta.changes ?? 0
  }
  return affected
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
