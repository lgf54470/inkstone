import { Hono } from "hono";
import { LIMITS } from "@shared/constants";
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
import { SNAPSHOT_INTERVAL_MS } from './helpers';
import { SNAPSHOT_DIFF_THRESHOLD } from './helpers';
import { patchNoteSchema } from './helpers';
import { loadNote } from './helpers';
import { rewriteInboundWikiLinks } from './helpers';
import { sameTagSet } from './helpers';
import { ColumnPatch } from './helpers';
import { applyPatchRow } from './helpers';
import { resolveNoteTitle } from './helpers';
import { resolveFolderId } from './helpers';

export function registerNotesEditRoutes(notesRoutes: Hono<AppBindings>): void {
notesRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { ftsEnabled } = c.get('database')
  const body = await readJsonValidated(c, patchNoteSchema, JSON_BODY_LIMITS.note)

  const row = await c.env.DB.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n WHERE n.id = ?1 AND n.user_id = ?2`,
  )
    .bind(id, userId)
    .first<NoteRow>()
  if (!row) {
    const deletion = await c.env.DB.prepare(
      `SELECT MAX(seq) AS seq FROM changes
        WHERE user_id = ?1 AND entity = 'note' AND entity_id = ?2 AND op = 'delete'`,
    )
      .bind(userId, id)
      .first<{ seq: number | null }>()
    throw ApiError.notFound('Note not found', { deletionCursor: deletion?.seq ?? null })
  }

  if (body.rev !== row.rev) {
    throw ApiError.conflict('This note was modified elsewhere', { server: toNote(row) })
  }

  const now = Math.max(Date.now(), row.updated_at + 1)
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
    pushPatch('folder_id', await resolveFolderId(c.env.DB, userId, body.folderId))
  }
  if (typeof body.isPinned === 'boolean') pushPatch('is_pinned', body.isPinned ? 1 : 0)
  if (typeof body.isStarred === 'boolean') pushPatch('is_starred', body.isStarred ? 1 : 0)
  if (typeof body.isArchived === 'boolean') pushPatch('is_archived', body.isArchived ? 1 : 0)

  if (!patches.length) return c.json(toNote(row))

  pushPatch('updated_at', now)
  const nextRev = row.rev + 1
  pushPatch('rev', nextRev)
  const mutationGuard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
  const mutationValues = [id, userId, nextRev, newHash, newTitle, now] as const

  // The SQL SET fragments derive from the same patches list that answers
  // the local row projection, so the two can never drift apart.
  const sets = patches.map((patch, index) => `${patch.column} = ?${index + 1}`)
  const binds: unknown[] = patches.map((patch) => patch.value)
  binds.push(id, userId, body.rev)
  const update = c.env.DB.prepare(
    `UPDATE notes SET ${sets.join(', ')}
      WHERE id = ?${binds.length - 2} AND user_id = ?${binds.length - 1} AND rev = ?${binds.length}`,
  ).bind(...binds)

  const statements: D1PreparedStatement[] = [update]
  let derivedTags: string[] | null = null

  if (hasContentChanged && !body.quiet && row.content) {
    const bigChange = Math.abs(newContent.length - row.content.length) >= SNAPSHOT_DIFF_THRESHOLD
    statements.push(
      c.env.DB.prepare(
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
        body.preserveVersion ? 1 : 0, now, SNAPSHOT_INTERVAL_MS, bigChange ? 1 : 0,
      ),
      c.env.DB.prepare(
        `DELETE FROM note_versions WHERE note_id = ?1
           AND ${shiftSqlPlaceholders(mutationGuard, 1)}
           AND id NOT IN (
             SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
           )`,
      ).bind(id, ...mutationValues, LIMITS.versionsPerNote),
    )
  }

  if (row.deleted_at === null && (hasContentChanged || newTitle !== row.title)) {
    const derived = buildNoteDerivedStatements({
      db: c.env.DB,
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
    statements.push(...derived.statements)
    derivedTags = derived.tags
    if (hasContentChanged && !sameTagSet(splitTags(row.tag_names), derived.tags)) {
      statements.push(
        c.env.DB.prepare(
          `DELETE FROM tags WHERE user_id = ?1 AND is_manual = 0
             AND ${shiftSqlPlaceholders(mutationGuard, 1)}
             AND id NOT IN (SELECT tag_id FROM note_tags)`,
        ).bind(userId, ...mutationValues),
      )
    }
  }

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3
        WHERE ${shiftSqlPlaceholders(mutationGuard, 3)}
       RETURNING seq`,
    ).bind(userId, id, now, ...mutationValues),
  )

  const results = await c.env.DB.batch(statements)
  const updateResult = results[0]
  if (!updateResult?.meta.changes) {
    const current = await loadNote(c.env.DB, userId, id)
    throw ApiError.conflict('This note was modified elsewhere', { server: current })
  }
  const changeResult = results.at(-1) as D1Result<{ seq: number }> | undefined
  let hasRewrittenInbound = false
  if (newTitle !== row.title) {
    const ambiguous = await c.env.DB.prepare(
      `SELECT 1 AS found FROM notes
        WHERE user_id = ?1 AND id <> ?2 AND deleted_at IS NULL AND title_key IN (?3, ?4)
        LIMIT 1`,
    ).bind(
      userId,
      id,
      normalizeLinkKey(row.title),
      normalizeLinkKey(newTitle),
    ).first<{ found: number }>()
    if (!ambiguous) {
      const rewrite = await rewriteInboundWikiLinks(
        c.env.DB,
        userId,
        id,
        row.title,
        newTitle,
        ftsEnabled,
      )
      if (rewrite.skipped) {
        console.warn(`Could not update ${rewrite.skipped} wiki-link source notes after renaming note ${id}`)
      }
      hasRewrittenInbound = rewrite.rewritten > 0
    } else {
      await c.env.DB.prepare(
        `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
          WHERE user_id = ?1 AND target_key = ?2
            AND EXISTS (SELECT 1 FROM notes
              WHERE id = ?3 AND user_id = ?1 AND rev = ?4
                AND title = ?5 AND updated_at = ?6 AND deleted_at IS NULL)`,
      ).bind(
        userId,
        normalizeLinkKey(row.title),
        id,
        nextRev,
        newTitle,
        now,
      ).run()
    }
  }
  await broadcastCursor(c, hasRewrittenInbound ? undefined : changeResult?.results?.[0]?.seq)
  if (hasContentChanged || newTitle !== row.title) {
    await enqueueNoteIndex(c.env.DB, userId, id, 'embed')
    scheduleFtsDrain(c)
  }
  const nextTags = hasContentChanged ? (derivedTags ?? extractTags(newContent)) : null
  return c.json(toNote(applyPatchRow(row, patches, nextTags)))
})
}

