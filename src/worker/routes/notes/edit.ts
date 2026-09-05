import { Hono } from "hono";
import { countText, deriveExcerpt, extractTags, normalizeLinkKey } from "@shared/markdown-utils";
import { utf8ByteLength } from "@shared/text-utils";
import type { AppBindings } from "../../env";
import { NOTE_COLUMNS_FULL, splitTags, toNote, type NoteRow } from "../../db/rows";
import { buildNoteDerivedStatements, LINK_TARGET_SUBQUERY, shiftSqlPlaceholders } from "../../db/writes";
import { sha256Hex } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { broadcastCursor, scheduleFtsDrain } from "../../lib/notify";
import { assertContentSize, JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { enqueueNoteIndex } from "../../mcp/ai-search";
import {
  SNAPSHOT_INTERVAL_MS,
  SNAPSHOT_DIFF_THRESHOLD,
  patchNoteSchema,
  loadNote,
  rewriteInboundWikiLinks,
  sameTagSet,
  applyPatchRow,
  resolveNoteTitle,
  resolveFolderId,
  guardedChangeStatement,
  trimNoteVersionsStatement,
  type ColumnPatch,
  type PatchNoteBody,
} from './helpers';

export function registerNotesEditRoutes(notesRoutes: Hono<AppBindings>): void {
  notesRoutes.patch('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const { ftsEnabled } = c.get('database')
    const body = await readJsonValidated(c, patchNoteSchema, JSON_BODY_LIMITS.note)
    const row = await loadNoteRowOrDeleted(c.env.DB, userId, id)
    if (body.rev !== row.rev) {
      throw ApiError.conflict('This note was modified elsewhere', { server: toNote(row) })
    }
    const now = Math.max(Date.now(), row.updated_at + 1)
    const { patches, hasContentChanged, newTitle, newContent, newHash } = await collectNotePatches(c.env.DB, userId, row, body)
    if (!patches.length) return c.json(toNote(row))
    const nextRev = row.rev + 1
    patches.push({ column: 'updated_at', value: now }, { column: 'rev', value: nextRev })
    const mutationGuard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
    const mutationValues = [id, userId, nextRev, newHash, newTitle, now] as const
    const { statements, tags } = notePatchStatements(c.env.DB, {
      userId, id, row, body, patches, hasContentChanged,
      newTitle, newContent, newHash, nextRev, now, ftsEnabled,
      mutationGuard, mutationValues,
    })
    const results = await c.env.DB.batch(statements)
    const updateResult = results[0]
    if (!updateResult?.meta.changes) {
      const current = await loadNote(c.env.DB, userId, id)
      throw ApiError.conflict('This note was modified elsewhere', { server: current })
    }
    const changeResult = results.at(-1) as D1Result<{ seq: number }> | undefined
    const hasRewrittenInbound = newTitle !== row.title
      ? await rewriteInboundAfterRename(c.env.DB, { userId, id, fromTitle: row.title, toTitle: newTitle, nextRev, now, ftsEnabled })
      : false
    await broadcastCursor(c, hasRewrittenInbound ? undefined : changeResult?.results?.[0]?.seq)
    if (hasContentChanged || newTitle !== row.title) {
      await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
      scheduleFtsDrain(c)
    }
    const nextTags = hasContentChanged ? (tags ?? extractTags(newContent)) : null
    return c.json(toNote(applyPatchRow(row, patches, nextTags)))
  })
}

async function loadNoteRowOrDeleted(db: D1Database, userId: string, id: string): Promise<NoteRow> {
  const row = await db
    .prepare(`SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`)
    .bind(id, userId)
    .first<NoteRow>()
  if (!row) {
    const deletion = await db
      .prepare(`SELECT MAX(seq) AS seq FROM changes
        WHERE user_id = ?1 AND entity = 'note' AND entity_id = ?2 AND op = 'delete'`)
      .bind(userId, id)
      .first<{ seq: number | null }>()
    throw ApiError.notFound('Note not found', { deletionCursor: deletion?.seq ?? null })
  }
  return row
}

