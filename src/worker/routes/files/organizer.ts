import { Hono } from "hono";
import { LIMITS } from "@shared/constants";
import type { Attachment } from "@shared/types";
import { persistAttachmentWithinQuota } from "../../attachments/storage";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from "../../lib/request";
import { createScopedFolder, createScopedTag, deleteScopedFolder, deleteScopedTag, listScopedFolders, listScopedTags, updateScopedFolder, updateScopedTag } from "../../lib/scoped-organizer";
import { consumeAttemptBudget, ThrottleError } from "../../lib/throttle";
import { requireAuth } from "../../middleware/auth";
import { removeTagFromAttachmentJson } from './helpers';
import { renameTagInAttachmentJson } from './helpers';

export function registerFilesOrganizerRoutes(filesRoutes: Hono<AppBindings>): void {
filesRoutes.post('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  try {
    await consumeAttemptBudget(c.env.DB, [{
      key: `attachment-upload:${userId}`,
      maxAttempts: LIMITS.attachmentUploadsPerHour,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many uploads. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }

  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.attachment)

  const file = form.get('file')
  if (!(file instanceof File)) throw ApiError.badRequest('Missing file field')

  if (file.size > LIMITS.attachmentMaxBytes) {
    throw ApiError.tooLarge('The file exceeds the 25 MB limit')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = newId()
  const rawNoteId = form.get('noteId')
  const noteId = typeof rawNoteId === 'string' && rawNoteId ? rawNoteId.slice(0, 128) : null
  const rawFolderId = form.get('folderId')
  let folderId = typeof rawFolderId === 'string' && rawFolderId ? rawFolderId.slice(0, 128) : null
  if (noteId) {
    const owned = await c.env.DB.prepare(
      `SELECT id FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
    )
      .bind(noteId, userId)
      .first<{ id: string }>()
    if (!owned) throw ApiError.badRequest('The associated note does not exist')
  }
  const now = Date.now()
  const stored = await persistAttachmentWithinQuota(c.env, {
    id,
    userId,
    noteId,
    folderId,
    filename: file.name || 'file',
    reportedMime: file.type,
    bytes,
    createdAt: now,
  })

  const attachment: Attachment = {
    id,
    noteId,
    folderId: stored.folderId ?? folderId,
    filename: stored.filename,
    mime: stored.mime,
    size: bytes.byteLength,
    width: stored.width,
    height: stored.height,
    url: `/api/files/${id}`,
    createdAt: now,
    isStarred: false,
    isPinned: false,
    tags: [],
  }
  return c.json(attachment, 201)
})

filesRoutes.get('/folders', requireAuth, async (c) => {
  return c.json(await listScopedFolders(c.env.DB, 'attachment_folders', c.get('userId')))
})

filesRoutes.post('/folders', requireAuth, async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedFolder>[3]>()
  return c.json(await createScopedFolder(c.env.DB, 'attachment_folders', c.get('userId'), body), 201)
})

filesRoutes.patch('/folders/:id', requireAuth, async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedFolder>[3]>()
  return c.json(await updateScopedFolder(c.env.DB, 'attachment_folders', c.get('userId'), c.req.param('id'), body))
})

filesRoutes.delete('/folders/:id', requireAuth, async (c) => {
  await deleteScopedFolder(c.env.DB, 'attachment_folders', 'attachments', c.get('userId'), c.req.param('id'))
  return c.json({ ok: true })
})

filesRoutes.get('/tags', requireAuth, async (c) => {
  return c.json(await listScopedTags(c.env.DB, 'attachment_tags', c.get('userId')))
})

filesRoutes.post('/tags', requireAuth, async (c) => {
  const body = await c.req.json<Parameters<typeof createScopedTag>[4]>()
  const { tag } = await createScopedTag(c.env.DB, 'attachment_tags', 'upsert', c.get('userId'), body)
  return c.json(tag, 201)
})

filesRoutes.patch('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<Parameters<typeof updateScopedTag>[4]>()
  const { tag, previousName } = await updateScopedTag(c.env.DB, 'attachment_tags', userId, c.req.param('id'), body)
  if (previousName !== tag.name) {
    await renameTagInAttachmentJson(c.env.DB, userId, previousName, tag.name)
  }
  return c.json(tag)
})

filesRoutes.delete('/tags/:id', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { removed, name } = await deleteScopedTag(c.env.DB, 'attachment_tags', userId, c.req.param('id'))
  if (removed && name) await removeTagFromAttachmentJson(c.env.DB, userId, name)
  return c.json({ ok: true })
})
}

