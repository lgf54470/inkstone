/** Note-level writes for the import pipeline: index lookup, insert and guarded update. */
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../env'
import { assertContentSize } from '../lib/request'
import { newId } from '../lib/id'
import { countText, deriveExcerpt } from '@shared/markdown-utils'
import { truncateText, utf8ByteLength } from '@shared/text-utils'
import { buildNoteDerivedStatements } from '../db/writes'
import { enqueueNoteIndex } from '../mcp/ai-search'
import { sha256Hex } from '../lib/encoding'
import { finiteNumber, shiftSqlPlaceholders, validTimestamp } from './shared'
import type { ExistingNoteIndex, ImportContext, InsertInput } from './types'

export async function loadExistingNoteIndex(
  db: D1Database,
  userId: string,
  id: string,
  ctx: ImportContext,
): Promise<ExistingNoteIndex | null> {
  if (ctx.byId?.has(id)) return ctx.byId.get(id) ?? null
  const row = await db.prepare(
    `SELECT n.id, n.title, n.rev, n.updated_at
       FROM notes n
      WHERE n.user_id = ?1
        AND (
          n.id = ?2 OR n.id = (
            SELECT target_id FROM import_mappings
             WHERE user_id = ?1 AND entity = 'note' AND source_id = ?2
          )
        )
      ORDER BY CASE WHEN n.id = (
        SELECT target_id FROM import_mappings
         WHERE user_id = ?1 AND entity = 'note' AND source_id = ?2
      ) THEN 0 ELSE 1 END
      LIMIT 1`,
  ).bind(userId, id).first<ExistingNoteIndex>()
  ctx.byId?.set(id, row ?? null)
  return row ?? null
}

export async function updateImportedNote(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  existing: ExistingNoteIndex,
  input: InsertInput,
  importedUpdatedAt: number,
  ctx: ImportContext,
): Promise<'updated' | 'skipped' | 'conflict' | 'missing'> {
  const current = await c.env.DB.prepare(
    `SELECT id, title, content, rev, position, is_pinned, is_starred, is_archived,
            created_at, updated_at, deleted_at
       FROM notes WHERE id = ?1 AND user_id = ?2`,
  ).bind(existing.id, userId).first<{
    id: string
    title: string
    content: string
    rev: number
    position: number
    is_pinned: number
    is_starred: number
    is_archived: number
    created_at: number
    updated_at: number
    deleted_at: number | null
  }>()
  if (!current) return 'missing'
  if (!importedUpdatedAt || current.updated_at >= importedUpdatedAt) return 'skipped'

  const title = truncateText(input.title.trim(), LIMITS.titleMaxLength)
  const { words, chars } = countText(input.content)
  const hash = await sha256Hex(input.content)
  const nextRev = current.rev + 1
  const updatedAt = validTimestamp(input.updatedAt) || importedUpdatedAt
  const createdAt = Math.min(validTimestamp(input.createdAt) || current.created_at, updatedAt)
  const deletedAt = validTimestamp(input.deletedAt) || null
  const position = finiteNumber(input.position) ?? current.position
  const mutationGuard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
  const mutationValues = [current.id, userId, nextRev, hash, title, updatedAt] as const
  const update = c.env.DB.prepare(
    `UPDATE notes SET title = ?1, content = ?2, excerpt = ?3, word_count = ?4, char_count = ?5,
       content_hash = ?6, folder_id = ?7, is_pinned = ?8, is_starred = ?9, is_archived = ?10,
       position = ?11, created_at = ?12, updated_at = ?13, rev = ?14, deleted_at = ?15
      WHERE id = ?16 AND user_id = ?17 AND rev = ?18`,
  ).bind(
    title,
    input.content,
    deriveExcerpt(input.content),
    words,
    chars,
    hash,
    input.folderId,
    input.isPinned === undefined ? current.is_pinned : input.isPinned ? 1 : 0,
    input.isStarred === undefined ? current.is_starred : input.isStarred ? 1 : 0,
    input.isArchived === undefined ? current.is_archived : input.isArchived ? 1 : 0,
    position,
    createdAt,
    updatedAt,
    nextRev,
    deletedAt,
    current.id,
    userId,
    current.rev,
  )

  const statements: D1PreparedStatement[] = [update]
  if (current.content !== input.content || current.title !== title) {
    const snapshotAt = Date.now()
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE ${shiftSqlPlaceholders(mutationGuard, 7)}`,
      ).bind(
        newId(),
        current.id,
        userId,
        current.title,
        current.content,
        utf8ByteLength(current.content),
        snapshotAt,
        ...mutationValues,
      ),
      c.env.DB.prepare(
        `DELETE FROM note_versions WHERE note_id = ?1
           AND ${shiftSqlPlaceholders(mutationGuard, 1)}
           AND id NOT IN (
             SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
           )`,
      ).bind(current.id, ...mutationValues, LIMITS.versionsPerNote),
    )
  }
  const derived = buildNoteDerivedStatements({
    db: c.env.DB,
    userId,
    noteId: current.id,
    title,
    content: input.content,
    ftsEnabled: ctx.ftsEnabled,
    previousTitle: current.title,
    expectedRev: nextRev,
    expectedContentHash: hash,
    expectedTitle: title,
    expectedUpdatedAt: updatedAt,
    deleted: Boolean(deletedAt),
  }).statements
  statements.push(
    ...derived,
    c.env.DB.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3
        WHERE ${shiftSqlPlaceholders(mutationGuard, 3)}`,
    ).bind(userId, current.id, Date.now(), ...mutationValues),
  )

  const [result] = await c.env.DB.batch(statements)
  if (!result?.meta.changes) return 'conflict'
  existing.title = title
  existing.rev = nextRev
  existing.updated_at = updatedAt
  await enqueueNoteIndex(c.env.DB, userId, current.id, 'embed')
  return 'updated'
}

