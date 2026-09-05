import { Hono } from "hono";
import { countText, deriveExcerpt } from "@shared/markdown-utils";
import type { AppBindings } from "../../env";
import { NOTE_COLUMNS_FULL, toNote, type NoteRow } from "../../db/rows";
import { buildNoteDerivedStatements } from "../../db/writes";
import { sha256Hex } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { broadcastCursor, scheduleFtsDrain } from "../../lib/notify";
import { assertContentSize, JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { enqueueNoteIndex } from "../../mcp/ai-search";
import { createNoteSchema } from './helpers';
import { loadNote } from './helpers';
import { resolveNoteTitle } from './helpers';
import { resolveFolderId } from './helpers';

export function registerNotesCreateRoutes(notesRoutes: Hono<AppBindings>): void {
notesRoutes.get('/:id', async (c) => {
  const note = await loadNote(c.env.DB, c.get('userId'), c.req.param('id'))
  return c.json(note)
})

notesRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const { ftsEnabled } = c.get('database')
  const body = await readJsonValidated(c, createNoteSchema, JSON_BODY_LIMITS.note)

  const content = body.content ?? ''
  assertContentSize(content)

  const id = body.id ?? newId()
  if (body.id) {
    const existing = await c.env.DB.prepare(
      `SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`,
    )
      .bind(id, userId)
      .first<NoteRow>()
    if (existing) return c.json(toNote(existing))
    const collision = await c.env.DB.prepare(`SELECT user_id FROM notes WHERE id = ?1`)
      .bind(id)
      .first<{ user_id: string }>()
    if (collision) throw ApiError.conflict('This note id is already in use')
  }
  const now = Date.now()
  const title = resolveNoteTitle(body.title)
  const excerpt = deriveExcerpt(content)
  const { words, chars } = countText(content)
  const hash = await sha256Hex(content)
  const folderId = await resolveFolderId(c.env.DB, userId, body.folderId ?? null)

  const insert = c.env.DB.prepare(
    `INSERT OR IGNORE INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, 0, ?9, 0, ?10, ?11, ?12, ?12)`,
  )
    .bind(id, userId, folderId, title, content, excerpt, words, chars, body.isStarred ? 1 : 0, now, hash, now)
  const derived = buildNoteDerivedStatements({
    db: c.env.DB,
    userId,
    noteId: id,
    title,
    content,
    ftsEnabled,
    expectedRev: 1,
    expectedContentHash: hash,
    expectedTitle: title,
    expectedUpdatedAt: now,
  }).statements
  const createChange = c.env.DB.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at)
     SELECT ?1, 'note', ?2, 'upsert', ?3
      WHERE EXISTS (
        SELECT 1 FROM notes
         WHERE id = ?2 AND user_id = ?1 AND rev = 1
           AND content_hash = ?4 AND title = ?5 AND created_at = ?3 AND updated_at = ?3
      )`,
  ).bind(userId, id, now, hash, title)
  const [insertResult] = await c.env.DB.batch([insert, ...derived, createChange])
  const created = await c.env.DB.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`,
  )
    .bind(id, userId)
    .first<NoteRow>()
  if (!created) throw ApiError.conflict('This note id is already in use')
  await broadcastCursor(c)
  if (insertResult?.meta.changes) {
    await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
    scheduleFtsDrain(c)
  }
  const note = toNote(created)
  return c.json(note, insertResult?.meta.changes ? 201 : 200)
})
}

