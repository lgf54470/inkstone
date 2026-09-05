import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import { organizerColorOrNull } from '@shared/organizer-colors'
import type { Folder } from '@shared/types'
import { listFolders, newDemoId } from '../../state'
import { jsonBody, apiError } from '../helpers/info'
import { demoFolderSiblings, availableDemoFolderName, demoFolderDepth, demoFolderHeight, promoteDemoFolderChildren, folderDescendants } from '../helpers/folders'

export function registerFoldersRoutes(app: Hono, state: DemoState): void {
  app.get('/api/folders', (c) => c.json({ folders: listFolders(state) }))
  app.post('/api/folders', async (c) => {
    const body = await jsonBody(c.req.raw)
    if (body.id !== undefined && (typeof body.id !== 'string' || !/^[0-9a-hjkmnp-tv-z]{26}$/.test(body.id))) {
      return apiError(400, 'bad_request', 'id must be a valid folder id')
    }
    const requestedId = typeof body.id === 'string' ? body.id : null
    const existing = requestedId ? state.folders.get(requestedId) : null
    if (existing) return c.json(existing)
    const parentId = body.parentId === null || body.parentId === undefined
      ? null
      : typeof body.parentId === 'string' && state.folders.has(body.parentId)
        ? body.parentId
        : undefined
    if (parentId === undefined) return apiError(400, 'bad_request', 'The parent folder does not exist')
    if (parentId && demoFolderDepth(state, parentId) >= LIMITS.folderDepthMax) {
      return apiError(400, 'bad_request', `Folder depth cannot exceed ${LIMITS.folderDepthMax} levels`)
    }
    const now = Date.now()
    const siblings = demoFolderSiblings(state, parentId)
    const requestedName = typeof body.name === 'string' ? body.name.trim() : ''
    if (requestedName.length > LIMITS.folderNameMaxLength) {
      return apiError(400, 'bad_request', 'Folder name is too long')
    }
    const name = requestedName || availableDemoFolderName(siblings, 'New folder')
    if (siblings.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return apiError(409, 'conflict', 'A sibling already uses this name')
    }
    const folder: Folder = {
      id: requestedId ?? newDemoId(),
      parentId,
      name,
      icon: typeof body.icon === 'string' ? body.icon : null,
      color: organizerColorOrNull(body.color),
      position: (siblings.at(-1)?.position ?? 0) + 1000,
      createdAt: now,
      updatedAt: now,
      noteCount: 0,
    }
    state.folders.set(folder.id, folder)
    state.cursor++
    return c.json(folder, 201)
  })
  app.patch('/api/folders/:id', async (c) => {
    const current = state.folders.get(c.req.param('id'))
    if (!current) return apiError(404, 'not_found', 'Folder not found')
    const body = await jsonBody(c.req.raw)
    if ('beforeId' in body && !('parentId' in body)) {
      return apiError(400, 'bad_request', 'parentId is required when reordering a folder')
    }
    const parentId = body.parentId === undefined
      ? current.parentId
      : body.parentId === null
        ? null
        : typeof body.parentId === 'string' && state.folders.has(body.parentId)
          ? body.parentId
          : undefined
    if (parentId === undefined) return apiError(400, 'bad_request', 'The parent folder does not exist')
    if (parentId === current.id || folderDescendants(state, current.id).has(parentId ?? '')) {
      return apiError(400, 'bad_request', 'A folder cannot be moved into its own descendant')
    }
    if ((parentId ? demoFolderDepth(state, parentId) : 0) + demoFolderHeight(state, current.id) > LIMITS.folderDepthMax) {
      return apiError(400, 'bad_request', `Folder depth cannot exceed ${LIMITS.folderDepthMax} levels`)
    }
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : current.name
    if (name.length > LIMITS.folderNameMaxLength) {
      return apiError(400, 'bad_request', 'Folder name is too long')
    }
    if (demoFolderSiblings(state, parentId, current.id).some(
      (folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )) return apiError(409, 'conflict', 'A sibling already uses this name')
    const updated: Folder = {
      ...current,
      name,
      parentId,
      icon: body.icon === null || typeof body.icon === 'string' ? body.icon : current.icon,
      color: 'color' in body ? organizerColorOrNull(body.color) : current.color,
      updatedAt: Date.now(),
    }
    const shouldPlace = 'beforeId' in body || parentId !== current.parentId
    if (shouldPlace) {
      const siblings = demoFolderSiblings(state, parentId, current.id)
      const beforeId = body.beforeId === null || body.beforeId === undefined
        ? null
        : typeof body.beforeId === 'string'
          ? body.beforeId
          : undefined
      if (beforeId === undefined || beforeId === current.id) {
        return apiError(400, 'bad_request', 'The target folder is invalid')
      }
      const index = beforeId === null ? siblings.length : siblings.findIndex((folder) => folder.id === beforeId)
      if (index < 0) return apiError(400, 'bad_request', 'The target folder is not in the destination')
      siblings.splice(index, 0, updated)
      siblings.forEach((folder, orderIndex) => {
        state.folders.set(folder.id, {
          ...folder,
          parentId,
          position: (orderIndex + 1) * 1000,
          updatedAt: folder.id === updated.id ? updated.updatedAt : folder.updatedAt,
        })
      })
    } else {
      state.folders.set(updated.id, updated)
    }
    state.cursor++
    return c.json(state.folders.get(updated.id)!)
  })
  app.delete('/api/folders/:id', (c) => {
    const root = state.folders.get(c.req.param('id'))
    if (!root) return apiError(404, 'not_found', 'Folder not found')
    const strategy = c.req.query('strategy') === 'delete' ? 'delete' : 'move-up'
    const descendants = folderDescendants(state, root.id)
    if (strategy === 'delete') {
      const now = Date.now()
      for (const note of state.notes.values()) {
        if (descendants.has(note.folderId ?? '')) {
          state.notes.set(note.id, { ...note, folderId: null, deletedAt: now, updatedAt: now, rev: note.rev + 1 })
        }
      }
      for (const id of descendants) state.folders.delete(id)
    } else {
      promoteDemoFolderChildren(state, root)
      for (const note of state.notes.values()) {
        if (note.folderId === root.id) state.notes.set(note.id, { ...note, folderId: root.parentId })
      }
      state.folders.delete(root.id)
    }
    state.cursor++
    return c.json({ ok: true as const })
  })
}
