import type { Context, Hono } from 'hono'
import type { PublicCollection, ShareCollection } from '@shared/types'
import type { DemoShareCollection, DemoState } from '../../state'
import { newDemoId } from '../../state'
import { apiError, jsonBody } from '../helpers/info'

/**
 * Collections in the demo backend (ADR-0005). The members are computed from `state.shares` on every
 * request, exactly as the worker computes them from the shares table, so the demo shows the same
 * behaviour the real build has: publish a folder, then move a share out of it and watch the page
 * change without republishing.
 */
export function registerDemoCollectionRoutes(app: Hono, state: DemoState): void {
  app.get('/api/share/collections', (c) => c.json({ collections: listCollections(state) }))
  app.post('/api/share/collections', async (c) => publishCollection(c, state))
  app.patch('/api/share/collections/:id', async (c) => toggleCollection(c, state))
  app.delete('/api/share/collections/:id', (c) => revokeCollection(c, state))
  app.post('/api/public/collection/:slug', async (c) => readCollection(c, state))
}

function listCollections(state: DemoState): ShareCollection[] {
  return [...state.shareCollections.values()].map((collection) => toShareCollection(state, collection))
}

function toShareCollection(state: DemoState, collection: DemoShareCollection): ShareCollection {
  return {
    id: collection.id,
    slug: collection.slug,
    title: targetName(state, collection),
    targetType: collection.targetType,
    targetValue: collection.targetValue,
    count: membersOf(state, collection).length,
    hasPassword: Boolean(collection.password),
    expiresAt: collection.expiresAt,
    isEnabled: collection.isEnabled,
    createdAt: collection.createdAt,
  }
}

function targetName(state: DemoState, collection: DemoShareCollection): string {
  return collection.targetType === 'folder'
    ? state.shareFolders.get(collection.targetValue)?.name ?? ''
    : state.shareTags.get(collection.targetValue)?.name ?? ''
}

/** The demo's membership rule, written to match the worker's two predicates. */
function membersOf(state: DemoState, collection: DemoShareCollection) {
  const now = Date.now()
  return [...state.shares.values()].filter((share) => {
    const info = share.info
    if (!info.isEnabled) return false
    if (info.expiresAt && info.expiresAt < now) return false
    if (collection.targetType === 'folder') return info.shareFolderId === collection.targetValue
    return (info.shareTags ?? []).includes(targetName(state, collection))
  })
}

async function publishCollection(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw) as {
    targetType?: 'folder' | 'tag'
    targetValue?: string
    password?: string
    expiresAt?: number | null
  }
  const targetType = body.targetType
  const targetValue = body.targetValue
  if (!targetType || !targetValue) return apiError(400, 'invalid_collection', 'A folder or tag is required')
  if (targetName(state, { targetType, targetValue } as DemoShareCollection) === '') {
    return apiError(404, 'not_found', 'The folder or tag does not exist')
  }
  const existing = [...state.shareCollections.values()].find(
    (collection) => collection.isEnabled
      && collection.targetType === targetType && collection.targetValue === targetValue,
  )
  if (existing) {
    // Re-publishing states the policy again, which is how the password and the end date are changed.
    existing.password = body.password || null
    existing.expiresAt = body.expiresAt ?? null
    return c.json({ id: existing.id, slug: existing.slug })
  }
  const created: DemoShareCollection = {
    id: newDemoId(),
    slug: `demo-${newDemoId().slice(-8)}`,
    targetType,
    targetValue,
    password: body.password || null,
    expiresAt: body.expiresAt ?? null,
    isEnabled: true,
    createdAt: Date.now(),
  }
  state.shareCollections.set(created.id, created)
  return c.json({ id: created.id, slug: created.slug })
}

async function toggleCollection(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw) as { isEnabled?: boolean }
  const collection = state.shareCollections.get(c.req.param('id') ?? '')
  if (!collection) return apiError(404, 'not_found', 'The collection does not exist')
  if (typeof body.isEnabled !== 'boolean') return apiError(400, 'invalid_collection', 'isEnabled is required')
  if (body.isEnabled) {
    const conflict = [...state.shareCollections.values()].some(
      (candidate) => candidate.isEnabled && candidate.id !== collection.id
        && candidate.targetType === collection.targetType && candidate.targetValue === collection.targetValue,
    )
    if (conflict) return apiError(400, 'invalid_collection', 'This folder or tag already has a published collection')
  }
  collection.isEnabled = body.isEnabled
  return c.json({ ok: true })
}

function revokeCollection(c: Context, state: DemoState): Response {
  const id = c.req.param('id') ?? ''
  if (!state.shareCollections.has(id)) return apiError(404, 'not_found', 'The collection does not exist')
  state.shareCollections.delete(id)
  return c.json({ ok: true })
}

async function readCollection(c: Context, state: DemoState): Promise<Response> {
  const collection = [...state.shareCollections.values()].find((candidate) => candidate.slug === c.req.param('slug'))
  const unavailable = () => apiError(404, 'not_found', 'The collection does not exist or has been revoked')
  if (!collection || !collection.isEnabled) return unavailable()
  if (collection.expiresAt && collection.expiresAt < Date.now()) return unavailable()
  const body = await jsonBody(c.req.raw) as { password?: string }
  if (collection.password) {
    if (body.password !== collection.password) {
      // The same answer for "no password" and "wrong password", as the worker gives.
      return c.json({ error: { code: 'password_required', message: 'An access password is required' } }, 401)
    }
  }
  const members = membersOf(state, collection)
  const response: PublicCollection = {
    title: targetName(state, collection),
    count: members.length,
    notes: members.map((share) => ({
      slug: share.info.slug,
      title: share.info.noteTitle ?? '',
      excerpt: '',
      hasPassword: share.info.hasPassword,
    })),
    nextCursor: null,
    limit: 50,
  }
  return c.json(response)
}
