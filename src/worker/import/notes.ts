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

interface CurrentNoteRow {
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
}

const NOTE_UPDATE_MUTATION_GUARD = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`

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

async function readCurrentNoteRow(
  db: D1Database,
  id: string,
  userId: string,
): Promise<CurrentNoteRow | null> {
  return db.prepare(
    `SELECT id, title, content, rev, position, is_pinned, is_starred, is_archived,
            created_at, updated_at, deleted_at
       FROM notes WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<CurrentNoteRow>()
}

interface NoteUpdatePlan {
  title: string
  hash: string
  nextRev: number
  updatedAt: number
  createdAt: number
  deletedAt: number | null
  position: number
  words: number
  chars: number
  pinned: number
  starred: number
  archived: number
  mutationValues: readonly [string, string, number, string, string, number]
}

async function planImportedNoteUpdate(
  current: CurrentNoteRow,
  input: InsertInput,
  userId: string,
  importedUpdatedAt: number,
): Promise<NoteUpdatePlan> {
  const title = truncateText(input.title.trim(), LIMITS.titleMaxLength)
  const hash = await sha256Hex(input.content)
  const nextRev = current.rev + 1
  const updatedAt = validTimestamp(input.updatedAt) || importedUpdatedAt
  const createdAt = Math.min(validTimestamp(input.createdAt) || current.created_at, updatedAt)
  const deletedAt = validTimestamp(input.deletedAt) || null
  const position = finiteNumber(input.position) ?? current.position
  const { words, chars } = countText(input.content)
  const mutationValues = [current.id, userId, nextRev, hash, title, updatedAt] as const
  return {
    title,
    hash,
    nextRev,
    updatedAt,
    createdAt,
    deletedAt,
    position,
    words,
    chars,
    pinned: input.isPinned === undefined ? current.is_pinned : input.isPinned ? 1 : 0,
    starred: input.isStarred === undefined ? current.is_starred : input.isStarred ? 1 : 0,
    archived: input.isArchived === undefined ? current.is_archived : input.isArchived ? 1 : 0,
    mutationValues,
  }
}

function buildVersionHistoryStatements(
  db: D1Database,
  current: CurrentNoteRow,
  input: InsertInput,
  plan: NoteUpdatePlan,
  userId: string,
): D1PreparedStatement[] {
  if (current.content === input.content && current.title === plan.title) return []
  const snapshotAt = Date.now()
  return [
    db.prepare(
      `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE ${shiftSqlPlaceholders(NOTE_UPDATE_MUTATION_GUARD, 7)}`,
    ).bind(
      newId(),
      current.id,
      userId,
      current.title,
      current.content,
      utf8ByteLength(current.content),
      snapshotAt,
      ...plan.mutationValues,
    ),
    db.prepare(
      `DELETE FROM note_versions WHERE note_id = ?1
         AND ${shiftSqlPlaceholders(NOTE_UPDATE_MUTATION_GUARD, 1)}
         AND id NOT IN (
           SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
         )`,
    ).bind(current.id, ...plan.mutationValues, LIMITS.versionsPerNote),
  ]
}

function buildNoteCoreUpdateStatement(
  db: D1Database,
  current: CurrentNoteRow,
  input: InsertInput,
  userId: string,
  plan: NoteUpdatePlan,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE notes SET title = ?1, content = ?2, excerpt = ?3, word_count = ?4, char_count = ?5,
       content_hash = ?6, folder_id = ?7, is_pinned = ?8, is_starred = ?9, is_archived = ?10,
       position = ?11, created_at = ?12, updated_at = ?13, rev = ?14, deleted_at = ?15
      WHERE id = ?16 AND user_id = ?17 AND rev = ?18`,
  ).bind(
    plan.title,
    input.content,
    deriveExcerpt(input.content),
    plan.words,
    plan.chars,
    plan.hash,
    input.folderId,
    plan.pinned,
    plan.starred,
    plan.archived,
    plan.position,
    plan.createdAt,
    plan.updatedAt,
    plan.nextRev,
    plan.deletedAt,
    current.id,
    userId,
    current.rev,
  )
}

function buildNoteDerivedUpdateStatements(
  db: D1Database,
  current: CurrentNoteRow,
  input: InsertInput,
  userId: string,
  ftsEnabled: boolean,
  plan: NoteUpdatePlan,
): D1PreparedStatement[] {
  const derived = buildNoteDerivedStatements({
    db,
    userId,
    noteId: current.id,
    title: plan.title,
    content: input.content,
    ftsEnabled,
    previousTitle: current.title,
    expectedRev: plan.nextRev,
    expectedContentHash: plan.hash,
    expectedTitle: plan.title,
    expectedUpdatedAt: plan.updatedAt,
    deleted: Boolean(plan.deletedAt),
  }).statements
  return [
    ...derived,
    db.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3
        WHERE ${shiftSqlPlaceholders(NOTE_UPDATE_MUTATION_GUARD, 3)}`,
    ).bind(userId, current.id, Date.now(), ...plan.mutationValues),
  ]
}

