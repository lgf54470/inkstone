import { z } from "zod";
import { LIMITS } from "@shared/constants";
import { countText, deriveExcerpt, normalizeLinkKey, replaceWikiLinkTarget } from "@shared/markdown-utils";
import { sliceText, truncateText, utf8ByteLength } from "@shared/text-utils";
import type { Note, SortKey, SortOrder, ViewKind } from "@shared/types";
import { NOTE_COLUMNS_FULL, toNote, type NoteRow } from "../../db/rows";
import { buildNoteDerivedStatements, shiftSqlPlaceholders } from "../../db/writes";
import { fromBase64Url, fromUtf8, sha256Hex, toBase64Url, utf8 } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { isValidId, newId } from "../../lib/id";
import { clampInt } from "../../lib/request";
import { noteIndexQueueStatement } from "../../mcp/ai-search";

export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

export const SNAPSHOT_DIFF_THRESHOLD = 400

export interface NotesListCursor {
  view: ViewKind
  sort: SortKey
  order: SortOrder
  pinned: number
  value: string | number
  id: string
}

export type ParsedNotesListCursor =
  | { kind: 'first' }
  | { kind: 'legacy'; offset: number }
  | { kind: 'keyset'; cursor: NotesListCursor }

export const NOTE_VIEWS = new Set<ViewKind>(['all', 'recent', 'starred', 'pinned', 'shared', 'published', 'unfiled', 'archived', 'trash', 'folder', 'tag', 'untagged'])

export const NOTE_SORTS = new Set<SortKey>(['updated', 'created', 'title'])

export const createNoteSchema = z.object({
  id: z.string().refine(isValidId, 'id must be a valid note id').optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  folderId: z.string().nullable().optional(),
  isStarred: z.boolean().optional(),
})

export const patchNoteSchema = z.object({
  rev: z.number().int().min(1, 'rev must be a positive integer'),
  title: z.string().optional(),
  content: z.string().optional(),
  folderId: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  quiet: z.boolean().optional(),
  preserveVersion: z.boolean().optional(),
})

export const duplicateNoteSchema = z.object({
  id: z.string().refine(isValidId, 'id must be a valid note id').optional(),
})

export async function loadNote(db: D1Database, userId: string, id: string): Promise<Note> {
  return toNote(await loadNoteRow(db, userId, id))
}

export async function loadNoteRow(db: D1Database, userId: string, id: string): Promise<NoteRow> {
  const row = await db
    .prepare(`SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`)
    .bind(id, userId)
    .first<NoteRow>()
  if (!row) throw ApiError.notFound('Note not found')
  return row
}

export function linkContext(content: string, title: string): string {
  const needle = `[[${title}`
  const idx = content.toLowerCase().indexOf(needle.toLowerCase())
  if (idx < 0) return truncateText(content, 120).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, idx - 60)
  const end = Math.min(content.length, idx + needle.length + 90)
  return (
    (start > 0 ? '…' : '') +
    sliceText(content, start, end).replace(/\s+/g, ' ').trim() +
    (end < content.length ? '…' : '')
  )
}

export interface RewriteNoteRow {
  id: string
  title: string
  content: string
  content_hash: string
  rev: number
  updated_at: number
  deleted_at: number | null
}

