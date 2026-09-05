import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import type { SyncResponse } from '@shared/types'
import { listFolders, listTags, newDemoId, summarize } from '../../state'
import { apiError } from '../helpers/info'
import { attachmentReferenceCounts, browserFileUrl, revokeAttachment } from '../helpers/files'

export function registerFilesRoutes(app: Hono, state: DemoState): void {
  app.get('/api/sync', (c) => {
    const since = Number(c.req.query('since')) || 0
    const hasChanged = since < state.cursor
    // Match the real worker contract: facetsFull may only be true when the response carries the
    // complete folders/tags lists. The demo always sends full snapshots when anything changed, so
    // the flag follows `hasChanged`; a no-change catchup must not claim completeness (it would make
    // the client's full-snapshot consolidation replace its freshly collected folders with []).
    const response: SyncResponse = {
      cursor: state.cursor,
      full: hasChanged,
      hasMore: false,
      nextKey: null,
      facetsFull: hasChanged,
      settingsChanged: false,
      profileChanged: false,
      notes: hasChanged ? [...state.notes.values()].map(summarize) : [],
      folders: hasChanged ? listFolders(state) : [],
      tags: hasChanged ? listTags(state) : [],
      deletions: [],
      serverTime: Date.now(),
    }
    return c.json(response)
  })

  app.post('/api/files/prune', (c) => {
    const references = attachmentReferenceCounts(state)
    let removed = 0
    let freedBytes = 0
    for (const [id, attachment] of state.attachments) {
      if ((references.get(id) ?? 0) > 0) continue
      revokeAttachment(attachment.meta.url)
      state.attachments.delete(id)
      removed++
      freedBytes += attachment.meta.size
    }
    return c.json({ removed, freedBytes })
  })
  app.get('/api/files', (c) => {
    const references = attachmentReferenceCounts(state)
    return c.json({
      files: [...state.attachments.values()].map((item) => ({
        ...item.meta,
        references: references.get(item.meta.id) ?? 0,
      })),
      nextCursor: null,
    })
  })
  app.post('/api/files', async (c) => {
    const form = await c.req.raw.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return apiError(400, 'bad_request', 'Missing file')
    if (file.size > LIMITS.attachmentMaxBytes) {
      return apiError(413, 'payload_too_large', 'The file exceeds the 25 MB limit')
    }
    const usedBytes = [...state.attachments.values()]
      .reduce((total, attachment) => total + attachment.meta.size, 0)
    if (usedBytes + file.size > LIMITS.attachmentQuotaBytes) {
      return apiError(413, 'payload_too_large', 'The account attachment quota has been reached')
    }
    const rawNoteId = form.get('noteId')
    const noteId = typeof rawNoteId === 'string' && rawNoteId ? rawNoteId.slice(0, 128) : null
    if (noteId) {
      const note = state.notes.get(noteId)
      if (!note || note.deletedAt !== null) {
        return apiError(400, 'bad_request', 'The associated note does not exist')
      }
    }
    const id = newDemoId()
    const url = await browserFileUrl(file)
    const meta = {
      id,
      noteId,
      filename: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      width: null,
      height: null,
      url,
      createdAt: Date.now(),
    }
    state.attachments.set(id, { meta, file })
    return c.json(meta, 201)
  })
  app.get('/api/files/:id', (c) => {
    const attachment = state.attachments.get(c.req.param('id'))
    return attachment
      ? new Response(attachment.file, { headers: { 'Content-Type': attachment.meta.mime } })
      : apiError(404, 'not_found', 'Attachment not found')
  })
  app.delete('/api/files/:id', (c) => {
    const attachment = state.attachments.get(c.req.param('id'))
    if (!attachment) return apiError(404, 'not_found', 'Attachment not found')
    revokeAttachment(attachment.meta.url)
    state.attachments.delete(attachment.meta.id)
    return c.json({ ok: true as const })
  })
}
