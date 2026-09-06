import { mergeSettings } from "@shared/constants";
import { countText, deriveExcerpt, deriveTitle } from "@shared/markdown-utils";
import type { Note } from "@shared/types";
import type { NoteRow } from "../../db/rows";
import { buildNoteDerivedStatements, LINK_TARGET_SUBQUERY, shiftSqlPlaceholders } from "../../db/writes";
import type { Env } from "../../env";
import { sha256Hex } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { isValidId, newId } from "../../lib/id";
import { assertContentSize } from "../../lib/request";
import { enqueueNoteIndex } from "../ai-search";
import { runIdempotent } from "../operations";
import { applyEdit, buildMcpNoteContent, type NoteEditOperation } from './content';
import { afterMutation, assertExpectedRevision, loadNote, loadNoteOrNull, loadNoteRow, patchNote, resolveFolderId, resolveTitle, type McpWriteContext } from './patch';

export type { McpWriteContext } from './patch';

interface CreateNoteInput {
  operationId: string
  noteId?: string
  title?: string
  content?: string
  folderId?: string | null
}

interface InsertValues {
  title: string
  content: string
  folderId: string | null
  excerpt: string
  words: number
  chars: number
  hash: string
  now: number
}

export async function createMcpNote(
  context: McpWriteContext,
  input: CreateNoteInput,
): Promise<Note> {
  const id = input.noteId ?? newId()
  if (!isValidId(id)) throw ApiError.badRequest('note_id must be a valid Inkstone note id')
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'create_note',
    request: input,
    recovery: { noteId: id },
    recover: async (recovery) => {
      const noteId = typeof recovery?.noteId === 'string' ? recovery.noteId : ''
      return noteId ? loadNoteOrNull(context.env.DB, context.userId, noteId) : null
    },
    execute: async () => insertMcpNote(context, input, id),
  })
}

async function insertMcpNote(
  context: McpWriteContext,
  input: CreateNoteInput,
  id: string,
): Promise<Note> {
  const rawContent = input.content ?? ''
  const title = resolveTitle(input.title ?? deriveTitle(rawContent))
  // Blank MCP-created notes follow the user's configured new-note template.
  const content = buildMcpNoteContent(input.content, title, await loadUserNewNoteTemplate(context.env.DB, context.userId))
  assertContentSize(content)
  const folderId = await resolveFolderId(context.env.DB, context.userId, input.folderId ?? null)
  const now = Date.now()
  const excerpt = deriveExcerpt(content)
  const { words, chars } = countText(content)
  const hash = await sha256Hex(content)
  const collision = await context.env.DB.prepare(`SELECT user_id FROM notes WHERE id = ?1`)
    .bind(id)
    .first<{ user_id: string }>()
  if (collision) throw ApiError.conflict('This note id is already in use')

  const values: InsertValues = { title, content, folderId, excerpt, words, chars, hash, now }
  await context.env.DB.batch(buildInsertStatements(context, id, values))
  const note = await loadNote(context.env.DB, context.userId, id)
  await enqueueNoteIndex(context.env.DB, context.userId, id, 'embed')
  await afterMutation(context)
  return note
}

