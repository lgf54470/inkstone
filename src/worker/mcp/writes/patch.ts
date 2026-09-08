import { LIMITS } from '@shared/constants'
import { countText, deriveExcerpt } from '@shared/markdown-utils'
import { truncateText, utf8ByteLength } from '@shared/text-utils'
import type { Note } from '@shared/types'
import { NOTE_COLUMNS_FULL, toNote, type NoteRow } from '../../db/rows'
import { buildNoteDerivedStatements, shiftSqlPlaceholders } from '../../db/writes'
import { sha256Hex } from '../../lib/encoding'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { broadcastUserCursor } from '../../lib/notify'
import { assertContentSize } from '../../lib/request'
import { enqueueNoteIndex } from '../ai-search'
import type { Env } from '../../env'

// McpWriteContext lives here (not in ops.ts) because ops.ts imports the patch
// helpers from this module; owning the shared context shape here keeps the
// pair free of an import cycle.
export interface McpWriteContext {
  env: Env
  userId: string
  ftsEnabled: boolean
  executionCtx: ExecutionContext
}

export interface NotePatch {
  title?: string
  content?: string
  folderId?: string | null
  isPinned?: boolean
  isStarred?: boolean
  isArchived?: boolean
}

interface PatchChanges {
  sets: string[]
  binds: unknown[]
  newTitle: string
  newContent: string
  newHash: string
  hasContentChanged: boolean
}

interface PatchBase {
  context: McpWriteContext
  row: NoteRow
  changes: PatchChanges
  now: number
  nextRev: number
  mutationGuard: string
  mutationValues: readonly unknown[]
}

const PATCH_MUTATION_GUARD = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`

export async function patchNote(
  context: McpWriteContext,
  row: NoteRow,
  patch: NotePatch,
): Promise<Note> {
  const changes = await collectPatchChanges(context, row, patch)
  if (!changes.sets.length) return toNote(row)
  const now = Math.max(Date.now(), row.updated_at + 1)
  const statements = buildPatchStatements(context, row, changes, now)
  const [updated] = await context.env.DB.batch(statements)
  if (!updated?.meta.changes) {
    throw ApiError.conflict('This note was modified elsewhere', {
      server: await loadNote(context.env.DB, context.userId, row.id),
    })
  }
  const note = await loadNote(context.env.DB, context.userId, row.id)
  if (changes.hasContentChanged || changes.newTitle !== row.title) {
    await enqueueNoteIndex(context.env.DB, context.userId, row.id, 'embed')
  }
  await afterMutation(context)
  return note
}

async function collectPatchChanges(
  context: McpWriteContext,
  row: NoteRow,
  patch: NotePatch,
): Promise<PatchChanges> {
  const sets: string[] = []
  const binds: unknown[] = []
  let hasContentChanged = false
  let newTitle = row.title
  let newContent = row.content
  let newHash = row.content_hash

  if (patch.content !== undefined && patch.content !== row.content) {
    assertContentSize(patch.content)
    const hash = await sha256Hex(patch.content)
    if (hash !== row.content_hash) {
      hasContentChanged = true
      newHash = hash
      newContent = patch.content
      newTitle = patch.title === undefined ? row.title : resolveTitle(patch.title)
      pushContentSets(sets, binds, patch.content, hash, newTitle)
    }
  } else if (patch.title !== undefined && resolveTitle(patch.title) !== row.title) {
    newTitle = resolveTitle(patch.title)
    push(sets, binds, 'title', newTitle)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'folderId')) {
    push(sets, binds, 'folder_id', await resolveFolderId(context.env.DB, context.userId, patch.folderId))
  }
  if (patch.isPinned !== undefined) push(sets, binds, 'is_pinned', patch.isPinned ? 1 : 0)
  if (patch.isStarred !== undefined) push(sets, binds, 'is_starred', patch.isStarred ? 1 : 0)
  if (patch.isArchived !== undefined) push(sets, binds, 'is_archived', patch.isArchived ? 1 : 0)
  return { sets, binds, newTitle, newContent, newHash, hasContentChanged }
}

function pushContentSets(
  sets: string[],
  binds: unknown[],
  content: string,
  hash: string,
  title: string,
): void {
  const { words, chars } = countText(content)
  push(sets, binds, 'content', content)
  push(sets, binds, 'content_hash', hash)
  push(sets, binds, 'title', title)
  push(sets, binds, 'excerpt', deriveExcerpt(content))
  push(sets, binds, 'word_count', words)
  push(sets, binds, 'char_count', chars)
}

function buildPatchStatements(
  context: McpWriteContext,
  row: NoteRow,
  changes: PatchChanges,
  now: number,
): D1PreparedStatement[] {
  const nextRev = row.rev + 1
  push(changes.sets, changes.binds, 'updated_at', now)
  push(changes.sets, changes.binds, 'rev', nextRev)
  changes.binds.push(row.id, context.userId, row.rev)
  const update = context.env.DB.prepare(
    `UPDATE notes SET ${changes.sets.join(', ')}
      WHERE id = ?${changes.binds.length - 2} AND user_id = ?${changes.binds.length - 1} AND rev = ?${changes.binds.length}`,
  ).bind(...changes.binds)
  const base: PatchBase = {
    context,
    row,
    changes,
    now,
    nextRev,
    mutationGuard: PATCH_MUTATION_GUARD,
    mutationValues: [row.id, context.userId, nextRev, changes.newHash, changes.newTitle, now] as const,
  }
  const statements: D1PreparedStatement[] = [update]
  if (changes.hasContentChanged && row.content) statements.push(...buildVersionStatements(base))
  if (changes.hasContentChanged || changes.newTitle !== row.title) statements.push(...buildDerivedStatements(base))
  statements.push(buildChangeStatement(base))
  return statements
}

function buildVersionStatements(base: PatchBase): D1PreparedStatement[] {
  const { context, row, now, mutationGuard, mutationValues } = base
  return [
    context.env.DB.prepare(
      `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE ${shiftSqlPlaceholders(mutationGuard, 7)}`,
    ).bind(
      newId(), row.id, context.userId, row.title, row.content,
      utf8ByteLength(row.content), now, ...mutationValues,
    ),
    context.env.DB.prepare(
      `DELETE FROM note_versions WHERE note_id = ?1
         AND ${shiftSqlPlaceholders(mutationGuard, 1)}
         AND id NOT IN (
           SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
         )`,
    ).bind(row.id, ...mutationValues, LIMITS.versionsPerNote),
  ]
}

function buildDerivedStatements(base: PatchBase): D1PreparedStatement[] {
  const { context, row, changes, now, nextRev, mutationGuard, mutationValues } = base
  const statements = buildNoteDerivedStatements({
    db: context.env.DB,
    userId: context.userId,
    noteId: row.id,
    title: changes.newTitle,
    content: changes.newContent,
    ftsEnabled: context.ftsEnabled,
    titleChanged: changes.newTitle !== row.title,
    previousTitle: row.title,
    expectedRev: nextRev,
    expectedContentHash: changes.newHash,
    expectedTitle: changes.newTitle,
    expectedUpdatedAt: now,
  }).statements
  if (changes.hasContentChanged) {
    statements.push(
      context.env.DB.prepare(
        `DELETE FROM tags WHERE user_id = ?1 AND is_manual = 0
           AND ${shiftSqlPlaceholders(mutationGuard, 1)}
           AND id NOT IN (SELECT tag_id FROM note_tags)`,
      ).bind(context.userId, ...mutationValues),
    )
  }
  return statements
}

function buildChangeStatement(base: PatchBase): D1PreparedStatement {
  const { context, row, now, mutationGuard, mutationValues } = base
  return context.env.DB.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at)
     SELECT ?1, 'note', ?2, 'upsert', ?3
      WHERE ${shiftSqlPlaceholders(mutationGuard, 3)}`,
  ).bind(context.userId, row.id, now, ...mutationValues)
}

