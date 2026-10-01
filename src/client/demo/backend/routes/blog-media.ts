import type { Context } from 'hono'
import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { Attachment, BlogMediaItem } from '@shared/types'
import { newDemoId, type DemoState } from '../../state'
import { apiError } from '../helpers/info'
import { browserFileUrl, revokeAttachment } from '../helpers/files'
import type { BlogDemoData } from './blog-seed'

/**
 * The demo's media library (FEA-07): the same read/upload/delete contract the worker answers,
 * backed by the demo's in-memory attachments. A picture a note owns or a post shows is refused
 * exactly as the worker refuses it, so the picker's failure path is exercised in demo mode too.
 */

const DEMO_MEDIA_LIMIT = 200

function toDemoMediaItem(meta: Attachment): BlogMediaItem {
  return {
    id: meta.id,
    filename: meta.filename,
    mime: meta.mime,
    size: meta.size,
    width: meta.width,
    height: meta.height,
    createdAt: meta.createdAt,
    previewUrl: `/api/files/${meta.id}?preview=1`,
    // The demo serves attachments from its own files route; a cover stored here points at that,
    // which is why the delete guard below compares against this same value.
    publicUrl: `/api/files/${meta.id}`,
  }
}

function demoMediaItems(state: DemoState): BlogMediaItem[] {
  return [...state.attachments.values()]
    .filter((attachment) => attachment.meta.mime.startsWith('image/'))
    .sort((a, b) => b.meta.createdAt - a.meta.createdAt || b.meta.id.localeCompare(a.meta.id))
    .slice(0, DEMO_MEDIA_LIMIT)
    .map((attachment) => toDemoMediaItem(attachment.meta))
}

async function uploadDemoMedia(c: Context, state: DemoState): Promise<Response> {
  const form = await c.req.raw.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return apiError(400, 'bad_request', 'Missing file')
  if (file.size > LIMITS.attachmentMaxBytes) {
    return apiError(413, 'payload_too_large', 'The file exceeds the 25 MB limit')
  }
  if (!file.type.startsWith('image/')) {
    return apiError(400, 'bad_request', 'Only image files can be used as a cover')
  }
  const id = newDemoId()
  const meta: Attachment = {
    id,
    noteId: null,
    filename: file.name || 'image',
    mime: file.type,
    size: file.size,
    width: null,
    height: null,
    url: await browserFileUrl(file),
    createdAt: Date.now(),
  }
  state.attachments.set(id, { meta, file })
  return c.json(toDemoMediaItem(meta), 201)
}

/** The first live post showing this picture, mirroring the worker's refusal to remove a used cover. */
function demoPostUsingMedia(data: BlogDemoData, publicUrl: string): { title: string } | null {
  return data.posts.find((post) => post.coverUrl === publicUrl || post.seoImageUrl === publicUrl) ?? null
}

function deleteDemoMedia(c: Context, state: DemoState, data: BlogDemoData): Response {
  const id = c.req.param('id') ?? ''
  const attachment = state.attachments.get(id)
  if (!attachment) return apiError(404, 'not_found', 'Media not found')
  if (attachment.meta.noteId) {
    return apiError(400, 'bad_request', 'This image belongs to a note; remove it from the attachment library instead')
  }
  const used = demoPostUsingMedia(data, toDemoMediaItem(attachment.meta).publicUrl)
  if (used) {
    return apiError(400, 'bad_request', `This image is the cover of "${used.title}"; change that post first`)
  }
  revokeAttachment(attachment.meta.url)
  state.attachments.delete(id)
  return c.json({ ok: true as const })
}

export function registerBlogMediaRoutes(app: Hono, state: DemoState, data: BlogDemoData): void {
  app.get('/api/blog/media', (c) => c.json({ media: demoMediaItems(state) }))
  app.post('/api/blog/media', (c) => uploadDemoMedia(c, state))
  app.delete('/api/blog/media/:id', (c) => deleteDemoMedia(c, state, data))
}
