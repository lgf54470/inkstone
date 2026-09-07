import { z } from 'zod';
import { LIMITS } from '@shared/constants';
import { countText, deriveExcerpt, replaceTagInContent } from '@shared/markdown-utils';
import { organizerColorOrNull } from '@shared/organizer-colors';
import { utf8ByteLength } from '@shared/text-utils';
import type { AppBindings } from '../../env';
import { toTag, type TagRow } from '../../db/rows';
import { buildNoteDerivedStatements, shiftSqlPlaceholders } from '../../db/writes';
import { sha256Hex } from '../../lib/encoding';
import { ApiError } from '../../lib/errors';
import { isValidId, newId } from '../../lib/id';

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

const TAG_REWRITE_MAX_ATTEMPTS = 5

export async function rewriteTagInNotes(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  tagId: string,
  from: string,
  to: string | null,
): Promise<TagRewriteResult> {
  const candidates = await selectTaggedNoteIds(env.DB, userId, tagId)
  const preloaded = await loadRewriteNotes(env.DB, userId, candidates.map((candidate) => candidate.id))
  const rewrittenNotes: RewrittenTagNote[] = []
  let rewritten = 0
  try {
    for (const candidate of candidates) {
      const rewrittenNote = await rewriteCandidateTagNote(
        env,
        ftsEnabled,
        userId,
        candidate.id,
        preloaded,
        from,
        to,
        () => rewritten,
      )
      if (!rewrittenNote) continue
      rewritten++
      rewrittenNotes.push(rewrittenNote)
    }
    return {
      rewritten,
      rollback: () => rollbackTagRewrites(env, ftsEnabled, userId, rewrittenNotes),
    }
  } catch (error) {
    await rollbackTagRewriteOrThrow(env, ftsEnabled, userId, rewrittenNotes)
    throw error
  }
}

async function rollbackTagRewriteOrThrow(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  rewrittenNotes: readonly RewrittenTagNote[],
): Promise<void> {
  try {
    await rollbackTagRewrites(env, ftsEnabled, userId, rewrittenNotes)
  } catch {
    throw ApiError.conflict('Tag rename could not be rolled back safely; refresh and try again')
  }
}

async function selectTaggedNoteIds(
  db: D1Database,
  userId: string,
  tagId: string,
): Promise<Array<{ id: string }>> {
  const { results } = await db.prepare(
    `SELECT n.id FROM notes n
       JOIN note_tags nt ON nt.note_id = n.id
      WHERE nt.tag_id = ?1 AND n.user_id = ?2`,
  )
    .bind(tagId, userId)
    .all<{ id: string }>()
  return results
}

async function rewriteCandidateTagNote(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  candidateId: string,
  preloaded: Map<string, RewriteNoteRow>,
  from: string,
  to: string | null,
  getRewritten: () => number,
): Promise<RewrittenTagNote | null> {
  // Read every candidate once in a single batched query instead of one SELECT
  // per candidate; the guarded UPDATE still catches concurrent edits and only
  // conflicting candidates get a fresh single-row read on retry.
  let note = preloaded.get(candidateId) ?? null
  for (let attempt = 0; attempt < TAG_REWRITE_MAX_ATTEMPTS; attempt++) {
    if (!note) return null
    const content = replaceTagInContent(note.content, from, to)
    if (content === note.content) return null

    const rewritten = await applyTagRewrite(env, ftsEnabled, userId, note, content)
    if (rewritten) return rewritten
    // The guarded write was lost to a concurrent edit: re-read just this
    // note and retry with fresh state.
    note = await reloadTagRewriteNote(env.DB, candidateId, userId)
  }
  throw ApiError.conflict(`Some notes are still being edited. Safely completed ${getRewritten()} notes; try again later`)
}

interface TagRewritePlan {
  title: string
  content: string
  words: number
  chars: number
  hash: string
  now: number
  nextRev: number
}