export async function insertNote(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  input: InsertInput,
  ctx: ImportContext,
): Promise<string> {
  assertContentSize(input.content)

  let id = input.id ?? newId()
  const now = Date.now()
  const created = validTimestamp(input.createdAt) || now
  const updated = Math.max(validTimestamp(input.updatedAt) || created, created)
  const deleted = validTimestamp(input.deletedAt) || null
  const position = finiteNumber(input.position) ?? created
  const { words, chars } = countText(input.content)
  const title = truncateText(input.title.trim(), LIMITS.titleMaxLength)

  const hash = await sha256Hex(input.content)
  let hasInserted = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const insert = c.env.DB.prepare(
      `INSERT INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
         is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at, deleted_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        id,
        userId,
        input.folderId,
        title,
        input.content,
        deriveExcerpt(input.content),
        words,
        chars,
        input.isPinned === true ? 1 : 0,
        input.isStarred === true ? 1 : 0,
        input.isArchived === true ? 1 : 0,
        position,
        hash,
        created,
        updated,
        deleted,
      )
    const derived = buildNoteDerivedStatements({
      db: c.env.DB,
      userId,
      noteId: id,
      title,
      content: input.content,
      ftsEnabled: ctx.ftsEnabled,
      expectedRev: 1,
      expectedContentHash: hash,
      expectedTitle: title,
      expectedUpdatedAt: updated,
      deleted: Boolean(deleted),
    }).statements
    const change = c.env.DB.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3
        WHERE EXISTS (SELECT 1 FROM notes
          WHERE id = ?2 AND user_id = ?1 AND rev = 1 AND content_hash = ?4 AND updated_at = ?5)`,
    ).bind(userId, id, Date.now(), hash, updated)
    const mapping = input.id
      ? c.env.DB.prepare(
          `INSERT INTO import_mappings (user_id, entity, source_id, target_id, updated_at)
           SELECT ?1, 'note', ?2, ?3, ?4
            WHERE EXISTS (SELECT 1 FROM notes
              WHERE id = ?3 AND user_id = ?1 AND rev = 1
                AND content_hash = ?5 AND updated_at = ?6)
           ON CONFLICT(user_id, entity, source_id) DO UPDATE SET
             target_id = excluded.target_id,
             updated_at = excluded.updated_at`,
        ).bind(userId, input.id, id, Date.now(), hash, updated)
      : null
    const [result] = await c.env.DB.batch([
      insert,
      ...derived,
      change,
      ...(mapping ? [mapping] : []),
    ])
    if (result?.meta.changes) {
      hasInserted = true
      break
    }
    id = newId()
  }
  if (!hasInserted) throw new Error('Could not generate a unique note ID')

  if (!deleted) await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
  return id
}