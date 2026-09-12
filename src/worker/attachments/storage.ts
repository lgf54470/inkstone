import { LIMITS } from '@shared/constants'
import { truncateText } from '@shared/text-utils'
import type { Env } from '../env'
import { ApiError } from '../lib/errors'
import { sha256Hex } from '../lib/encoding'
import { acquireLease } from '../lib/lease'
import {
  hasReasonableImageDimensions,
  readImageSize,
  safeAttachmentMime,
} from '../lib/image'
import {
  deleteAttachmentObjects,
  putAttachmentObject,
  selectAttachmentStorage,
} from './backend'
import { drainAttachmentCleanup } from './cleanup'
import {
  attachmentCleanupTarget,
  attachmentObjectKey,
  type AttachmentObjectStorage,
} from './keys'


interface PersistAttachmentInput {
  id: string
  userId: string
  noteId: string | null
  folderId?: string | null
  filename: string
  reportedMime: string
  bytes: Uint8Array
  createdAt: number
}

export interface PersistedAttachment {
  id: string
  userId: string
  noteId: string | null
  folderId?: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  storage: AttachmentObjectStorage
  objectKey: string
  createdAt: number
}

export async function persistAttachmentWithinQuota(
  env: Env,
  input: PersistAttachmentInput,
): Promise<PersistedAttachment> {
  const release = await acquireLease(
    env.DB,
    `attachment-quota:${input.userId}`,
    2 * 60 * 1000,
    'Another attachment upload is being finalized. Try again shortly',
  )
  try {
    const usage = await env.DB.prepare(
      `SELECT COALESCE(SUM(size), 0) AS bytes FROM attachments WHERE user_id = ?1`,
    ).bind(input.userId).first<{ bytes: number }>()
    if ((usage?.bytes ?? 0) + input.bytes.byteLength > LIMITS.attachmentQuotaBytes) {
      throw ApiError.tooLarge('The account attachment quota has been reached')
    }
    return await persistAttachment(env, input)
  } finally {
    await release()
  }
}



async function persistAttachment(
  env: Env,
  input: PersistAttachmentInput,
): Promise<PersistedAttachment> {
  if (input.bytes.byteLength > LIMITS.attachmentMaxBytes) {
    throw ApiError.tooLarge('The file exceeds the 25 MB limit')
  }
  const storage = selectAttachmentStorage(env)
  if (!storage) {
    throw new ApiError(
      503,
      'storage_unavailable',
      'Attachment storage is not configured. Bind R2 or Workers KV before uploading files.',
    )
  }

  const meta = await deriveAttachmentMeta(env.DB, input)
  const objectKey = attachmentObjectKey({
    user_id: input.userId,
    id: input.id,
    mime: meta.mime,
    filename: meta.filename,
    created_at: input.createdAt,
  })
  await putAttachmentObject(env, storage, objectKey, input.bytes, {
    userId: input.userId,
    objectId: input.id,
    kind: 'attachment',
    filename: meta.filename,
    mime: meta.mime,
    sha256: meta.sha256,
  })
  await writeAttachmentRow(env, storage, objectKey, input, meta)

  return {
    id: input.id,
    userId: input.userId,
    noteId: input.noteId,
    folderId: input.folderId ?? null,
    filename: meta.filename,
    mime: meta.mime,
    size: input.bytes.byteLength,
    width: meta.dimensions?.width ?? null,
    height: meta.dimensions?.height ?? null,
    storage,
    objectKey,
    createdAt: input.createdAt,
  }
}

async function deriveAttachmentMeta(
  db: D1Database,
  input: PersistAttachmentInput,
): Promise<{
  mime: string
  filename: string
  sha256: string
  dimensions: { width: number; height: number } | null
}> {
  let mime = safeAttachmentMime(input.bytes, input.reportedMime)
  let dimensions = readImageSize(input.bytes, mime)
  if (!hasReasonableImageDimensions(dimensions)) {
    mime = 'application/octet-stream'
    dimensions = null
  }
  const sha256 = await sha256Hex(input.bytes)
  const filename = await deduplicateAttachmentFilename(
    db,
    input.userId,
    sanitizeAttachmentFilename(input.filename),
    input.createdAt,
    sha256,
  )
  return { mime, filename, sha256, dimensions }
}