async function applyTagRewrite(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  note: RewriteNoteRow,
  content: string,
): Promise<RewrittenTagNote | null> {
  const plan = await planTagRewrite(note, content)
  const statements = buildTagRewriteStatements(env, ftsEnabled, userId, note, plan)
  const [updated] = await env.DB.batch(statements)
  if (!updated?.meta.changes) return null
  return { note, nextRev: plan.nextRev, updatedAt: plan.now }
}

async function planTagRewrite(note: RewriteNoteRow, content: string): Promise<TagRewritePlan> {
  const { words, chars } = countText(content)
  return {
    title: note.title,
    content,
    words,
    chars,
    hash: await sha256Hex(content),
    now: Math.max(Date.now(), note.updated_at + 1),
    nextRev: note.rev + 1,
  }
}

function buildTagRewriteStatements(
  env: AppBindings['Bindings'],
  ftsEnabled: boolean,
  userId: string,
  note: RewriteNoteRow,
  plan: TagRewritePlan,
): D1PreparedStatement[] {
  const mutationGuard = `EXISTS (SELECT 1 FROM notes
    WHERE id = ?1 AND user_id = ?2 AND rev = ?3
      AND content_hash = ?4 AND title = ?5 AND updated_at = ?6)`
  const mutationValues = [note.id, userId, plan.nextRev, plan.hash, plan.title, plan.now] as const
  const statements: D1PreparedStatement[] = [
    buildTagRewriteUpdateStatement(env.DB, userId, note, plan),
    ...buildTagRewriteVersionStatements(env.DB, userId, note, plan, mutationGuard, mutationValues),
  ]
  if (note.deleted_at === null) {
    statements.push(...buildNoteDerivedStatements({
      db: env.DB,
      userId,
      noteId: note.id,
      title: plan.title,
      content: plan.content,
      ftsEnabled,
      titleChanged: plan.title !== note.title,
      previousTitle: note.title,
      expectedRev: plan.nextRev,
      expectedContentHash: plan.hash,
      expectedTitle: plan.title,
      expectedUpdatedAt: plan.now,
    }).statements)
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'note', ?2, 'upsert', ?3
        WHERE ${shiftSqlPlaceholders(mutationGuard, 3)}`,
    ).bind(userId, note.id, plan.now, ...mutationValues),
  )
  return statements
}

function buildTagRewriteUpdateStatement(
  db: D1Database,
  userId: string,
  note: RewriteNoteRow,
  plan: TagRewritePlan,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE notes SET title = ?1, content = ?2, excerpt = ?3, word_count = ?4, char_count = ?5,
       content_hash = ?6, rev = ?7, updated_at = ?8
      WHERE id = ?9 AND user_id = ?10 AND rev = ?11`,
  ).bind(
    plan.title,
    plan.content,
    deriveExcerpt(plan.content),
    plan.words,
    plan.chars,
    plan.hash,
    plan.nextRev,
    plan.now,
    note.id,
    userId,
    note.rev,
  )
}

function buildTagRewriteVersionStatements(
  db: D1Database,
  userId: string,
  note: RewriteNoteRow,
  plan: TagRewritePlan,
  mutationGuard: string,
  mutationValues: readonly [string, string, number, string, string, number],
): D1PreparedStatement[] {
  return [
    db.prepare(
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
      plan.now,
      ...mutationValues,
    ),
    db.prepare(
      `DELETE FROM note_versions WHERE note_id = ?1
         AND ${shiftSqlPlaceholders(mutationGuard, 1)}
         AND id NOT IN (
           SELECT id FROM note_versions WHERE note_id = ?1 ORDER BY created_at DESC LIMIT ?8
         )`,
    ).bind(note.id, ...mutationValues, LIMITS.versionsPerNote),
  ]
}

async function reloadTagRewriteNote(
  db: D1Database,
  id: string,
  userId: string,
): Promise<RewriteNoteRow | null> {
  return db.prepare(
    `SELECT id, title, content, rev, updated_at, deleted_at
       FROM notes WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(id, userId)
    .first<RewriteNoteRow>()
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


interface RewrittenTagNote {
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


async function rollbackTagRewrites(
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