export async function afterMutation(context: McpWriteContext): Promise<void> {
  await broadcastUserCursor(
    context.env,
    context.userId,
    null,
    undefined,
    (task) => context.executionCtx.waitUntil(task),
  )
}

export async function loadNote(db: D1Database, userId: string, id: string): Promise<Note> {
  return toNote(await loadNoteRow(db, userId, id))
}

export async function loadNoteOrNull(db: D1Database, userId: string, id: string): Promise<Note | null> {
  const row = await db.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`,
  ).bind(id, userId).first<NoteRow>()
  return row ? toNote(row) : null
}

export async function loadNoteRow(db: D1Database, userId: string, id: string): Promise<NoteRow> {
  const row = await db.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`,
  ).bind(id, userId).first<NoteRow>()
  if (!row) throw ApiError.notFound('Note not found')
  return row
}

export function assertExpectedRevision(row: NoteRow, expectedRev: number): void {
  if (!Number.isInteger(expectedRev) || expectedRev < 1) {
    throw ApiError.badRequest('expected_rev must be a positive integer')
  }
  if (row.rev !== expectedRev) {
    throw ApiError.conflict('This note was modified elsewhere', { server: toNote(row) })
  }
}

export async function resolveFolderId(
  db: D1Database,
  userId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null
  const row = await db.prepare(
    `SELECT id FROM folders WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  ).bind(folderId, userId).first<{ id: string }>()
  if (!row) throw ApiError.badRequest('Folder not found')
  return row.id
}

export function resolveTitle(value: string): string {
  return truncateText(value.trim(), LIMITS.titleMaxLength)
}

function push(sets: string[], binds: unknown[], column: string, value: unknown): void {
  binds.push(value)
  sets.push(`${column} = ?${binds.length}`)
}