export async function loadRewriteNotes(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<Map<string, RewriteNoteRow>> {
  const rows = new Map<string, RewriteNoteRow>()
  for (let index = 0; index < ids.length; index += 80) {
    const chunk = ids.slice(index, index + 80)
    const { results } = await db.prepare(
      `SELECT id, title, content, content_hash, rev, updated_at, deleted_at
         FROM notes WHERE user_id = ?1 AND id IN (${rewritePlaceholders(chunk.length)})`,
    ).bind(userId, ...chunk).all<RewriteNoteRow>()
    for (const row of results) rows.set(row.id, row)
  }
  return rows
}

export function rewritePlaceholders(count: number): string {
  return Array.from({ length: count }, (_, i) => `?${i + 2}`).join(', ')
}

export const MAX_INBOUND_WIKI_REWRITES = 25

export async function rewriteInboundWikiLinks(
  db: D1Database,
  userId: string,
  targetNoteId: string,
  fromTitle: string,
  toTitle: string,
  ftsEnabled: boolean,
): Promise<{ rewritten: number; skipped: number }> {
  const previousKey = normalizeLinkKey(fromTitle)
  const { results: allCandidates } = await db.prepare(
    `SELECT DISTINCT n.id FROM links l
      JOIN notes n ON n.id = l.source_note_id AND n.user_id = l.user_id
     WHERE l.user_id = ?1 AND l.target_note_id = ?2 AND l.target_key = ?3
       AND n.id <> ?2 AND n.deleted_at IS NULL`,
  ).bind(userId, targetNoteId, previousKey).all<{ id: string }>()
  const candidates = allCandidates.slice(0, MAX_INBOUND_WIKI_REWRITES)
  let rewritten = 0
  let skipped = allCandidates.length - candidates.length
  // Read every candidate once in a single batched query instead of one SELECT
  // per candidate; the guarded UPDATE still catches concurrent edits and only
  // conflicting candidates get a fresh single-row read on retry.
  const preloaded = await loadRewriteNotes(db, userId, candidates.map((candidate) => candidate.id))
  for (const candidate of candidates) {
    let isComplete = false
    let note: RewriteNoteRow | null = preloaded.get(candidate.id) ?? null
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!note || note.deleted_at !== null) {
        isComplete = true
        break
      }
      const content = replaceWikiLinkTarget(note.content, fromTitle, toTitle)
      if (content === note.content) {
        isComplete = true
        break
      }
      const hash = await sha256Hex(content)
      const { words, chars } = countText(content)
      const now = Math.max(Date.now(), note.updated_at + 1)
      const nextRev = note.rev + 1
      const guard = `EXISTS (SELECT 1 FROM notes
        WHERE id = ?1 AND user_id = ?2 AND rev = ?3
          AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
      const guardValues = [note.id, userId, nextRev, hash, note.title, now] as const
      const statements: D1PreparedStatement[] = [
        db.prepare(
          `UPDATE notes SET content = ?1, excerpt = ?2, word_count = ?3, char_count = ?4,
             content_hash = ?5, rev = ?6, updated_at = ?7
            WHERE id = ?8 AND user_id = ?9 AND rev = ?10 AND content_hash = ?11`,
        ).bind(content, deriveExcerpt(content), words, chars, hash, nextRev, now,
          note.id, userId, note.rev, note.content_hash),
        db.prepare(
          `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${shiftSqlPlaceholders(guard, 7)}`,
        ).bind(newId(), note.id, userId, note.title, note.content,
          utf8ByteLength(note.content), now, ...guardValues),
        db.prepare(
          `DELETE FROM note_versions WHERE note_id = ?1
             AND ${shiftSqlPlaceholders(guard, 1)}
             AND id NOT IN (SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8)`,
        ).bind(note.id, ...guardValues, LIMITS.versionsPerNote),
      ]
      statements.push(...buildNoteDerivedStatements({
        db,
        userId,
        noteId: note.id,
        title: note.title,
        content,
        ftsEnabled,
        expectedRev: nextRev,
        expectedContentHash: hash,
        expectedTitle: note.title,
        expectedUpdatedAt: now,
      }).statements)
      statements.push(noteIndexQueueStatement(db, userId, note.id, 'embed', now))
      statements.push(
        db.prepare(
          `INSERT INTO changes (user_id, entity, entity_id, op, at)
           SELECT ?1, 'note', ?2, 'upsert', ?3 WHERE ${shiftSqlPlaceholders(guard, 3)}`,
        ).bind(userId, note.id, now, ...guardValues),
      )
      const [updated] = await db.batch(statements)
      if (updated?.meta.changes) {
        rewritten++
        isComplete = true
        break
      }
      // The guarded write was lost to a concurrent edit: re-read just this
      // note and retry with fresh state.
      note = await db.prepare(
        `SELECT id, title, content, content_hash, rev, updated_at, deleted_at
           FROM notes WHERE id = ?1 AND user_id = ?2`,
      ).bind(candidate.id, userId).first<RewriteNoteRow>()
    }
    if (!isComplete) skipped++
  }
  return { rewritten, skipped }
}

export function sameTagSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((name) => set.has(name))
}

export interface ColumnPatch {
  column: string
  value: unknown
}

export function applyPatchRow(
  row: NoteRow,
  patches: readonly ColumnPatch[],
  tagNames: string[] | null,
): NoteRow {
  const next: NoteRow = { ...row }
  for (const { column, value } of patches) {
    switch (column) {
      case 'content':
        next.content = value as string
        break
      case 'content_hash':
        next.content_hash = value as string
        break
      case 'title':
        next.title = value as string
        break
      case 'excerpt':
        next.excerpt = value as string
        break
      case 'word_count':
        next.word_count = value as number
        break
      case 'char_count':
        next.char_count = value as number
        break
      case 'folder_id':
        next.folder_id = value as string | null
        break
      case 'is_pinned':
        next.is_pinned = value as number
        break
      case 'is_starred':
        next.is_starred = value as number
        break
      case 'is_archived':
        next.is_archived = value as number
        break
      case 'updated_at':
        next.updated_at = value as number
        break
      case 'rev':
        next.rev = value as number
        break
      default:
        break
    }
  }
  if (tagNames !== null) next.tag_names = tagNames.join('\u0001')
  return next
}

export function restoredVersionTitle(title: string): string {
  return resolveNoteTitle(title)
}

export function resolveNoteTitle(title: string | undefined, current = ''): string {
  return title === undefined ? current : truncateText(title.trim(), LIMITS.titleMaxLength)
}

export function nextNotesCursor(offset: number, returned: number, total: number): string | null {
  const next = offset + returned
  return returned > 0 && next < total ? String(next) : null
}

export function encodeNotesListCursor(
  row: NoteRow,
  view: ViewKind,
  sort: SortKey,
  order: SortOrder,
): string {
  const value = view === 'trash'
    ? row.deleted_at
    : sort === 'created'
      ? row.created_at
      : sort === 'title'
        ? row.title
        : row.updated_at
  const payload: NotesListCursor = {
    view,
    sort,
    order,
    pinned: view === 'trash' ? 0 : row.is_pinned,
    value: value ?? 0,
    id: row.id,
  }
  return `n1.${toBase64Url(utf8(JSON.stringify(payload)))}`
}

export function parseNotesListCursor(
  raw: string | undefined,
  view: ViewKind,
  sort: SortKey,
  order: SortOrder,
): ParsedNotesListCursor {
  if (!raw) return { kind: 'first' }
  if (/^\d+$/.test(raw)) {
    return { kind: 'legacy', offset: clampInt(raw, 0, 1_000_000, 0) }
  }
  if (raw.length > 4096 || !raw.startsWith('n1.')) throw ApiError.badRequest('Invalid notes cursor')
  try {
    const value = JSON.parse(fromUtf8(fromBase64Url(raw.slice(3)))) as Partial<NotesListCursor>
    const expectedTitle = view !== 'trash' && sort === 'title'
    const validValue = expectedTitle
      ? typeof value.value === 'string' && value.value.length <= LIMITS.titleMaxLength
      : typeof value.value === 'number' && Number.isSafeInteger(value.value) && value.value >= 0
    if (
      value.view !== view ||
      value.sort !== sort ||
      value.order !== order ||
      (value.pinned !== 0 && value.pinned !== 1) ||
      !validValue ||
      typeof value.id !== 'string' ||
      value.id.length < 1 ||
      value.id.length > 128
    ) {
      throw new Error('invalid')
    }
    return { kind: 'keyset', cursor: value as NotesListCursor }
  } catch {
    throw ApiError.badRequest('Invalid notes cursor')
  }
}

export async function resolveFolderId(
  db: D1Database,
  userId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null
  const row = await db
    .prepare(`SELECT id FROM folders WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`)
    .bind(folderId, userId)
    .first<{ id: string }>()
  if (!row) throw ApiError.badRequest('Folder not found')
  return row.id
}
