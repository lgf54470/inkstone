import { Hono } from "hono";
import type { AppBindings } from "../../env";
import { FTS_QUEUE_CONFLICT_SQL, LINK_TARGET_SUBQUERY, pruneOrphanTags } from "../../db/writes";
import { broadcastCursor, scheduleFtsDrain } from "../../lib/notify";

export function registerNotesTrashRoutes(notesRoutes: Hono<AppBindings>): void {
notesRoutes.post('/trash/empty', async (c) => {
  const userId = c.get('userId')
  const { ftsEnabled } = c.get('database')
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL`,
  )
    .bind(userId)
    .first<{ count: number }>()
  let purged = 0
  let deletionCursor: number | undefined

  if ((row?.count ?? 0) > 0) {
    const trashed = `SELECT id FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL`
    const statements = [
      c.env.DB.prepare(`DELETE FROM note_tags WHERE note_id IN (${trashed})`).bind(userId),
      c.env.DB.prepare(`DELETE FROM links WHERE source_note_id IN (${trashed})`).bind(userId),
      c.env.DB.prepare(
        `UPDATE links SET target_note_id = ${LINK_TARGET_SUBQUERY}
          WHERE user_id = ?1 AND target_note_id IN (${trashed})`,
      ).bind(userId),
      c.env.DB.prepare(`DELETE FROM note_versions WHERE note_id IN (${trashed})`).bind(userId),
      c.env.DB.prepare(
        `DELETE FROM share_asset_sessions WHERE slug IN (
           SELECT slug FROM shares WHERE user_id = ?1 AND note_id IN (${trashed})
         )`,
      ).bind(userId),
      c.env.DB.prepare(`DELETE FROM shares WHERE note_id IN (${trashed})`).bind(userId),
      c.env.DB.prepare(`UPDATE attachments SET note_id = NULL WHERE note_id IN (${trashed})`).bind(userId),
      c.env.DB.prepare(
        `DELETE FROM import_mappings
          WHERE user_id = ?1 AND entity = 'note' AND target_id IN (${trashed})`,
      ).bind(userId),
    ]
    if (ftsEnabled) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at)
           SELECT ?1, id, 'delete', ?2
             FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL
           ${FTS_QUEUE_CONFLICT_SQL}`,
        ).bind(userId, Date.now()),
      )
    }
    statements.push(
      c.env.DB.prepare(
        `INSERT OR REPLACE INTO ai_index_queue (user_id, note_id, kind, created_at)
         SELECT ?1, id, 'delete', ?2
           FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL`,
      ).bind(userId, Date.now()),
      c.env.DB
        .prepare(
          `INSERT INTO changes (user_id, entity, entity_id, op, at)
           SELECT ?1, 'note', id, 'delete', ?2
             FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL`,
        )
        .bind(userId, Date.now()),
      c.env.DB
        .prepare(`SELECT seq FROM changes WHERE user_id = ?1 ORDER BY seq DESC LIMIT 1`)
        .bind(userId),
      c.env.DB
        .prepare(`DELETE FROM notes WHERE user_id = ?1 AND deleted_at IS NOT NULL`)
        .bind(userId),
    )
    const results = await c.env.DB.batch(statements)
    const changeResult = results.at(-2) as D1Result<{ seq: number }> | undefined
    purged = results.at(-1)?.meta.changes ?? 0
    deletionCursor = changeResult?.results?.at(-1)?.seq
    if (purged) scheduleFtsDrain(c)
  }
  await pruneOrphanTags(c.env.DB, userId)
  await broadcastCursor(c, deletionCursor)
  return c.json({ purged })
})
}

