import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { z } from 'zod'

import { createScopedFolder, createScopedTag, deleteScopedFolder, deleteScopedTag, listScopedFolders, listScopedTags, updateScopedFolder, updateScopedTag } from '../../lib/scoped-organizer'
import { JSON_BODY_LIMITS, readJson, readJsonValidated } from '../../lib/request'
import { isValidCustomSlug } from '../../lib/share-analytics'

const shareGroupToggleSchema = z.object({
  type: z.enum(['folder', 'tag']),
  target: z.string().min(1).max(200),
  enabled: z.boolean(),
})

export function registerShareOrganizerRoutes(shareManageRoutes: Hono<AppBindings>): void {
  registerShareSlugCheckRoute(shareManageRoutes)
  registerShareFolderRoutes(shareManageRoutes)
  registerShareTagRoutes(shareManageRoutes)
  registerShareGroupToggleRoute(shareManageRoutes)
}

function registerShareSlugCheckRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/check-slug', async (c) => {
    const slug = c.req.query('slug') || ''
    const currentNoteId = c.req.query('currentNoteId')
    if (!isValidCustomSlug(slug)) {
      return c.json({ available: false, reason: 'invalid_format' })
    }
    const existing = await c.env.DB.prepare(
      `SELECT note_id FROM shares WHERE slug = ?1`,
    )
      .bind(slug)
      .first<{ note_id: string }>()

    if (existing && existing.note_id !== currentNoteId) {
      return c.json({ available: false, reason: 'already_taken' })
    }
    return c.json({ available: true })
  })
}

function registerShareFolderRoutes(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/folders', async (c) => {
    return c.json(await listScopedFolders(c.env.DB, 'share_folders', c.get('userId')))
  })
  shareManageRoutes.post('/folders', async (c) => {
    const body = await readJson<Parameters<typeof createScopedFolder>[3]>(c, JSON_BODY_LIMITS.small)
    return c.json(await createScopedFolder(c.env.DB, 'share_folders', c.get('userId'), body), 201)
  })
  shareManageRoutes.patch('/folders/:id', async (c) => {
    const body = await readJson<Parameters<typeof createScopedFolder>[3]>(c, JSON_BODY_LIMITS.small)
    return c.json(await updateScopedFolder(c.env.DB, 'share_folders', c.get('userId'), c.req.param('id'), body))
  })
  shareManageRoutes.delete('/folders/:id', async (c) => {
    await deleteScopedFolder(c.env.DB, 'share_folders', 'shares', c.get('userId'), c.req.param('id'))
    return c.json({ ok: true })
  })
}

function registerShareTagRoutes(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.get('/tags', async (c) => {
    return c.json(await listScopedTags(c.env.DB, 'share_tags', c.get('userId')))
  })
  shareManageRoutes.post('/tags', async (c) => {
    const body = await readJson<Parameters<typeof createScopedTag>[4]>(c, JSON_BODY_LIMITS.small)
    const { tag, status } = await createScopedTag(c.env.DB, 'share_tags', 'keep-existing', c.get('userId'), body)
    return c.json(tag, status)
  })
  shareManageRoutes.patch('/tags/:id', async (c) => {
    const body = await readJson<Parameters<typeof updateScopedTag>[4]>(c, JSON_BODY_LIMITS.small)
    const { tag } = await updateScopedTag(c.env.DB, 'share_tags', c.get('userId'), c.req.param('id'), body)
    return c.json(tag)
  })
  shareManageRoutes.delete('/tags/:id', async (c) => {
    await deleteScopedTag(c.env.DB, 'share_tags', c.get('userId'), c.req.param('id'))
    return c.json({ ok: true })
  })
}

function registerShareGroupToggleRoute(shareManageRoutes: Hono<AppBindings>): void {
  shareManageRoutes.post('/batch-toggle-group', async (c) => {
    const userId = c.get('userId')
    const body = await readJsonValidated(c, shareGroupToggleSchema, JSON_BODY_LIMITS.small)
    const isEnabled = body.enabled ? 1 : 0

    if (body.type === 'folder') {
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = ?1 WHERE folder_id = ?2 AND user_id = ?3`,
      ).bind(isEnabled, body.target, userId).run()
    } else if (body.type === 'tag') {
      await c.env.DB.prepare(
        `UPDATE shares SET is_enabled = ?1 WHERE user_id = ?2 AND tags LIKE ?3`,
      ).bind(isEnabled, userId, `%"${body.target}"%`).run()
    }
    return c.json({ ok: true })
  })
}