function notePatchStatements(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  body: PatchNoteBody
  patches: ColumnPatch[]
  hasContentChanged: boolean
  newTitle: string
  newContent: string
  newHash: string
  nextRev: number
  now: number
  ftsEnabled: boolean
  mutationGuard: string
  mutationValues: readonly unknown[]
}): { statements: D1PreparedStatement[]; tags: string[] | null } {
  const { userId, id, row, body, patches, hasContentChanged, newTitle, newContent, newHash, nextRev, now, ftsEnabled, mutationGuard, mutationValues } = params
  const statements: D1PreparedStatement[] = [patchUpdateStatement(db, patches, id, userId, body.rev)]
  if (hasContentChanged && !body.quiet && row.content) {
    const bigChange = Math.abs(newContent.length - row.content.length) >= SNAPSHOT_DIFF_THRESHOLD
    statements.push(
      noteSnapshotStatement(db, {
        id, userId, row, now, mutationGuard, mutationValues,
        preserveVersion: body.preserveVersion ?? false, bigChange,
      }),
      trimNoteVersionsStatement(db, id, mutationGuard, mutationValues),
    )
  }
  const derived = notePatchDerived(db, {
    userId, id, row, newTitle, newContent, newHash, hasContentChanged,
    nextRev, now, ftsEnabled, mutationGuard, mutationValues,
  })
  statements.push(...derived.statements)
  statements.push(guardedChangeStatement(db, {
    userId, entityId: id, op: 'upsert', now,
    guard: mutationGuard, guardValues: mutationValues, returningSeq: true,
  }))
  return { statements, tags: derived.tags }
}

async function collectNotePatches(
  db: D1Database,
  userId: string,
  row: NoteRow,
  body: PatchNoteBody,
): Promise<{ patches: ColumnPatch[]; hasContentChanged: boolean; newTitle: string; newContent: string; newHash: string }> {
  const patches: ColumnPatch[] = []
  const pushPatch = (column: string, value: unknown) => {
    patches.push({ column, value })
  }
  let hasContentChanged = false
  let newTitle = row.title
  let newContent = row.content
  let newHash = row.content_hash
  const resolvedTitle = resolveNoteTitle(body.title, row.title)

  if (typeof body.content === 'string' && body.content !== row.content) {
    assertContentSize(body.content)
    const hash = await sha256Hex(body.content)
    if (hash !== row.content_hash) {
      hasContentChanged = true
      newHash = hash
      newContent = body.content
      newTitle = resolvedTitle
      const { words, chars } = countText(body.content)
      pushPatch('content', body.content)
      pushPatch('content_hash', hash)
      pushPatch('title', newTitle)
      pushPatch('excerpt', deriveExcerpt(body.content))
      pushPatch('word_count', words)
      pushPatch('char_count', chars)
    }
  } else if (resolvedTitle !== row.title) {
    newTitle = resolvedTitle
    pushPatch('title', newTitle)
  }

  if (body.folderId !== undefined) {
    pushPatch('folder_id', await resolveFolderId(db, userId, body.folderId))
  }
  if (typeof body.isPinned === 'boolean') pushPatch('is_pinned', body.isPinned ? 1 : 0)
  if (typeof body.isStarred === 'boolean') pushPatch('is_starred', body.isStarred ? 1 : 0)
  if (typeof body.isArchived === 'boolean') pushPatch('is_archived', body.isArchived ? 1 : 0)
  return { patches, hasContentChanged, newTitle, newContent, newHash }
}

function patchUpdateStatement(
  db: D1Database,
  patches: readonly ColumnPatch[],
  id: string,
  userId: string,
  rev: number,
): D1PreparedStatement {
  // The SQL SET fragments derive from the same patches list that answers
  // the local row projection, so the two can never drift apart.
  const sets = patches.map((patch, index) => `${patch.column} = ?${index + 1}`)
  const binds: unknown[] = patches.map((patch) => patch.value)
  binds.push(id, userId, rev)
  return db.prepare(
    `UPDATE notes SET ${sets.join(', ')}
      WHERE id = ?${binds.length - 2} AND user_id = ?${binds.length - 1} AND rev = ?${binds.length}`,
  ).bind(...binds)
}

