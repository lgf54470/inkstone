import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { CommunityTemplate } from '@shared/types'
import { newDemoId } from '../../state'
import { jsonBody, apiError } from '../helpers/info'

export function registerTemplatesRoutes(app: Hono, state: DemoState): void {
  app.get('/api/templates/community', (c) => {
    const templates = [...state.communityTemplates].sort((a, b) => b.createdAt - a.createdAt)
    return c.json({ templates })
  })
  app.post('/api/templates/community', async (c) => {
    const body = await jsonBody(c.req.raw)
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.content !== 'string' || !body.content.trim()) {
      return apiError(400, 'bad_request', 'name and content are required')
    }
    const id = typeof body.id === 'string' ? body.id : newDemoId()
    const existing = state.communityTemplates.find((item) => item.id === id)
    if (existing && existing.authorId !== state.user.id) {
      return apiError(403, 'forbidden', 'Only the author can update a published template')
    }
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : []
    const template: CommunityTemplate = {
      id,
      authorId: state.user.id,
      authorName: state.user.name,
      name: String(body.name).trim().slice(0, 512),
      description: typeof body.description === 'string' ? body.description.slice(0, 240) : '',
      content: String(body.content),
      tags: tags.map((tag) => tag.trim().slice(0, 30)).filter(Boolean),
      category: typeof body.category === 'string' ? body.category.slice(0, 120) : '',
      createdAt: existing?.createdAt ?? Date.now(),
    }
    const index = state.communityTemplates.findIndex((item) => item.id === id)
    if (index >= 0) state.communityTemplates[index] = template
    else state.communityTemplates.push(template)
    return c.json({ template })
  })
  app.delete('/api/templates/community/:id', (c) => {
    const id = c.req.param('id')
    const existing = state.communityTemplates.find((item) => item.id === id)
    if (!existing) return apiError(404, 'not_found', 'Community template not found')
    if (existing.authorId !== state.user.id) {
      return apiError(403, 'forbidden', 'Only the author can unpublish a template')
    }
    state.communityTemplates = state.communityTemplates.filter((item) => item.id !== id)
    return c.json({ ok: true as const })
  })
}
