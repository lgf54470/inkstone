import { z } from "zod";
import { LIMITS } from "@shared/constants";
import { countText, deriveExcerpt, replaceTagInContent } from "@shared/markdown-utils";
import { organizerColorOrNull } from "@shared/organizer-colors";
import { utf8ByteLength } from "@shared/text-utils";
import type { AppBindings } from "../../env";
import { toTag, type TagRow } from "../../db/rows";
import { buildNoteDerivedStatements, shiftSqlPlaceholders } from "../../db/writes";
import { sha256Hex } from "../../lib/encoding";
import { ApiError } from "../../lib/errors";
import { isValidId, newId } from "../../lib/id";

export const createTagSchema = z.object({
  id: z.string().refine(isValidId, 'id must be a valid tag id').optional(),
  name: z.string(),
  color: z.string().nullable().refine((value) => value === null || Boolean(organizerColorOrNull(value)), 'Tag color is not supported').optional(),
  isPinned: z.boolean().optional(),
})

export const patchTagSchema = z.object({
  name: z.string().optional(),
  // Format is checked after the ownership lookup so cross-user writes surface 404 first.
  color: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
})

export const TAG_SELECT = `t.id, t.name, t.color, t.is_pinned, t.created_at,
  COALESCE(nc.count, 0) AS note_count`

export const TAG_COUNT_JOIN = `LEFT JOIN (
  SELECT nt.tag_id, COUNT(*) AS count
    FROM note_tags nt JOIN notes n ON n.id = nt.note_id
   WHERE n.user_id = ?1 AND n.deleted_at IS NULL AND n.is_archived = 0
   GROUP BY nt.tag_id
) nc ON nc.tag_id = t.id`

export async function loadTag(
  db: D1Database,
  userId: string,
  id: string,
): Promise<ReturnType<typeof toTag> | null> {
  const row = await db.prepare(
    `SELECT ${TAG_SELECT} FROM tags t
      ${TAG_COUNT_JOIN}
     WHERE t.id = ?2 AND t.user_id = ?1`,
  ).bind(userId, id).first<TagRow>()
  return row ? toTag(row) : null
}

export interface TagRewriteResult {
  rewritten: number
  rollback: () => Promise<void>
}

