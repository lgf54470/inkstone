import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings, Env } from '../env'
import { ApiError } from '../lib/errors'
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

async function enforceUploadThrottle(db: D1Database, userId: string): Promise<void> {
  try {
    await consumeAttemptBudget(db, [{
      key: `kanban-upload:${userId}`,
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
}

async function sumStoredKanbanBytes(files: R2Bucket, userId: string): Promise<number> {
  let total = 0
  let cursor: string | undefined
  do {
    const page = await files.list({ prefix: 'kanban/', cursor, include: ['customMetadata'], limit: 1000 })
    for (const object of page.objects) {
      if (object.customMetadata?.userId === userId) total += object.size ?? 0
    }
    cursor = page.truncated ? page.cursor ?? undefined : undefined
  } while (cursor)
  return total
}

async function assertWithinStorageQuota(env: Env, userId: string, incomingBytes: number): Promise<void> {
  const usage = await env.DB.prepare(
    `SELECT COALESCE(SUM(size), 0) AS bytes FROM attachments WHERE user_id = ?1`,
  ).bind(userId).first<{ bytes: number }>()
  const stored = env.FILES ? await sumStoredKanbanBytes(env.FILES, userId) : 0
  if ((usage?.bytes ?? 0) + stored + incomingBytes > LIMITS.attachmentQuotaBytesR2) {
    throw ApiError.tooLarge('The account storage quota has been reached')
  }
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

kanbanRoutes.post('/upload', requireAuth, async (c) => {
  const userId = c.get('userId')
  await enforceUploadThrottle(c.env.DB, userId)

  const { file, bytes, rawKanbanName, files } = await readUploadInput(c)
  await assertWithinStorageQuota(c.env, userId, bytes.byteLength)

  const cleanKanbanName = sanitizePathPart(typeof rawKanbanName === 'string' ? rawKanbanName : 'default', 'default')
  const cleanFilename = sanitizePathPart(file.name || 'file', 'file')
  const id = newId()
  const r2Key = `kanban/${cleanKanbanName}/${id}-${cleanFilename}`
  const mime = safeAttachmentMime(bytes, file.type)

  await files.put(r2Key, bytes, {
    httpMetadata: { contentType: mime, cacheControl: 'private, max-age=3600' },
    customMetadata: {
      userId,
      objectId: id,
      kind: 'kanban-attachment',
      kanbanName: cleanKanbanName,
    },
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
  const kanbanName = sanitizePathPart(c.req.param('kanbanName'), 'default')
  const filename = sanitizePathPart(c.req.param('filename'), 'file')
  const r2Key = `kanban/${kanbanName}/${filename}`

  if (c.env.FILES) {
    const head = await c.env.FILES.head(r2Key)
    if (!head) {
      throw ApiError.notFound('File not found')
    }
    const ownerId = ownerOf(head.customMetadata)
    const currentUserId = c.get('userId')
    // Same rule as GET: an object without owner metadata is nobody's to delete.
    if (!ownerId || ownerId !== currentUserId) {
      throw ApiError.forbidden('You do not have permission to delete this file')
    }
    await c.env.FILES.delete(r2Key)
  }

  return c.json({ ok: true })
})
