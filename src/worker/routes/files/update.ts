import { Hono } from 'hono'
import { z } from 'zod'

import { sanitizeAttachmentFilename } from '../../attachments/storage'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { AttachmentRow } from './helpers'
import { toAttachment } from './helpers'

const attachmentPatchSchema = z.object({
  filename: z.string().max(200).optional(),
  folderId: z.string().max(128).nullable().optional(),
  isStarred: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(100).optional(),
  updateNoteReferences: z.boolean().optional(),
})

export function registerFilesUpdateRoutes(filesRoutes: Hono<AppBindings>): void {
  registerFilesPatchRoute(filesRoutes)
}

function registerFilesPatchRoute(filesRoutes: Hono<AppBindings>): void {
  filesRoutes.patch('/:id', requireAuth, async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = await readJsonValidated(c, attachmentPatchSchema, 64 * 1024)

    const existing = await c.env.DB.prepare(
      `SELECT id, user_id, filename, folder_id, is_starred, is_pinned, tags FROM attachments WHERE id = ?1 AND user_id = ?2`,
    ).bind(id, userId).first<AttachmentRow>()
    if (!existing) throw ApiError.notFound('Attachment not found')

    const next = attachmentPatchValues(body, existing)
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `UPDATE attachments SET filename = ?1, folder_id = ?2, is_starred = ?3, is_pinned = ?4, tags = ?5 WHERE id = ?6 AND user_id = ?7`,
      ).bind(next.filename, next.folderId, next.isStarred, next.isPinned, next.tags, id, userId),
    ]

    if (body.updateNoteReferences && next.filename !== existing.filename) {
      await appendNoteReferenceUpdates(c.env.DB, statements, userId, id, next.filename)
    }
    await c.env.DB.batch(statements)

    const updated = await c.env.DB.prepare(
      `SELECT id, user_id, note_id, folder_id, filename, mime, size, width, height, storage, is_starred, is_pinned, tags, created_at
         FROM attachments WHERE id = ?1 AND user_id = ?2`,
    ).bind(id, userId).first<AttachmentRow>()
    if (!updated) throw ApiError.notFound('Attachment not found')

    return c.json(toAttachment(updated))
  })
}

function attachmentPatchValues(
  body: z.infer<typeof attachmentPatchSchema>,
  existing: AttachmentRow,
): { filename: string; folderId: string | null; isStarred: number; isPinned: number; tags: string } {
  return {
    filename: typeof body.filename === 'string' && body.filename.trim() ? sanitizeAttachmentFilename(body.filename) : existing.filename,
    folderId: body.folderId !== undefined ? body.folderId : existing.folder_id,
    isStarred: body.isStarred !== undefined ? (body.isStarred ? 1 : 0) : existing.is_starred,
    isPinned: body.isPinned !== undefined ? (body.isPinned ? 1 : 0) : existing.is_pinned,
    tags: body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
  }
}

async function appendNoteReferenceUpdates(
  db: D1Database,
  statements: D1PreparedStatement[],
  userId: string,
  attachmentId: string,
  nextFilename: string,
): Promise<void> {
  const { results: referencingNotes } = await db.prepare(
    `SELECT id, content FROM notes WHERE user_id = ?1 AND content LIKE ?2 AND deleted_at IS NULL`,
  ).bind(userId, `%/api/files/${attachmentId}%`).all<{ id: string; content: string }>()

  for (const note of referencingNotes) {
    const escapedId = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(!?\\[)[^\\]]*(\\]\\(<?/api/files/${escapedId}>?[^)]*\\))`, 'g')
    const nextContent = note.content.replace(regex, `$1${nextFilename}$2`)
    if (nextContent !== note.content) {
      statements.push(
        db.prepare(`UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4`)
          .bind(nextContent, Date.now(), note.id, userId),
      )
    }
  }
}