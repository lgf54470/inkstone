import { requireOwnedNote } from './helpers';
import type { LibraryContext } from './types';
import { readAttachmentObject } from '../../attachments/backend';
import { drainAttachmentCleanup } from '../../attachments/cleanup';
import { AttachmentObjectStorage, attachmentCleanupTarget, attachmentObjectKey, legacyAttachmentObjectKey } from '../../attachments/keys';
import { persistAttachmentWithinQuota } from '../../attachments/storage';
import type { Env } from '../../env';
import { fromBase64, sha256Hex, toBase64 } from '../../lib/encoding';
import { ApiError } from '../../lib/errors';
import { isValidId, newId } from '../../lib/id';
import { ThrottleError, consumeAttemptBudget } from '../../lib/throttle';
import { runIdempotent } from '.././operations';
import { LIMITS } from '@shared/constants';

export async function listMcpAttachments(
  db: D1Database,
  userId: string,
  input: { noteId?: string; limit?: number; cursor?: number },
) {
  if (input.noteId) await requireOwnedNote(db, userId, input.noteId)
  const limit = Math.max(1, Math.min(50, input.limit ?? 20))
  const cursor = Math.max(0, Math.trunc(input.cursor ?? 0))
  const { results } = await db.prepare(
    `SELECT id, note_id, filename, mime, size, width, height, created_at
       FROM attachments WHERE user_id = ?1 AND (?2 IS NULL OR note_id = ?2)
      ORDER BY created_at DESC, id DESC LIMIT ?3 OFFSET ?4`,
  ).bind(userId, input.noteId ?? null, limit + 1, cursor).all<{
    id: string
    note_id: string | null
    filename: string
    mime: string
    size: number
    width: number | null
    height: number | null
    created_at: number
  }>()
  return {
    attachments: results.slice(0, limit).map((row) => ({
      id: row.id,
      note_id: row.note_id,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      width: row.width,
      height: row.height,
      created_at: new Date(row.created_at).toISOString(),
    })),
    next_cursor: results.length > limit ? cursor + limit : null,
  }
}

export async function readMcpAttachment(
  env: Env,
  userId: string,
  input: { attachmentId: string; cursor?: number; maxBytes?: number },
) {
  const row = await env.DB.prepare(
    `SELECT id, user_id, note_id, filename, mime, size, sha256, storage, created_at
       FROM attachments WHERE id = ?1 AND user_id = ?2`,
  ).bind(input.attachmentId, userId).first<{
    id: string
    user_id: string
    note_id: string | null
    filename: string
    mime: string
    size: number
    sha256: string
    storage: AttachmentObjectStorage
    created_at: number
  }>()
  if (!row) throw ApiError.notFound('Attachment not found')
  let bytes = await readAttachmentObject(env, row.storage, attachmentObjectKey(row))
  if (!bytes) {
    bytes = await readAttachmentObject(env, row.storage, legacyAttachmentObjectKey(row))
  }
  if (!bytes) throw ApiError.notFound('Attachment data is missing')
  const start = Math.max(0, Math.min(bytes.byteLength, Math.trunc(input.cursor ?? 0)))
  const maxBytes = Math.max(1024, Math.min(1024 * 1024, Math.trunc(input.maxBytes ?? 256 * 1024)))
  const end = Math.min(bytes.byteLength, start + maxBytes)
  return {
    id: row.id,
    note_id: row.note_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    encoding: 'base64',
    data: toBase64(bytes.slice(start, end)),
    start_offset: start,
    end_offset: end,
    has_more: end < bytes.byteLength,
    next_cursor: end < bytes.byteLength ? end : null,
  }
}

