import { Hono } from "hono";
import type { Context } from "hono";
import { LIMITS } from "@shared/constants";
import { duplicateNoteTitle } from "@shared/text-utils";
import type { AppBindings } from "../../env";
import { toNote, type NoteRow } from "../../db/rows";
import { buildNoteDerivedStatements, changeStatement, FTS_QUEUE_CONFLICT_SQL, LINK_TARGET_SUBQUERY, shiftSqlPlaceholders } from "../../db/writes";
import { sha256Hex } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { broadcastCursor, scheduleFtsDrain } from "../../lib/notify";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { enqueueNoteIndex } from "../../mcp/ai-search";
import { duplicateNoteSchema, guardedChangeStatement, loadNote, loadNoteRow, noteIdFromRequest } from './helpers';

const TRASHED_GUARD = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3 AND deleted_at IS NOT NULL)`

export function registerNotesLifecycleRoutes(notesRoutes: Hono<AppBindings>): void {
  registerTrashNoteRoute(notesRoutes)
  registerRestoreNoteRoute(notesRoutes)
  registerPurgeNoteRoute(notesRoutes)
  registerDuplicateNoteRoute(notesRoutes)
}

function registerTrashNoteRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.delete('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { ftsEnabled } = c.get('database')
    const row = await loadNoteRow(c.env.DB, userId, id)
    if (row.deleted_at !== null) throw ApiError.notFound('The note does not exist or is in the trash')
    const now = Math.max(Date.now(), row.updated_at + 1)
    const nextRev = row.rev + 1
    const results = await c.env.DB.batch(trashNoteStatements(c.env.DB, { userId, id, row, now, nextRev, ftsEnabled }))
    const updated = results[0]
    if (!updated?.meta.changes) {
      throw ApiError.conflict('This note was modified elsewhere', { server: await loadNote(c.env.DB, userId, id) })
    }
    const changeResult = results.at(-1) as D1Result<{ seq: number }> | undefined
    await broadcastCursor(c, changeResult?.results?.[0]?.seq)
    scheduleFtsDrain(c)
    const note = toNote({ ...row, deleted_at: now, updated_at: now, rev: nextRev })
    return c.json(note)
  })
}

function registerRestoreNoteRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.post('/:id/restore', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { ftsEnabled } = c.get('database')
    const row = await loadNoteRow(c.env.DB, userId, id)
    if (row.deleted_at === null) throw ApiError.badRequest('The note is not in the trash')
    const now = Math.max(Date.now(), row.updated_at + 1)
    const nextRev = row.rev + 1
    const [updated] = await c.env.DB.batch(restoreNoteStatements(c.env.DB, { userId, id, row, now, nextRev, ftsEnabled }))
    if (!updated?.meta.changes) {
      throw ApiError.conflict('This note was modified elsewhere', { server: await loadNote(c.env.DB, userId, id) })
    }
    await broadcastCursor(c)
    await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
    scheduleFtsDrain(c)
    const note = await loadNote(c.env.DB, userId, id)
    return c.json(note)
  })
}

function registerPurgeNoteRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.delete('/:id/purge', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { ftsEnabled } = c.get('database')
    const row = await loadNoteRow(c.env.DB, userId, id)
    if (row.deleted_at === null) throw ApiError.notFound('The note does not exist or is not in the trash')
    const results = await c.env.DB.batch(purgeNoteStatements(c.env.DB, { userId, id, row, ftsEnabled }))
    const changeResult = results.at(-3) as D1Result<{ seq: number }> | undefined
    const deleted = results.at(-2)
    if (!deleted?.meta.changes) throw ApiError.conflict('Note state changed. Refresh and try again')
    const broadcastedCursor = await broadcastCursor(c, changeResult?.results?.[0]?.seq)
    const deletionCursor = changeResult?.results?.[0]?.seq
    scheduleFtsDrain(c)
    return c.json({
      ok: true,
      cursor: Number.isSafeInteger(deletionCursor) ? deletionCursor! : broadcastedCursor,
    })
  })
}

function registerDuplicateNoteRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.post('/:id/duplicate', async (c) => {
    const userId = c.get('userId')
    const { ftsEnabled } = c.get('database')
    const source = await loadNoteRow(c.env.DB, userId, c.req.param('id'))
    const body = c.req.header('Content-Type')?.includes('application/json')
      ? await readJsonValidated(c, duplicateNoteSchema, JSON_BODY_LIMITS.small)
      : {}
    const { id, existing } = await noteIdFromRequest(c.env.DB, userId, body.id)
    if (existing) return c.json(toNote(existing))
    const now = Date.now()
    const title = duplicateNoteTitle(source.title, LIMITS.titleMaxLength)
    const content = source.content
    const hash = await sha256Hex(content)
    const statements = duplicateNoteStatements(c.env.DB, { userId, id, source, title, content, hash, now, ftsEnabled })
    const duplicateResponse = await runDuplicateBatch(c, { userId, requestedId: body.id, statements })
    if (duplicateResponse) return duplicateResponse
    await broadcastCursor(c)
    await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
    scheduleFtsDrain(c)
    const note = await loadNote(c.env.DB, userId, id)
    return c.json(note, 201)
  })
}

async function runDuplicateBatch(c: Context<AppBindings>, params: {
  userId: string
  requestedId: string | undefined
  statements: D1PreparedStatement[]
}): Promise<Response | null> {
  const error = await c.env.DB.batch(params.statements).then(() => null, (e: unknown) => e)
  if (!error) return null
  const recheck = params.requestedId
    ? await noteIdFromRequest(c.env.DB, params.userId, params.requestedId)
    : null
  if (recheck?.existing) return c.json(toNote(recheck.existing))
  throw error
}

function trashNoteStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  now: number
  nextRev: number
  ftsEnabled: boolean
}): D1PreparedStatement[] {
  const { userId, id, row, now, nextRev, ftsEnabled } = params
  const guardValues = [id, userId, nextRev] as const
  const statements = [
    db.prepare(
      `UPDATE notes SET deleted_at = ?1, updated_at = ?1, rev = ?2
        WHERE id = ?3 AND user_id = ?4 AND rev = ?5 AND deleted_at IS NULL`,
    ).bind(now, nextRev, id, userId, row.rev),
    db.prepare(`DELETE FROM links WHERE source_note_id = ?1 AND ${shiftSqlPlaceholders(TRASHED_GUARD, 1)}`)
      .bind(id, id, userId, nextRev),
    db.prepare(
      `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
        WHERE target_note_id = ?1 AND user_id = ?2 AND ${shiftSqlPlaceholders(TRASHED_GUARD, 2)}`,
    ).bind(id, userId, id, userId, nextRev),
  ]
  if (ftsEnabled) {
    statements.push(
      db.prepare(
        `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at)
         SELECT ?1, ?2, 'delete', ?3 WHERE ${shiftSqlPlaceholders(TRASHED_GUARD, 3)}
         ${FTS_QUEUE_CONFLICT_SQL}`,
      ).bind(userId, id, now, ...guardValues),
    )
  }
  statements.push(
    db.prepare(
      `INSERT OR REPLACE INTO ai_index_queue (user_id, note_id, kind, created_at)
       SELECT ?1, ?2, 'delete', ?3 WHERE ${shiftSqlPlaceholders(TRASHED_GUARD, 3)}`,
    ).bind(userId, id, now, ...guardValues),
    guardedChangeStatement(db, {
      userId,
      entityId: id,
      op: 'upsert',
      now,
      guard: TRASHED_GUARD,
      guardValues,
      returningSeq: true,
    }),
  )
  return statements
}

function restoreNoteStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  now: number
  nextRev: number
  ftsEnabled: boolean
}): D1PreparedStatement[] {
  const { userId, id, row, now, nextRev, ftsEnabled } = params
  const update = db.prepare(
    `UPDATE notes SET deleted_at = NULL, updated_at = ?1, rev = ?2
      WHERE id = ?3 AND user_id = ?4 AND rev = ?5 AND deleted_at IS NOT NULL`,
  ).bind(now, nextRev, id, userId, row.rev)
  const derived = buildNoteDerivedStatements({
    db,
    userId,
    noteId: id,
    title: row.title,
    content: row.content,
    ftsEnabled,
    titleChanged: true,
    expectedRev: nextRev,
    expectedContentHash: row.content_hash,
    expectedTitle: row.title,
    expectedUpdatedAt: now,
  }).statements
  const change = db.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at)
     SELECT ?1, 'note', ?2, 'upsert', ?3
      WHERE EXISTS (SELECT 1 FROM notes WHERE id = ?2 AND user_id = ?1 AND rev = ?4 AND deleted_at IS NULL)`,
  ).bind(userId, id, now, nextRev)
  return [update, ...derived, change]
}

function purgeNoteStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  ftsEnabled: boolean
}): D1PreparedStatement[] {
  const { userId, id, row, ftsEnabled } = params
  return [
    ...purgeCoreStatements(db, { userId, id, row }),
    ...purgeTailStatements(db, { userId, id, row, ftsEnabled }),
  ]
}

function purgeCoreStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
}): D1PreparedStatement[] {
  const { userId, id, row } = params
  const guarded = (sql: string) => db
    .prepare(`${sql} AND ${shiftSqlPlaceholders(TRASHED_GUARD, 1)}`)
    .bind(id, id, userId, row.rev)
  return [
    guarded(`DELETE FROM note_tags WHERE note_id = ?1`),
    guarded(`DELETE FROM links WHERE source_note_id = ?1`),
    db.prepare(
      `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
        WHERE target_note_id = ?1 AND user_id = ?2 AND ${shiftSqlPlaceholders(TRASHED_GUARD, 2)}`,
    ).bind(id, userId, id, userId, row.rev),
    guarded(`DELETE FROM note_versions WHERE note_id = ?1`),
    db.prepare(
      `DELETE FROM share_asset_sessions
        WHERE slug IN (SELECT slug FROM shares WHERE note_id = ?1 AND user_id = ?2)
          AND ${shiftSqlPlaceholders(TRASHED_GUARD, 2)}`,
    ).bind(id, userId, id, userId, row.rev),
    guarded(`DELETE FROM shares WHERE note_id = ?1`),
    guarded(`UPDATE attachments SET note_id = NULL WHERE note_id = ?1`),
    db.prepare(
      `DELETE FROM import_mappings
        WHERE user_id = ?1 AND entity = 'note' AND target_id = ?2
          AND EXISTS (SELECT 1 FROM notes
            WHERE id = ?2 AND user_id = ?1 AND rev = ?3 AND deleted_at IS NOT NULL)`,
    ).bind(userId, id, row.rev),
  ]
}

function purgeTailStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  ftsEnabled: boolean
}): D1PreparedStatement[] {
  const { userId, id, row, ftsEnabled } = params
  const guardValues = [id, userId, row.rev] as const
  const now = Date.now()
  const statements: D1PreparedStatement[] = []
  if (ftsEnabled) {
    statements.push(
      db.prepare(
        `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at)
         SELECT ?1, ?2, 'delete', ?3 WHERE ${shiftSqlPlaceholders(TRASHED_GUARD, 3)}
         ${FTS_QUEUE_CONFLICT_SQL}`,
      ).bind(userId, id, now, ...guardValues),
    )
  }
  statements.push(
    db.prepare(
      `INSERT OR REPLACE INTO ai_index_queue (user_id, note_id, kind, created_at)
       SELECT ?1, ?2, 'delete', ?3 WHERE ${shiftSqlPlaceholders(TRASHED_GUARD, 3)}`,
    ).bind(userId, id, now, ...guardValues),
    guardedChangeStatement(db, {
      userId,
      entityId: id,
      op: 'delete',
      now,
      guard: TRASHED_GUARD,
      guardValues,
      returningSeq: true,
    }),
    db.prepare(
      `DELETE FROM notes WHERE id = ?1 AND user_id = ?2 AND rev = ?3 AND deleted_at IS NOT NULL`,
    ).bind(id, userId, row.rev),
    db.prepare(`DELETE FROM tags
      WHERE user_id = ?1 AND is_manual = 0
        AND id NOT IN (SELECT tag_id FROM note_tags)`)
      .bind(userId),
  )
  return statements
}

function duplicateNoteStatements(db: D1Database, params: {
  userId: string
  id: string
  source: NoteRow
  title: string
  content: string
  hash: string
  now: number
  ftsEnabled: boolean
}): D1PreparedStatement[] {
  const { userId, id, source, title, content, hash, now, ftsEnabled } = params
  const insert = db.prepare(
    `INSERT INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, 0, 0, ?9, ?10, ?11, ?12, ?12)`,
  )
    .bind(
      id,
      userId,
      source.folder_id,
      title,
      content,
      source.excerpt,
      source.word_count,
      source.char_count,
      source.is_archived,
      now,
      hash,
      now,
    )
  const derived = buildNoteDerivedStatements({
    db,
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
  return [insert, ...derived, changeStatement(db, userId, 'note', id, 'upsert')]
}