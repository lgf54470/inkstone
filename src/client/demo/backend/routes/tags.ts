import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import { replaceTagInContent } from '@shared/markdown-utils'
import { listTags, newDemoId, refreshNote } from '../../state'
import { jsonBody, apiError } from '../helpers/info'

export function registerTagsRoutes(app: Hono, state: DemoState): void {
  app.get('/api/tags', (c) => c.json({ tags: listTags(state) }))
  app.post('/api/tags', async (c) => {
    const body = await jsonBody(c.req.raw)
    if (body.id !== undefined && (typeof body.id !== 'string' || !/^[0-9a-hjkmnp-tv-z]{26}$/.test(body.id))) {
      return apiError(400, 'bad_request', 'id must be a valid tag id')
    }
    const requestedId = typeof body.id === 'string' ? body.id : null
    const existingById = requestedId ? listTags(state).find((tag) => tag.id === requestedId) : null
    if (existingById) return c.json(existingById)
    const name = typeof body.name === 'string' ? body.name.trim().replace(/^#+/, '') : ''
    if (!name || /[\s#]/.test(name) || name.length > LIMITS.tagNameMaxLength) {
      return apiError(400, 'bad_request', 'Tag name is invalid')
    }
    const existing = listTags(state).find((tag) =>
      tag.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0)
    if (existing) return apiError(409, 'conflict', 'A tag with this name already exists')
    const id = requestedId ?? newDemoId()
    state.tagIds.set(name, id)
    state.tagColors.set(name, body.color === null || typeof body.color === 'string' ? body.color : null)
    state.cursor++
    return c.json(listTags(state).find((tag) => tag.id === id)!, 201)
  })
  app.patch('/api/tags/:id', async (c) => {
    const current = listTags(state).find((tag) => tag.id === c.req.param('id'))
    if (!current) return apiError(404, 'not_found', 'Tag not found')
    const body = await jsonBody(c.req.raw)
    if (typeof body.color === 'string' && !/^#[0-9a-f]{6}$/i.test(body.color)) {
      return apiError(400, 'bad_request', 'Tag color must be a six-digit hexadecimal color')
    }
    if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== current.name) {
      const requestedName = body.name.trim().replace(/^#/, '')
      const existing = listTags(state).find((tag) => tag.id !== current.id
        && tag.name.localeCompare(requestedName, undefined, { sensitivity: 'base' }) === 0)
      const nextName = existing?.name ?? requestedName
      let renamed = 0
      for (const note of state.notes.values()) {
        const content = replaceTagInContent(note.content, current.name, nextName)
        if (content === note.content) continue
        state.notes.set(note.id, refreshNote({ ...note, rev: note.rev + 1, updatedAt: Date.now() }, content))
        renamed++
      }
      state.tagIds.delete(current.name)
      if (!existing) state.tagIds.set(nextName, current.id)
      state.tagColors.set(nextName, body.color === null || typeof body.color === 'string'
        ? body.color
        : state.tagColors.get(nextName) ?? state.tagColors.get(current.name) ?? null)
      state.tagColors.delete(current.name)
      state.cursor++
      return c.json({ ok: true as const, renamed })
    }
    if (body.color === null || typeof body.color === 'string') state.tagColors.set(current.name, body.color)
    state.cursor++
    return c.json(listTags(state).find((tag) => tag.id === current.id) ?? current)
  })
  app.delete('/api/tags/:id', (c) => {
    const current = listTags(state).find((tag) => tag.id === c.req.param('id'))
    if (!current) return apiError(404, 'not_found', 'Tag not found')
    let affected = 0
    for (const note of state.notes.values()) {
      const content = replaceTagInContent(note.content, current.name, null)
      if (content === note.content) continue
      state.notes.set(note.id, refreshNote({ ...note, rev: note.rev + 1, updatedAt: Date.now() }, content))
      affected++
    }
    state.tagIds.delete(current.name)
    state.tagColors.delete(current.name)
    state.cursor++
    return c.json({ ok: true as const, affected })
  })
}
