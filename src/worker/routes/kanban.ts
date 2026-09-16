import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { requireAuth } from '../middleware/auth'

export const kanbanRoutes = new Hono<AppBindings>()

function sanitizePathPart(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 64)
  return cleaned || fallback
}

kanbanRoutes.post('/upload', requireAuth, async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  const rawKanbanName = form.get('kanbanName')

  if (!file || typeof file === 'string') {
    throw ApiError.badRequest('No file uploaded')
  }

  if (file.size > LIMITS.attachmentMaxBytes) {
    throw ApiError.tooLarge('The file exceeds the 25 MB limit')
  }

  const cleanKanbanName = sanitizePathPart(typeof rawKanbanName === 'string' ? rawKanbanName : 'default', 'default')
  const cleanFilename = sanitizePathPart(file.name || 'file', 'file')
  const id = newId()
  const r2Key = `kanban/${cleanKanbanName}/${id}-${cleanFilename}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = file.type || 'application/octet-stream'

  if (c.env.FILES) {
    await c.env.FILES.put(r2Key, bytes, {
      httpMetadata: { contentType: mime, cacheControl: 'private, max-age=3600' },
      customMetadata: {
        userId: c.get('userId'),
        objectId: id,
        kind: 'kanban-attachment',
        kanbanName: cleanKanbanName,
      },
    })
  }

  return c.json({
    id,
    name: file.name,
    size: bytes.byteLength,
    mime,
    url: `/api/kanban/file/${cleanKanbanName}/${id}-${cleanFilename}`,
    r2Key,
  })
})

kanbanRoutes.get('/file/:kanbanName/:filename', async (c) => {
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

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream'
  const isInline = contentType.startsWith('image/') || contentType === 'application/pdf' || contentType.startsWith('text/')
  const disposition = `${isInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`

  return new Response(object.body as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

kanbanRoutes.delete('/file/:kanbanName/:filename', requireAuth, async (c) => {
  const kanbanName = sanitizePathPart(c.req.param('kanbanName'), 'default')
  const filename = sanitizePathPart(c.req.param('filename'), 'file')
  const r2Key = `kanban/${kanbanName}/${filename}`

  if (c.env.FILES) {
    await c.env.FILES.delete(r2Key)
  }

  return c.json({ ok: true })
})
