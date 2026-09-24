import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { sha256Hex } from '../lib/encoding'
import { safeAttachmentMime } from '../lib/image'
import { newId } from '../lib/id'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../lib/throttle'
import { requireAuth } from '../middleware/auth'

export const kanbanRoutes = new Hono<AppBindings>()

function sanitizePathPart(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 64)
  return cleaned || fallback
}

/**
 * The route's write surfaces share one attempt budget: the budget itself is the throttle's
 * (`consumeAttemptBudget`), and this wrapper only translates a spent budget into the 429 the
 * API contract speaks, with the same window and lock the upload budget has always run on.
 */
async function enforceKanbanThrottle(
  db: D1Database,
  target: { key: string; maxAttempts: number; action: string },
): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: target.key,
      maxAttempts: target.maxAttempts,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many ${target.action}. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }
}

/**
 * The quota is answered from one D1 query: every kanban upload writes its own row into the same
 * `attachments` table the note attachments use, so the ledger stays in one place. This used to walk
 * the whole R2 bucket per upload to add up the objects — an O(bucket) list on every file — and the
 * kanban objects were invisible to D1. Objects uploaded before rows existed are not in the ledger
 * and are counted as nothing: the quota undercounts rather than blocking uploads that fit.
 */
async function assertWithinStorageQuota(db: D1Database, userId: string, incomingBytes: number): Promise<void> {
  const usage = await db.prepare(
    `SELECT COALESCE(SUM(size), 0) AS bytes FROM attachments WHERE user_id = ?1`,
  ).bind(userId).first<{ bytes: number }>()
  if ((usage?.bytes ?? 0) + incomingBytes > LIMITS.attachmentQuotaBytesR2) {
    throw ApiError.tooLarge('The account storage quota has been reached')
  }
}

/** The ledger row a kanban upload owes the quota: same table, no note, `r2` storage, its own key. */
async function writeKanbanAttachmentRow(
  db: D1Database,
  row: {
    id: string
    userId: string
    filename: string
    mime: string
    size: number
    sha256: string
    objectKey: string
  },
): Promise<void> {
  await db.prepare(
    `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height, storage, object_key, created_at)
     VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5, ?6, NULL, NULL, 'r2', ?7, ?8)`,
  ).bind(
    row.id,
    row.userId,
    row.filename,
    row.mime,
    row.size,
    row.sha256,
    row.objectKey,
    Date.now(),
  ).run()
}

async function readUploadInput(
  c: Context<AppBindings>,
): Promise<{ file: File; bytes: Uint8Array; rawKanbanName: unknown; files: R2Bucket }> {
  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.attachment)
  const file = form.get('file')
  if (!file || typeof file === 'string') {
    throw ApiError.badRequest('No file uploaded')
  }
  if (file.size > LIMITS.attachmentMaxBytes) {
    throw ApiError.tooLarge('The file exceeds the 25 MB limit')
  }
  if (!c.env.FILES) {
    throw new ApiError(
      503,
      'storage_unavailable',
      'Attachment storage is not configured. Bind R2 before uploading files.',
    )
  }
  return {
    file,
    bytes: new Uint8Array(await file.arrayBuffer()),
    rawKanbanName: form.get('kanbanName'),
    files: c.env.FILES,
  }
}

/**
 * Stores the object, then its ledger row — in that order, so a row failure can take the object back
 * down and leave the quota's ledger truthful. An object without its row would be invisible to the
 * quota for good, which is why the row failure fails the whole upload.
 */
async function storeKanbanAttachment(
  db: D1Database,
  files: R2Bucket,
  upload: {
    id: string
    userId: string
    kanbanName: string
    filename: string
    mime: string
    bytes: Uint8Array
  },
): Promise<string> {
  const r2Key = `kanban/${upload.kanbanName}/${upload.id}-${upload.filename}`
  await files.put(r2Key, upload.bytes, {
    httpMetadata: { contentType: upload.mime, cacheControl: 'private, max-age=3600' },
    customMetadata: {
      userId: upload.userId,
      objectId: upload.id,
      kind: 'kanban-attachment',
      kanbanName: upload.kanbanName,
    },
  })
  try {
    await writeKanbanAttachmentRow(db, {
      id: upload.id,
      userId: upload.userId,
      filename: upload.filename,
      mime: upload.mime,
      size: upload.bytes.byteLength,
      sha256: await sha256Hex(upload.bytes),
      objectKey: r2Key,
    })
  } catch (error) {
    // The object deletion itself is best-effort — if even that fails the object waits for the
    // orphan reclaim pass instead of masking the row error that is being rethrown.
    await files.delete(r2Key).catch((cleanupError) => {
      console.warn('[inkstone] Kanban upload object left behind after its quota row failed:', cleanupError)
    })
    throw error
  }
  return r2Key
}