function buildInsertStatements(
  context: McpWriteContext,
  id: string,
  values: InsertValues,
): D1PreparedStatement[] {
  const insert = context.env.DB.prepare(
    `INSERT INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, 0, 0, 0, ?9, ?10, ?11, ?11)`,
  ).bind(id, context.userId, values.folderId, values.title, values.content, values.excerpt, values.words, values.chars, values.now, values.hash, values.now)
  const derived = buildNoteDerivedStatements({
    db: context.env.DB,
    userId: context.userId,
    noteId: id,
    title: values.title,
    content: values.content,
    ftsEnabled: context.ftsEnabled,
    expectedRev: 1,
    expectedContentHash: values.hash,
    expectedTitle: values.title,
    expectedUpdatedAt: values.now,
  }).statements
  const change = context.env.DB.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at)
     SELECT ?1, 'note', ?2, 'upsert', ?3
      WHERE EXISTS (SELECT 1 FROM notes
        WHERE id = ?2 AND user_id = ?1 AND rev = 1 AND content_hash = ?4)`,
  ).bind(context.userId, id, values.now, values.hash)
  return [insert, ...derived, change]
}

export async function editMcpNote(
  context: McpWriteContext,
  input: {
    operationId: string
    noteId: string
    expectedRev: number
    operation: NoteEditOperation
    text: string
    oldText?: string
    section?: string
    title?: string
  },
): Promise<Note> {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'edit_note',
    request: input,
    recovery: { noteId: input.noteId, expectedRev: input.expectedRev },
    execute: async () => {
      const current = await loadNoteRow(context.env.DB, context.userId, input.noteId)
      assertExpectedRevision(current, input.expectedRev)
      if (current.deleted_at !== null) throw ApiError.notFound('The note is in the trash')
      const content = applyEdit(current.content, input)
      return patchNote(context, current, {
        content,
        ...(input.title !== undefined ? { title: input.title } : {}),
      })
    },
  })
}

export async function organizeMcpNote(
  context: McpWriteContext,
  input: {
    operationId: string
    noteId: string
    expectedRev: number
    folderId?: string | null
    starred?: boolean
    archived?: boolean
    pinned?: boolean
  },
): Promise<Note> {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'organize_note',
    request: input,
    recovery: { noteId: input.noteId, expectedRev: input.expectedRev },
    execute: async () => {
      const current = await loadNoteRow(context.env.DB, context.userId, input.noteId)
      assertExpectedRevision(current, input.expectedRev)
      if (current.deleted_at !== null) throw ApiError.notFound('The note is in the trash')
      return patchNote(context, current, {
        ...(Object.prototype.hasOwnProperty.call(input, 'folderId') ? { folderId: input.folderId } : {}),
        ...(input.starred !== undefined ? { isStarred: input.starred } : {}),
        ...(input.archived !== undefined ? { isArchived: input.archived } : {}),
        ...(input.pinned !== undefined ? { isPinned: input.pinned } : {}),
      })
    },
  })
}

export async function trashMcpNote(
  context: McpWriteContext,
  input: { operationId: string; noteId: string; expectedRev: number },
): Promise<Note> {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'trash_note',
    request: input,
    recovery: { noteId: input.noteId, expectedRev: input.expectedRev },
    execute: async () => {
      const row = await loadNoteRow(context.env.DB, context.userId, input.noteId)
      assertExpectedRevision(row, input.expectedRev)
      if (row.deleted_at !== null) throw ApiError.notFound('The note is already in the trash')
      return trashNoteRow(context, row)
    },
  })
}

async function trashNoteRow(context: McpWriteContext, row: NoteRow): Promise<Note> {
  const [updated] = await context.env.DB.batch(buildTrashStatements(context, row))
  if (!updated?.meta.changes) {
    throw ApiError.conflict('This note was modified elsewhere', {
      server: await loadNote(context.env.DB, context.userId, row.id),
    })
  }
  const note = await loadNote(context.env.DB, context.userId, row.id)
  await afterMutation(context)
  return note
}

function buildTrashStatements(
  context: McpWriteContext,
  row: NoteRow,
): D1PreparedStatement[] {
  const now = Math.max(Date.now(), row.updated_at + 1)
  const nextRev = row.rev + 1
  const guard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3 AND deleted_at IS NOT NULL)`
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      `UPDATE notes SET deleted_at = ?1, updated_at = ?1, rev = ?2
        WHERE id = ?3 AND user_id = ?4 AND rev = ?5 AND deleted_at IS NULL`,
    ).bind(now, nextRev, row.id, context.userId, row.rev),
    context.env.DB.prepare(
      `DELETE FROM links WHERE source_note_id = ?1 AND ${shiftSqlPlaceholders(guard, 1)}`,
    ).bind(row.id, row.id, context.userId, nextRev),
    context.env.DB.prepare(
      `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
        WHERE target_note_id = ?1 AND user_id = ?2 AND ${shiftSqlPlaceholders(guard, 2)}`,
    ).bind(row.id, context.userId, row.id, context.userId, nextRev),
  ]
  if (context.ftsEnabled) {
    statements.push(
      context.env.DB.prepare(
        `DELETE FROM notes_fts WHERE note_id = ?1 AND ${shiftSqlPlaceholders(guard, 1)}`,
      ).bind(row.id, row.id, context.userId, nextRev),
    )
  }
  statements.push(
    context.env.DB.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3 WHERE ${shiftSqlPlaceholders(guard, 3)}`,
    ).bind(context.userId, row.id, now, row.id, context.userId, nextRev),
  )
  return statements
}

export async function restoreMcpNote(
  context: McpWriteContext,
  input: { operationId: string; noteId: string; expectedRev: number },
): Promise<Note> {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'restore_note',
    request: input,
    recovery: { noteId: input.noteId, expectedRev: input.expectedRev },
    execute: async () => {
      const row = await loadNoteRow(context.env.DB, context.userId, input.noteId)
      assertExpectedRevision(row, input.expectedRev)
      if (row.deleted_at === null) throw ApiError.badRequest('The note is not in the trash')
      const now = Math.max(Date.now(), row.updated_at + 1)
      const nextRev = row.rev + 1
      const update = context.env.DB.prepare(
        `UPDATE notes SET deleted_at = NULL, updated_at = ?1, rev = ?2
          WHERE id = ?3 AND user_id = ?4 AND rev = ?5 AND deleted_at IS NOT NULL`,
      ).bind(now, nextRev, row.id, context.userId, row.rev)
      const derived = buildNoteDerivedStatements({
        db: context.env.DB,
        userId: context.userId,
        noteId: row.id,
        title: row.title,
        content: row.content,
        ftsEnabled: context.ftsEnabled,
        expectedRev: nextRev,
        expectedContentHash: row.content_hash,
        expectedTitle: row.title,
        expectedUpdatedAt: now,
      }).statements
      const change = context.env.DB.prepare(
        `INSERT INTO changes (user_id, entity, entity_id, op, at)
         SELECT ?1, 'note', ?2, 'upsert', ?3
          WHERE EXISTS (SELECT 1 FROM notes
            WHERE id = ?2 AND user_id = ?1 AND rev = ?4 AND deleted_at IS NULL)`,
      ).bind(context.userId, row.id, now, nextRev)
      const [updated] = await context.env.DB.batch([update, ...derived, change])
      if (!updated?.meta.changes) {
        throw ApiError.conflict('This note was modified elsewhere', {
          server: await loadNote(context.env.DB, context.userId, row.id),
        })
      }
      const note = await loadNote(context.env.DB, context.userId, row.id)
      await enqueueNoteIndex(context.env.DB, context.userId, row.id, 'embed')
      await afterMutation(context)
      return note
    },
  })
}

async function loadUserNewNoteTemplate(db: Env['DB'], userId: string): Promise<string> {
  const row = await db.prepare(`SELECT settings FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ settings: string }>()
  try {
    const value = JSON.parse(row?.settings ?? '{}') as unknown
    return mergeSettings(value).notes.newNoteTemplate
  } catch {
    return mergeSettings(null).notes.newNoteTemplate
  }
}