function noteSnapshotStatement(db: D1Database, params: {
  id: string
  userId: string
  row: NoteRow
  now: number
  mutationGuard: string
  mutationValues: readonly unknown[]
  preserveVersion: boolean
  bigChange: boolean
}): D1PreparedStatement {
  const { id, userId, row, now, mutationGuard, mutationValues, preserveVersion, bigChange } = params
  return db.prepare(
    `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
      WHERE ${shiftSqlPlaceholders(mutationGuard, 7)}
        AND (?14 = 1
             OR NOT EXISTS (SELECT 1 FROM note_versions WHERE note_id = ?2)
             OR ?15 - COALESCE((SELECT MAX(created_at) FROM note_versions WHERE note_id = ?2), 0) > ?16
             OR ?17 = 1)`,
  ).bind(
    newId(), id, userId, row.title, row.content, utf8ByteLength(row.content), now,
    ...mutationValues,
    preserveVersion ? 1 : 0, now, SNAPSHOT_INTERVAL_MS, bigChange ? 1 : 0,
  )
}

function notePatchDerived(db: D1Database, params: {
  userId: string
  id: string
  row: NoteRow
  newTitle: string
  newContent: string
  newHash: string
  hasContentChanged: boolean
  nextRev: number
  now: number
  ftsEnabled: boolean
  mutationGuard: string
  mutationValues: readonly unknown[]
}): { statements: D1PreparedStatement[]; tags: string[] | null } {
  const { userId, id, row, newTitle, newContent, newHash, hasContentChanged, nextRev, now, ftsEnabled, mutationGuard, mutationValues } = params
  if (row.deleted_at === null && (hasContentChanged || newTitle !== row.title)) {
    const derived = buildNoteDerivedStatements({
      db,
      userId,
      noteId: id,
      title: newTitle,
      content: newContent,
      ftsEnabled,
      titleChanged: newTitle !== row.title,
      previousTitle: row.title,
      expectedRev: nextRev,
      expectedContentHash: newHash,
      expectedTitle: newTitle,
      expectedUpdatedAt: now,
    })
    const statements = [...derived.statements]
    if (hasContentChanged && !sameTagSet(splitTags(row.tag_names), derived.tags)) {
      statements.push(
        db.prepare(
          `DELETE FROM tags WHERE user_id = ?1 AND is_manual = 0
             AND ${shiftSqlPlaceholders(mutationGuard, 1)}
             AND id NOT IN (SELECT tag_id FROM note_tags)`,
        ).bind(userId, ...mutationValues),
      )
    }
    return { statements, tags: derived.tags }
  }
  return { statements: [], tags: null }
}

async function rewriteInboundAfterRename(db: D1Database, params: {
  userId: string
  id: string
  fromTitle: string
  toTitle: string
  nextRev: number
  now: number
  ftsEnabled: boolean
}): Promise<boolean> {
  const { userId, id, fromTitle, toTitle, nextRev, now, ftsEnabled } = params
  const ambiguous = await db.prepare(
    `SELECT 1 AS found FROM notes
      WHERE user_id = ?1 AND id <> ?2 AND deleted_at IS NULL AND title_key IN (?3, ?4)
      LIMIT 1`,
  ).bind(
    userId,
    id,
    normalizeLinkKey(fromTitle),
    normalizeLinkKey(toTitle),
  ).first<{ found: number }>()
  if (ambiguous) {
    await db.prepare(
      `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
        WHERE user_id = ?1 AND target_key = ?2
          AND EXISTS (SELECT 1 FROM notes
            WHERE id = ?3 AND user_id = ?1 AND rev = ?4
              AND title = ?5 AND updated_at = ?6 AND deleted_at IS NULL)`,
    ).bind(
      userId,
      normalizeLinkKey(fromTitle),
      id,
      nextRev,
      toTitle,
      now,
    ).run()
    return false
  }
  const rewrite = await rewriteInboundWikiLinks(
    db,
    userId,
    id,
    fromTitle,
    toTitle,
    ftsEnabled,
  )
  if (rewrite.skipped) {
    console.warn(`Could not update ${rewrite.skipped} wiki-link source notes after renaming note ${id}`)
  }
  return rewrite.rewritten > 0
}