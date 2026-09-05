import { Hono } from "hono";
import type { AppBindings } from "../../env";
import { loadNoteRow } from './helpers';
import { linkContext } from './helpers';

export function registerNotesBacklinksRoutes(notesRoutes: Hono<AppBindings>): void {
notesRoutes.get('/:id/backlinks', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const note = await loadNoteRow(c.env.DB, userId, id)

  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.content FROM links l
       JOIN notes n ON n.id = l.source_note_id
      WHERE l.user_id = ?1 AND l.target_note_id = ?2
        AND n.deleted_at IS NULL AND n.id != ?2
       ORDER BY n.updated_at DESC LIMIT 50`,
  )
    .bind(userId, id)
    .all<{ id: string; title: string; content: string }>()

  return c.json({
    backlinks: results.map((r) => ({
      id: r.id,
      title: r.title,
      context: linkContext(r.content, note.title),
    })),
  })
})
}

