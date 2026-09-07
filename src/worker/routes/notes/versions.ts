import { Hono } from 'hono';
import { countText, deriveExcerpt } from '@shared/markdown-utils';
import { utf8ByteLength } from '@shared/text-utils';
import type { AppBindings } from '../../env';
import { buildNoteDerivedStatements, shiftSqlPlaceholders } from '../../db/writes';
import type { NoteRow } from '../../db/rows';
import { sha256Hex } from '../../lib/encoding';
import { ApiError } from '../../lib/errors';
import { newId } from '../../lib/id';
import { broadcastCursor, scheduleFtsDrain } from '../../lib/notify';
import { enqueueNoteIndex } from '../../mcp/ai-search';
import { loadNote, loadNoteRow, restoredVersionTitle, trimNoteVersionsStatement, guardedChangeStatement } from './helpers';

export function registerNotesVersionsRoutes(notesRoutes: Hono<AppBindings>): void {
  registerListVersionsRoute(notesRoutes)
  registerGetVersionRoute(notesRoutes)
  registerRestoreVersionRoute(notesRoutes)
}

function registerListVersionsRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.get('/:id/versions', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, note_id, title, length(CAST(content AS BLOB)) AS size, created_at FROM note_versions
         WHERE note_id = ?1 AND user_id = ?2 ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(c.req.param('id'), c.get('userId'))
      .all<{ id: string; note_id: string; title: string; size: number; created_at: number }>()

    return c.json({
      versions: results.map((r) => ({
        id: r.id,
        noteId: r.note_id,
        title: r.title,
        size: r.size,
        createdAt: r.created_at,
      })),
    })
  })
}

function registerGetVersionRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.get('/:id/versions/:versionId', async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT id, note_id, title, content, length(CAST(content AS BLOB)) AS size, created_at FROM note_versions
         WHERE id = ?1 AND note_id = ?2 AND user_id = ?3`,
    )
      .bind(c.req.param('versionId'), c.req.param('id'), c.get('userId'))
      .first<{
        id: string
        note_id: string
        title: string
        content: string
        size: number
        created_at: number
      }>()
    if (!row) throw ApiError.notFound('Version not found')
    return c.json({
      id: row.id,
      noteId: row.note_id,
      title: row.title,
      content: row.content,
      size: row.size,
      createdAt: row.created_at,
    })
  })
}

function registerRestoreVersionRoute(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.post('/:id/versions/:versionId/restore', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { ftsEnabled } = c.get('database')
    const version = await c.env.DB.prepare(
      `SELECT title, content FROM note_versions WHERE id = ?1 AND note_id = ?2 AND user_id = ?3`,
    )
      .bind(c.req.param('versionId'), id, userId)
      .first<{ title: string; content: string }>()
    if (!version) throw ApiError.notFound('Version not found')
    const current = await loadNoteRow(c.env.DB, userId, id)
    const now = Math.max(Date.now(), current.updated_at + 1)
    const title = restoredVersionTitle(version.title)
    const hash = await sha256Hex(version.content)
    const nextRev = current.rev + 1
    const mutationGuard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
    const mutationValues = [id, userId, nextRev, hash, title, now] as const
    const [updated] = await c.env.DB.batch(restoreVersionStatements(c.env.DB, {
      userId, id, version, current, title, hash,
      nextRev, now, ftsEnabled, mutationGuard, mutationValues,
    }))
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

function restoreVersionStatements(db: D1Database, params: {
  userId: string
  id: string
  version: { title: string; content: string }
  current: NoteRow
  title: string
  hash: string
  nextRev: number
  now: number
  ftsEnabled: boolean
  mutationGuard: string
  mutationValues: readonly unknown[]
}): D1PreparedStatement[] {
  const { userId, id, version, current, title, hash, nextRev, now, ftsEnabled, mutationGuard, mutationValues } = params
  const { words, chars } = countText(version.content)
  const update = db.prepare(
    `UPDATE notes SET content = ?1, title = ?2, excerpt = ?3, word_count = ?4, char_count = ?5,
       content_hash = ?6, rev = ?7, updated_at = ?8
       WHERE id = ?9 AND user_id = ?10 AND rev = ?11`,
  ).bind(version.content, title, deriveExcerpt(version.content), words, chars, hash, nextRev, now, id, userId, current.rev)
  const snapshot = db.prepare(
    `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
      WHERE ${shiftSqlPlaceholders(mutationGuard, 7)}`,
  ).bind(newId(), id, userId, current.title, current.content, utf8ByteLength(current.content), now, ...mutationValues)
  const trimVersions = trimNoteVersionsStatement(db, id, mutationGuard, mutationValues)
  const derived = buildNoteDerivedStatements({
    db,
    userId,
    noteId: id,
    title,
    content: version.content,
    ftsEnabled,
    titleChanged: true,
    previousTitle: current.title,
    expectedRev: nextRev,
    expectedContentHash: hash,
    expectedTitle: title,
    expectedUpdatedAt: now,
    deleted: current.deleted_at !== null,
  }).statements
  const change = guardedChangeStatement(db, {
    userId,
    entityId: id,
    op: 'upsert',
    now,
    guard: mutationGuard,
    guardValues: mutationValues,
  })
  return [update, snapshot, trimVersions, ...derived, change]
}