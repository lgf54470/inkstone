import type { FolderRow, LibraryContext } from './types';
import { ApiError } from '../../lib/errors';
import { broadcastUserCursor } from '../../lib/notify';

export async function requireOwnedNote(db: D1Database, userId: string, noteId: string): Promise<void> {
  const row = await db.prepare(`SELECT 1 FROM notes WHERE id = ?1 AND user_id = ?2`)
    .bind(noteId, userId).first()
  if (!row) throw ApiError.notFound('Note not found')
}

export async function loadFolderOrNull(db: D1Database, userId: string, id: string): Promise<FolderRow | null> {
  return db.prepare(
    `SELECT id, parent_id, name, icon, color, position, created_at, updated_at
       FROM folders WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  ).bind(id, userId).first<FolderRow>()
}

export async function loadTagOrNull(db: D1Database, userId: string, id: string) {
  const row = await db.prepare(
    `SELECT t.id, t.name, t.color, t.is_manual,
       (SELECT COUNT(*) FROM note_tags nt JOIN notes n ON n.id = nt.note_id
         WHERE nt.tag_id = t.id AND n.user_id = t.user_id AND n.deleted_at IS NULL) AS note_count
       FROM tags t WHERE t.id = ?1 AND t.user_id = ?2`,
  ).bind(id, userId).first<{
    id: string
    name: string
    color: string | null
    is_manual: number
    note_count: number
  }>()
  return row ? {
    id: row.id,
    name: row.name,
    color: row.color,
    manual: row.is_manual === 1,
    note_count: row.note_count,
  } : null
}

export async function recordChange(
  context: LibraryContext,
  entity: string,
  id: string,
  op: 'upsert' | 'delete',
  at: number,
): Promise<void> {
  await context.env.DB.prepare(
    `INSERT INTO changes (user_id, entity, entity_id, op, at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).bind(context.userId, entity, id, op, at).run()
  await notifyMutation(context)
}

export async function notifyMutation(context: LibraryContext): Promise<void> {
  await broadcastUserCursor(
    context.env,
    context.userId,
    null,
    undefined,
    (task) => context.executionCtx.waitUntil(task),
  )
}
