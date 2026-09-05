import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import type { PublicNote, ShareFolder, ShareInfo, ShareTag } from '@shared/types'
import { newDemoId } from '../../state'
import { jsonBody, apiError } from '../helpers/info'
import { absoluteShare } from '../helpers/files'

export function registerShareAdminRoutes(app: Hono, state: DemoState): void {
  app.get('/api/share/folders', (c) => {
    return c.json({ folders: [...state.shareFolders.values()] })
  })
  app.post('/api/share/folders', async (c) => {
    const body = await jsonBody(c.req.raw)
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Folder'
    const parentId = typeof body.parentId === 'string' ? body.parentId : null
    const color = typeof body.color === 'string' ? body.color : null
    const icon = typeof body.icon === 'string' ? body.icon : null
    const folder: ShareFolder = {
      id: newDemoId(),
      parentId,
      name,
      icon,
      color,
      position: state.shareFolders.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    state.shareFolders.set(folder.id, folder)
    return c.json({ folder })
  })
  app.patch('/api/share/folders/:id', async (c) => {
    const id = c.req.param('id')
    const folder = state.shareFolders.get(id)
    if (!folder) return apiError(404, 'not_found', 'Share folder not found')
    const body = await jsonBody(c.req.raw)
    if (body.name !== undefined) folder.name = String(body.name).trim() || folder.name
    if (body.parentId !== undefined) folder.parentId = body.parentId as string | null
    if (body.color !== undefined) folder.color = body.color as string | null
    if (body.icon !== undefined) folder.icon = body.icon as string | null
    folder.updatedAt = Date.now()
    return c.json({ folder })
  })
  app.delete('/api/share/folders/:id', (c) => {
    const id = c.req.param('id')
    state.shareFolders.delete(id)
    for (const share of state.shares.values()) {
      if (share.info.shareFolderId === id) share.info.shareFolderId = null
    }
    return c.json({ ok: true as const })
  })

  app.get('/api/share/tags', (c) => {
    return c.json({ tags: [...state.shareTags.values()] })
  })
  app.post('/api/share/tags', async (c) => {
    const body = await jsonBody(c.req.raw)
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Tag'
    const color = typeof body.color === 'string' ? body.color : null
    const existing = [...state.shareTags.values()].find((t) => t.name === name)
    if (existing) return c.json({ tag: existing })
    const tag: ShareTag = {
      id: newDemoId(),
      name,
      color,
      isPinned: false,
      createdAt: Date.now(),
    }
    state.shareTags.set(tag.id, tag)
    return c.json({ tag })
  })
  app.patch('/api/share/tags/:id', async (c) => {
    const id = c.req.param('id')
    const tag = state.shareTags.get(id)
    if (!tag) return apiError(404, 'not_found', 'Share tag not found')
    const body = await jsonBody(c.req.raw)
    if (body.name !== undefined) tag.name = String(body.name).trim() || tag.name
    if (body.color !== undefined) tag.color = body.color as string | null
    if (body.isPinned !== undefined) tag.isPinned = Boolean(body.isPinned)
    return c.json({ tag })
  })
  app.delete('/api/share/tags/:id', (c) => {
    const id = c.req.param('id')
    const tag = state.shareTags.get(id)
    if (tag) {
      for (const share of state.shares.values()) {
        if (share.info.shareTags) {
          share.info.shareTags = share.info.shareTags.filter((t) => t !== tag.name)
        }
      }
      state.shareTags.delete(id)
    }
    return c.json({ ok: true as const })
  })

  app.post('/api/share/batch-toggle-group', async (c) => {
    const body = await jsonBody(c.req.raw)
    const { type, target, enabled } = body as { type: 'folder' | 'tag'; target: string; enabled: boolean }
    let count = 0
    for (const share of state.shares.values()) {
      let hasMatched = false
      if (type === 'folder' && share.info.shareFolderId === target) hasMatched = true
      if (type === 'tag' && share.info.shareTags?.includes(target)) hasMatched = true
      if (hasMatched) {
        share.info.isEnabled = enabled
        count++
      }
    }
    return c.json({ ok: true as const, count })
  })

  app.post('/api/share/batch-folder', async (c) => {
    const body = await jsonBody(c.req.raw)
    const { folderId, enabled } = body as { folderId: string; enabled: boolean }
    let count = 0
    for (const [noteId, note] of state.notes.entries()) {
      if (note.folderId === folderId && note.deletedAt === null) {
        const share = state.shares.get(noteId)
        if (share) {
          share.info.isEnabled = enabled
          count++
        }
      }
    }
    return c.json({ ok: true as const, count })
  })

  app.post('/api/share/batch-tag', async (c) => {
    const body = await jsonBody(c.req.raw)
    const { tag, enabled } = body as { tag: string; enabled: boolean }
    let count = 0
    for (const [noteId, note] of state.notes.entries()) {
      if (note.deletedAt === null && note.tags?.includes(tag)) {
        const share = state.shares.get(noteId)
        if (share) {
          share.info.isEnabled = enabled
          count++
        }
      }
    }
    return c.json({ ok: true as const, count })
  })

  app.get('/api/share/note-share/:noteId', (c) => {
    const share = state.shares.get(c.req.param('noteId'))
    return c.json({ share: share ? absoluteShare(share.info, c.req.url) : null })
  })
  app.get('/api/share/:noteId', (c) => {
    const share = state.shares.get(c.req.param('noteId'))
    return c.json({ share: share ? absoluteShare(share.info, c.req.url) : null })
  })
  app.post('/api/share/:noteId', async (c) => {
    const noteId = c.req.param('noteId')
    const note = state.notes.get(noteId)
    if (!note || note.deletedAt !== null) return apiError(404, 'not_found', 'Note not found')
    const body = await jsonBody(c.req.raw)
    if (body.password !== undefined && body.password !== null && typeof body.password !== 'string') {
      return apiError(400, 'bad_request', 'password must be a string or null')
    }
    if (
      body.expiresIn !== undefined &&
      body.expiresIn !== null &&
      (typeof body.expiresIn !== 'number' || !Number.isFinite(body.expiresIn) || body.expiresIn < 0)
    ) {
      return apiError(400, 'bad_request', 'expiresIn must be a non-negative number or null')
    }
    const existing = state.shares.get(noteId)
    let expiresAt = existing?.info.expiresAt ?? null
    if (body.expiresIn !== undefined) {
      expiresAt = typeof body.expiresIn === 'number' && Number.isFinite(body.expiresIn) && body.expiresIn > 0
        ? Date.now() + Math.min(body.expiresIn, 365 * 24 * 60 * 60 * 1000)
        : null
    }
    if (typeof body.password === 'string' && body.password.length > LIMITS.passwordMaxLength) {
      return apiError(400, 'bad_request', `The access password must not exceed ${LIMITS.passwordMaxLength} characters`)
    }
    if (typeof body.password === 'string' && body.password.length > 0 && body.password.length < 4) {
      return apiError(400, 'bad_request', 'The access password must be at least 4 characters')
    }
    const password = body.password === null || typeof body.password === 'string'
      ? body.password || null
      : existing?.password ?? null
    const info: ShareInfo = {
      slug: existing?.info.slug ?? (typeof body.customSlug === 'string' && body.customSlug.trim() ? body.customSlug.trim() : `demo-${noteId}`),
      noteId,
      url: '',
      hasPassword: Boolean(password),
      expiresAt,
      views: existing?.info.views ?? 0,
      createdAt: existing?.info.createdAt ?? Date.now(),
      isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : existing?.info.isEnabled ?? true,
      lastViewedAt: existing?.info.lastViewedAt ?? null,
      shareFolderId: body.folderId !== undefined ? (body.folderId as string | null) : existing?.info.shareFolderId ?? null,
      shareTags: Array.isArray(body.tags) ? (body.tags as string[]) : existing?.info.shareTags ?? [],
    }
    state.shares.set(noteId, { info, password })
    return c.json({ share: absoluteShare(info, c.req.url) })
  })
  app.delete('/api/share/:noteId', (c) => {
    state.shares.delete(c.req.param('noteId'))
    return c.json({ ok: true as const })
  })
  app.post('/api/public/:slug', async (c) => {
    const share = [...state.shares.values()].find((item) => item.info.slug === c.req.param('slug'))
    if (!share || (share.info.expiresAt !== null && share.info.expiresAt <= Date.now())) {
      return apiError(404, 'not_found', 'Shared note not found')
    }
    const body = await jsonBody(c.req.raw)
    if (share.password && body.password !== share.password) {
      return apiError(401, 'unauthenticated', 'Enter the share password')
    }
    const note = state.notes.get(share.info.noteId)
    if (!note || note.deletedAt !== null) return apiError(404, 'not_found', 'Shared note not found')
    share.info = { ...share.info, views: share.info.views + 1 }
    const response: PublicNote = {
      title: note.title,
      content: note.content,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      author: { name: state.user.name, avatarUrl: state.user.avatarUrl },
      site: { name: 'Inkstone Demo' },
      share: { slug: share.info.slug },
    }
    return c.json(response)
  })
}