function buildNoteMutationStatements(
  db: D1Database,
  current: CurrentNoteRow,
  input: InsertInput,
  userId: string,
  ftsEnabled: boolean,
  plan: NoteUpdatePlan,
): D1PreparedStatement[] {
  return [
    buildNoteCoreUpdateStatement(db, current, input, userId, plan),
    ...buildVersionHistoryStatements(db, current, input, plan, userId),
    ...buildNoteDerivedUpdateStatements(db, current, input, userId, ftsEnabled, plan),
  ]
}

export async function updateImportedNote(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  existing: ExistingNoteIndex,
  input: InsertInput,
  importedUpdatedAt: number,
  ctx: ImportContext,
): Promise<'updated' | 'skipped' | 'conflict' | 'missing'> {
  const current = await readCurrentNoteRow(c.env.DB, existing.id, userId)
  if (!current) return 'missing'
  if (!importedUpdatedAt || current.updated_at >= importedUpdatedAt) return 'skipped'

  const plan = await planImportedNoteUpdate(current, input, userId, importedUpdatedAt)
  const statements = buildNoteMutationStatements(
    c.env.DB,
    current,
    input,
    userId,
    ctx.ftsEnabled,
    plan,
  )
  const [result] = await c.env.DB.batch(statements)
  if (!result?.meta.changes) return 'conflict'
  existing.title = plan.title
  existing.rev = plan.nextRev
  existing.updated_at = plan.updatedAt
  await enqueueNoteIndex(c.env.DB, userId, current.id, 'embed')
  return 'updated'
}

interface NoteInsertPlan {
  id: string
  created: number
  updated: number
  deleted: number | null
  position: number
  words: number
  chars: number
  title: string
  hash: string
}

async function prepareNoteInsert(input: InsertInput): Promise<NoteInsertPlan> {
  assertContentSize(input.content)
  const created = validTimestamp(input.createdAt) || Date.now()
  const updated = Math.max(validTimestamp(input.updatedAt) || created, created)
  const deleted = validTimestamp(input.deletedAt) || null
  const position = finiteNumber(input.position) ?? created
  const { words, chars } = countText(input.content)
  return {
    id: input.id ?? newId(),
    created,
    updated,
    deleted,
    position,
    words,
    chars,
    title: truncateText(input.title.trim(), LIMITS.titleMaxLength),
    hash: await sha256Hex(input.content),
  }
}

function buildNoteInsertCoreStatement(
  db: D1Database,
  userId: string,
  input: InsertInput,
  id: string,
  plan: NoteInsertPlan,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(
      id,
      userId,
      input.folderId,
      plan.title,
      input.content,
      deriveExcerpt(input.content),
      plan.words,
      plan.chars,
      input.isPinned === true ? 1 : 0,
      input.isStarred === true ? 1 : 0,
      input.isArchived === true ? 1 : 0,
      plan.position,
      plan.hash,
      plan.created,
      plan.updated,
      plan.deleted,
    )
}

function buildNoteInsertSupportStatements(
  db: D1Database,
  userId: string,
  input: InsertInput,
  id: string,
  plan: NoteInsertPlan,
  ftsEnabled: boolean,
): D1PreparedStatement[] {
  const derived = buildNoteDerivedStatements({
    db,
    userId,
    noteId: id,
    title: plan.title,
    content: input.content,
    ftsEnabled,
    expectedRev: 1,
    expectedContentHash: plan.hash,
    expectedTitle: plan.title,
    expectedUpdatedAt: plan.updated,
    deleted: Boolean(plan.deleted),
  }).statements
  const change = db.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at)
     SELECT ?1, 'note', ?2, 'upsert', ?3
      WHERE EXISTS (SELECT 1 FROM notes
        WHERE id = ?2 AND user_id = ?1 AND rev = 1 AND content_hash = ?4 AND updated_at = ?5)`,
  ).bind(userId, id, Date.now(), plan.hash, plan.updated)
  const mapping = input.id
    ? db.prepare(
        `INSERT INTO import_mappings (user_id, entity, source_id, target_id, updated_at)
         SELECT ?1, 'note', ?2, ?3, ?4
          WHERE EXISTS (SELECT 1 FROM notes
            WHERE id = ?3 AND user_id = ?1 AND rev = 1
              AND content_hash = ?5 AND updated_at = ?6)
         ON CONFLICT(user_id, entity, source_id) DO UPDATE SET
           target_id = excluded.target_id,
           updated_at = excluded.updated_at`,
      ).bind(userId, input.id, id, Date.now(), plan.hash, plan.updated)
    : null
  return [...derived, change, ...(mapping ? [mapping] : [])]
}

export async function insertNote(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  input: InsertInput,
  ctx: ImportContext,
): Promise<string> {
  const plan = await prepareNoteInsert(input)
  let id = plan.id
  let hasInserted = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const insert = buildNoteInsertCoreStatement(c.env.DB, userId, input, id, plan)
    const support = buildNoteInsertSupportStatements(c.env.DB, userId, input, id, plan, ctx.ftsEnabled)
    const [result] = await c.env.DB.batch([insert, ...support])
    if (result?.meta.changes) {
      hasInserted = true
      break
    }
    id = newId()
  }
  if (!hasInserted) throw new Error('Could not generate a unique note ID')
  if (!plan.deleted) await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
  return id
}