kanbanRoutes.post('/upload', requireAuth, async (c) => {
  const userId = c.get('userId')
  await enforceKanbanThrottle(c.env.DB, {
    key: `kanban-upload:${userId}`,
    maxAttempts: LIMITS.attachmentUploadsPerHour,
    action: 'uploads',
  })

  const { file, bytes, rawKanbanName, files } = await readUploadInput(c)
  await assertWithinStorageQuota(c.env.DB, userId, bytes.byteLength)

  const cleanKanbanName = sanitizePathPart(typeof rawKanbanName === 'string' ? rawKanbanName : 'default', 'default')
  const cleanFilename = sanitizePathPart(file.name || 'file', 'file')
  const id = newId()
  const mime = safeAttachmentMime(bytes, file.type)

  const r2Key = await storeKanbanAttachment(c.env.DB, files, {
    id,
    userId,
    kanbanName: cleanKanbanName,
    filename: cleanFilename,
    mime,
    bytes,
  })

  return c.json({
    id,
    name: file.name,
    size: bytes.byteLength,
    mime,
    url: `/api/kanban/file/${cleanKanbanName}/${id}-${cleanFilename}`,
    r2Key,
  })
})

const DANGEROUS_INLINE_MIMES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
])

function isSafeInlineMime(mime: string): boolean {
  const normalized = mime.toLowerCase()
  if (DANGEROUS_INLINE_MIMES.has(normalized)) return false
  if (normalized.startsWith('image/')) return true
  if (normalized === 'application/pdf') return true
  if (normalized.startsWith('text/') && !normalized.includes('html')) return true
  return false
}

function ownerOf(customMetadata: Record<string, string> | undefined): string | null {
  return customMetadata?.userId ?? null
}

kanbanRoutes.get('/file/:kanbanName/:filename', requireAuth, async (c) => {
  const kanbanName = sanitizePathPart(c.req.param('kanbanName'), 'default')
  const filename = sanitizePathPart(c.req.param('filename'), 'file')
  const r2Key = `kanban/${kanbanName}/${filename}`

  if (!c.env.FILES) {
    throw ApiError.notFound('Storage is not configured or file not found')
  }

  const object = await c.env.FILES.get(r2Key)
  if (!object) {
    throw ApiError.notFound('File not found')
  }
  // Objects predating owner metadata are treated as unreadable rather than public.
  if (ownerOf(object.customMetadata) !== c.get('userId')) {
    throw ApiError.forbidden('You do not have permission to read this file')
  }

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream'
  const isInline = isSafeInlineMime(contentType)
  const disposition = `${isInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`

  return new Response(object.body as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
})

kanbanRoutes.delete('/file/:kanbanName/:filename', requireAuth, async (c) => {
  const userId = c.get('userId')
  await enforceKanbanThrottle(c.env.DB, {
    key: `kanban-delete:${userId}`,
    maxAttempts: LIMITS.attachmentDeletesPerHour,
    action: 'deletions',
  })

  const kanbanName = sanitizePathPart(c.req.param('kanbanName'), 'default')
  const filename = sanitizePathPart(c.req.param('filename'), 'file')
  const r2Key = `kanban/${kanbanName}/${filename}`

  if (c.env.FILES) {
    const head = await c.env.FILES.head(r2Key)
    if (!head) {
      throw ApiError.notFound('File not found')
    }
    const ownerId = ownerOf(head.customMetadata)
    // Same rule as GET: an object without owner metadata is nobody's to delete.
    if (!ownerId || ownerId !== userId) {
      throw ApiError.forbidden('You do not have permission to delete this file')
    }
    await c.env.FILES.delete(r2Key)
    // The ledger row goes with the object, or the quota would keep charging for a file that is gone.
    // Objects predating the ledger have no row, and the delete is simply a no-op for them.
    await c.env.DB.prepare(
      `DELETE FROM attachments WHERE user_id = ?1 AND object_key = ?2 AND note_id IS NULL`,
    ).bind(userId, r2Key).run()
  }

  return c.json({ ok: true })
})