export async function uploadMcpAttachment(
  context: LibraryContext,
  input: {
    operationId: string
    attachmentId?: string
    noteId?: string | null
    filename: string
    mime: string
    base64: string
  },
) {
  const id = input.attachmentId ?? newId()
  if (!isValidId(id)) throw ApiError.badRequest('attachment_id must be a valid Inkstone id')
  if (input.noteId) await requireOwnedNote(context.env.DB, context.userId, input.noteId)
  let bytes: Uint8Array
  try {
    bytes = fromBase64(input.base64)
  } catch {
    throw ApiError.badRequest('data must be valid base64')
  }
  const digest = await sha256Hex(bytes)
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'upload_attachment',
    request: { ...input, attachmentId: id },
    recovery: { attachmentId: id },
    recover: async () => {
      const row = await loadAttachmentMeta(context.env.DB, context.userId, id)
      if (!row || row.note_id !== (input.noteId ?? null) || row.filename !== input.filename
        || row.size !== bytes.byteLength || row.sha256 !== digest) return null
      return {
        id: row.id,
        note_id: row.note_id,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        width: row.width,
        height: row.height,
        markdown: `![${row.filename}](/api/files/${row.id})`,
      }
    },
    execute: async () => {
      try {
        await consumeAttemptBudget(context.env.DB, [{
          key: `attachment-upload:${context.userId}`,
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
      const collision = await context.env.DB.prepare(`SELECT 1 FROM attachments WHERE id = ?1`).bind(id).first()
      if (collision) throw ApiError.conflict('This attachment id is already in use')
      const stored = await persistAttachmentWithinQuota(context.env, {
        id,
        userId: context.userId,
        noteId: input.noteId ?? null,
        filename: input.filename,
        reportedMime: input.mime,
        bytes,
        createdAt: Date.now(),
      })
      return {
        id: stored.id,
        note_id: stored.noteId,
        filename: stored.filename,
        mime: stored.mime,
        size: stored.size,
        width: stored.width,
        height: stored.height,
        markdown: `![${stored.filename}](/api/files/${stored.id})`,
      }
    },
  })
}

export async function deleteMcpAttachment(
  context: LibraryContext,
  input: { operationId: string; attachmentId: string },
) {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'delete_attachment',
    request: input,
    recover: async () => {
      const row = await loadAttachmentMeta(context.env.DB, context.userId, input.attachmentId)
      return row ? null : { ok: true, attachment_id: input.attachmentId, cleanup_pending: false }
    },
    execute: async () => {
      const row = await context.env.DB.prepare(
        `SELECT id, user_id, filename, mime, storage FROM attachments WHERE id = ?1 AND user_id = ?2`,
      ).bind(input.attachmentId, context.userId).first<{
        id: string
        user_id: string
        filename: string
        mime: string
        storage: AttachmentObjectStorage
      }>()
      if (!row) throw ApiError.notFound('Attachment not found')
      const results = await context.env.DB.batch([
        context.env.DB.prepare(
          `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at) VALUES (?1, ?2, ?3)`,
        ).bind(attachmentCleanupTarget(row.storage, attachmentObjectKey(row)), context.userId, Date.now()),
        context.env.DB.prepare(
          `DELETE FROM import_mappings WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2`,
        ).bind(context.userId, row.id),
        context.env.DB.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`)
          .bind(row.id, context.userId),
      ])
      if (!results[2]?.meta.changes) throw ApiError.notFound('Attachment not found')
      const cleanup = await drainAttachmentCleanup(context.env, context.userId).catch(() => ({
        processed: 0,
        pending: true,
      }))
      return { ok: true, attachment_id: row.id, cleanup_pending: cleanup.pending }
    },
  })
}

async function loadAttachmentMeta(db: D1Database, userId: string, id: string) {
  return db.prepare(
    `SELECT id, note_id, filename, mime, size, sha256, width, height, created_at
       FROM attachments WHERE id = ?1 AND user_id = ?2`,
  ).bind(id, userId).first<{
    id: string
    note_id: string | null
    filename: string
    mime: string
    size: number
    sha256: string
    width: number | null
    height: number | null
    created_at: number
  }>()
}