export async function rewriteTagInNotes(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  tagId: string,
  from: string,
  to: string | null,
): Promise<TagRewriteResult> {
  const { results } = await env.DB.prepare(
    `SELECT n.id FROM notes n
       JOIN note_tags nt ON nt.note_id = n.id
      WHERE nt.tag_id = ?1 AND n.user_id = ?2`,
  )
    .bind(tagId, userId)
    .all<{ id: string }>()

  let rewritten = 0
  const rewrittenNotes: RewrittenTagNote[] = []
  // Read every candidate once in a single batched query instead of one SELECT
  // per candidate; the guarded UPDATE still catches concurrent edits and only
  // conflicting candidates get a fresh single-row read on retry.
  const preloaded = await loadRewriteNotes(env.DB, userId, results.map((candidate) => candidate.id))
  try {
    for (const candidate of results) {
    let isComplete = false
    let note: RewriteNoteRow | null = preloaded.get(candidate.id) ?? null
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!note) {
        isComplete = true
        break
      }
      const content = replaceTagInContent(note.content, from, to)
      if (content === note.content) {
        isComplete = true
        break
      }

      const title = note.title
      const { words, chars } = countText(content)
      const hash = await sha256Hex(content)
      const now = Math.max(Date.now(), note.updated_at + 1)
      const nextRev = note.rev + 1
      const mutationGuard = `EXISTS (SELECT 1 FROM notes
        WHERE id = ?1 AND user_id = ?2 AND rev = ?3
          AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
      const mutationValues = [note.id, userId, nextRev, hash, title, now] as const
      const update = env.DB.prepare(
        `UPDATE notes SET title = ?1, content = ?2, excerpt = ?3, word_count = ?4, char_count = ?5,
           content_hash = ?6, rev = ?7, updated_at = ?8
          WHERE id = ?9 AND user_id = ?10 AND rev = ?11`,
      ).bind(
        title,
        content,
        deriveExcerpt(content),
        words,
        chars,
        hash,
        nextRev,
        now,
        note.id,
        userId,
        note.rev,
      )
      const snapshot = env.DB.prepare(
        `INSERT INTO note_versions (id, note_id, user_id, title, content, size, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE ${shiftSqlPlaceholders(mutationGuard, 7)}`,
      ).bind(
        newId(),
        note.id,
        userId,
        note.title,
        note.content,
        utf8ByteLength(note.content),
        now,
        ...mutationValues,
      )
      const trim = env.DB.prepare(
        `DELETE FROM note_versions WHERE note_id = ?1
           AND ${shiftSqlPlaceholders(mutationGuard, 1)}
           AND id NOT IN (
             SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
           )`,
      ).bind(note.id, ...mutationValues, LIMITS.versionsPerNote)
      const statements: D1PreparedStatement[] = [update, snapshot, trim]
      if (note.deleted_at === null) {
        statements.push(...buildNoteDerivedStatements({
          db: env.DB,
          userId,
          noteId: note.id,
          title,
          content,
          ftsEnabled,
          titleChanged: title !== note.title,
          previousTitle: note.title,
          expectedRev: nextRev,
          expectedContentHash: hash,
          expectedTitle: title,
          expectedUpdatedAt: now,
        }).statements)
      }
      statements.push(
        env.DB.prepare(
          `INSERT INTO changes (user_id, entity, entity_id, op, at)
           SELECT ?1, 'note', ?2, 'upsert', ?3
            WHERE ${shiftSqlPlaceholders(mutationGuard, 3)}`,
        ).bind(userId, note.id, now, ...mutationValues),
      )
      const [updated] = await env.DB.batch(statements)
      if (updated?.meta.changes) {
        rewritten++
        rewrittenNotes.push({ note, nextRev, updatedAt: now })
        isComplete = true
        break
      }
      // The guarded write was lost to a concurrent edit: re-read just this
      // note and retry with fresh state.
      note = await env.DB.prepare(
        `SELECT id, title, content, rev, updated_at, deleted_at
           FROM notes WHERE id = ?1 AND user_id = ?2`,
      )
        .bind(candidate.id, userId)
        .first<RewriteNoteRow>()
    }
    if (!isComplete) {
      throw ApiError.conflict(`Some notes are still being edited. Safely completed ${rewritten} notes; try again later`)
    }
  }
    return {
      rewritten,
      rollback: () => rollbackTagRewrites(env, ftsEnabled, userId, rewrittenNotes),
    }
  } catch (error) {
    try {
      await rollbackTagRewrites(env, ftsEnabled, userId, rewrittenNotes)
    } catch {
      throw ApiError.conflict('Tag rename could not be rolled back safely; refresh and try again')
    }
    throw error
  }
}

export interface RewriteNoteRow {
  id: string
  title: string
  content: string
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
      `SELECT id, title, content, rev, updated_at, deleted_at
         FROM notes WHERE user_id = ?1 AND id IN (${rewritePlaceholders(chunk.length)})`,
    )
      .bind(userId, ...chunk)
      .all<RewriteNoteRow>()
    for (const row of results) rows.set(row.id, row)
  }
  return rows
}

export function rewritePlaceholders(count: number): string {
  return Array.from({ length: count }, (_, i) => `?${i + 2}`).join(', ')
}

export interface RewrittenTagNote {
  note: {
    id: string
    title: string
    content: string
    rev: number
    updated_at: number
    deleted_at: number | null
  }
  nextRev: number
  updatedAt: number
}

export async function rollbackTagRewrites(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  rewrittenNotes: readonly RewrittenTagNote[],
): Promise<void> {
  for (const rewritten of [...rewrittenNotes].reverse()) {
    const { note, nextRev, updatedAt } = rewritten
    const hash = await sha256Hex(note.content)
    const { words, chars } = countText(note.content)
    const update = env.DB.prepare(
      `UPDATE notes SET content = ?1, excerpt = ?2, word_count = ?3, char_count = ?4,
         content_hash = ?5, rev = ?6, updated_at = ?7
        WHERE id = ?8 AND user_id = ?9 AND rev = ?10 AND updated_at = ?11`,
    ).bind(
      note.content,
      deriveExcerpt(note.content),
      words,
      chars,
      hash,
      note.rev,
      note.updated_at,
      note.id,
      userId,
      nextRev,
      updatedAt,
    )
    const statements: D1PreparedStatement[] = [update]
    if (note.deleted_at === null) {
      statements.push(...buildNoteDerivedStatements({
        db: env.DB,
        userId,
        noteId: note.id,
        title: note.title,
        content: note.content,
        ftsEnabled,
        expectedRev: note.rev,
        expectedContentHash: hash,
        expectedTitle: note.title,
        expectedUpdatedAt: note.updated_at,
      }).statements)
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO changes (user_id, entity, entity_id, op, at)
         SELECT ?1, 'note', ?2, 'upsert', ?3
          WHERE EXISTS (SELECT 1 FROM notes
            WHERE id = ?2 AND user_id = ?1 AND rev = ?4 AND updated_at = ?5)`,
      ).bind(userId, note.id, Date.now(), note.rev, note.updated_at),
    )
    const [restored] = await env.DB.batch(statements)
    if (!restored?.meta.changes) throw new Error('tag rewrite rollback conflict')
  }
}