async function writeAttachmentRow(
  env: Env,
  storage: AttachmentObjectStorage,
  objectKey: string,
  input: PersistAttachmentInput,
  derived: {
    mime: string
    filename: string
    sha256: string
    dimensions: { width: number; height: number } | null
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height, storage, object_key, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    )
      .bind(
        input.id,
        input.userId,
        input.noteId,
        input.folderId ?? null,
        derived.filename,
        derived.mime,
        input.bytes.byteLength,
        derived.sha256,
        derived.dimensions?.width ?? null,
        derived.dimensions?.height ?? null,
        storage,
        objectKey,
        input.createdAt,
      )
      .run()
  } catch (error) {
    await rollbackStoredObject(env, storage, objectKey, input.userId)
    throw error
  }
}

async function rollbackStoredObject(
  env: Env,
  storage: AttachmentObjectStorage,
  objectKey: string,
  userId: string,
): Promise<void> {
  try {
    await deleteAttachmentObjects(env, storage, [objectKey])
  } catch (cleanupError) {
    // The rollback error is reported below; if the cleanup-row insert also fails,
    // the object simply waits for a later cleanup pass instead of being retried now.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
       VALUES (?1, ?2, ?3)`,
    )
      .bind(attachmentCleanupTarget(storage, objectKey), userId, Date.now())
      .run()
      .catch(() => {})
    console.warn('[inkstone] Attachment cleanup after a write rollback will retry later:', cleanupError)
  }
}


export function sanitizeAttachmentFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/^\.+/, '')
    .trim()
  return truncateText(cleaned || 'file', 180)
}


async function deduplicateAttachmentFilename(
  db: D1Database,
  userId: string,
  filename: string,
  createdAt: number,
  sha256: string,
): Promise<string> {
  const dayStart = new Date(new Date(createdAt).toISOString().slice(0, 10)).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000
  const rows = await db.prepare(
    `SELECT filename, sha256 FROM attachments WHERE user_id = ?1 AND created_at >= ?2 AND created_at < ?3`,
  ).bind(userId, dayStart, dayEnd).all<{ filename: string; sha256: string }>()

  const existingSameName = rows.results.find((r) => r.filename.toLowerCase() === filename.toLowerCase())
  if (!existingSameName || existingSameName.sha256 === sha256) {
    return filename
  }

  const dotIndex = filename.lastIndexOf('.')
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : ''
  let counter = 1
  let candidate = `${base} (${counter})${ext}`
  const existingNames = new Set(rows.results.map((r) => r.filename.toLowerCase()))
  while (existingNames.has(candidate.toLowerCase())) {
    counter++
    candidate = `${base} (${counter})${ext}`
  }
  return candidate
}

export async function rollbackPersistedAttachments(
  env: Env,
  attachments: readonly PersistedAttachment[],
): Promise<void> {
  let statements: D1PreparedStatement[] = []
  const flush = async () => {
    if (!statements.length) return
    await env.DB.batch(statements)
    statements = []
  }

  for (const attachment of attachments) {
    const needed = 3
    if (statements.length + needed > 100) await flush()
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
         SELECT ?1, user_id, ?2 FROM attachments WHERE id = ?3 AND user_id = ?4`,
      ).bind(
        attachmentCleanupTarget(attachment.storage, attachment.objectKey),
        Date.now(),
        attachment.id,
        attachment.userId,
      ),
    )
    statements.push(
      env.DB.prepare(
        `DELETE FROM import_mappings
          WHERE user_id = ?1 AND entity = 'attachment' AND target_id = ?2`,
      ).bind(attachment.userId, attachment.id),
    )
    statements.push(
      env.DB.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(
        attachment.id,
        attachment.userId,
      ),
    )
  }
  await flush()
  await drainAttachmentCleanup(env).catch((error) => {
    console.warn('[inkstone] Attachment cleanup after an import rollback will retry later:', error)
  })
}
