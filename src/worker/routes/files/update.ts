import { Hono } from "hono";

import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { AttachmentRow } from './helpers';
import { toAttachment } from './helpers';

export function registerFilesUpdateRoutes(filesRoutes: Hono<AppBindings>): void {
filesRoutes.patch('/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = await c.req.json<{
    filename?: string
    folderId?: string | null
    isStarred?: boolean
    isPinned?: boolean
    tags?: string[]
    updateNoteReferences?: boolean
  }>()

  const existing = await c.env.DB.prepare(
    `SELECT id, user_id, filename, folder_id, is_starred, is_pinned, tags FROM attachments WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentRow>()
  if (!existing) throw ApiError.notFound('Attachment not found')

  const nextFilename = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim() : existing.filename
  const nextFolderId = body.folderId !== undefined ? body.folderId : existing.folder_id
  const nextStarred = body.isStarred !== undefined ? (body.isStarred ? 1 : 0) : existing.is_starred
  const nextPinned = body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned
  const nextTags = body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE attachments SET filename = ?1, folder_id = ?2, is_starred = ?3, is_pinned = ?4, tags = ?5 WHERE id = ?6 AND user_id = ?7`
    ).bind(nextFilename, nextFolderId, nextStarred, nextPinned, nextTags, id, userId)
  ]

  if (body.updateNoteReferences && nextFilename !== existing.filename) {
    const { results: referencingNotes } = await c.env.DB.prepare(
      `SELECT id, content FROM notes WHERE user_id = ?1 AND content LIKE ?2 AND deleted_at IS NULL`
    ).bind(userId, `%/api/files/${id}%`).all<{ id: string; content: string }>()

    for (const note of referencingNotes) {
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(!?\\[)[^\\]]*(\\]\\(<?/api/files/${escapedId}>?[^)]*\\))`, 'g')
      const nextContent = note.content.replace(regex, `$1${nextFilename}$2`)
      if (nextContent !== note.content) {
        statements.push(
          c.env.DB.prepare(`UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4`)
            .bind(nextContent, Date.now(), note.id, userId)
        )
      }
    }
  }

  await c.env.DB.batch(statements)

  const updated = await c.env.DB.prepare(
    `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
       FROM attachments WHERE id = ?1 AND user_id = ?2`
  ).bind(id, userId).first<AttachmentRow>()
  if (!updated) throw ApiError.notFound('Attachment not found')

  return c.json(toAttachment(updated))
})
}

