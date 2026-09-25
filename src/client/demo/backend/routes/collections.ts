import type { Context, Hono } from 'hono'
import type { PublicCollection, ShareCollection } from '@shared/types'
import { resolveShareTarget, shareMatchesSelection, type ShareTargetRecord } from '@shared/share-selection'
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
    memberSort: collection.memberSort ?? null,
    createdAt: collection.createdAt,
  }
}

function targetName(state: DemoState, collection: DemoShareCollection): string {
  // A hand-picked collection is named by its owner; the other two by their target.
  if (collection.targetType === 'manual') return collection.title ?? ''
  return collection.targetType === 'folder'
    ? state.shareFolders.get(collection.targetValue)?.name ?? ''
    : state.shareTags.get(collection.targetValue)?.name ?? ''
}

/**
 * The demo's membership rule: the shared selection, with the collection's record id resolved the way
 * the worker resolves it — a folder id is what a share stores, a tag is stored by name. Written out
 * by hand before, it resolved a tag's name here and the worker resolved its id there, which is how a
 * published tag page could be empty on one side and populated on the other. A manual collection's
 * membership is the stored choice, listed in the order the owner arranged.
 */
function membersOf(state: DemoState, collection: DemoShareCollection) {
  const active = [...state.shares.values()].filter((share) => shareMatchesSelection(share.info, { status: 'active' }, Date.now()))
  if (collection.targetType === 'manual') {
    const byNote = new Map(active.map((share) => [share.info.noteId, share]))
    return (collection.noteIds ?? []).map((noteId) => byNote.get(noteId)).filter((share) => share !== undefined)
  }
  const record = { type: collection.targetType, value: collection.targetValue } as ShareTargetRecord
  const tagName = record.type === 'tag' ? targetName(state, collection) : null
  const target = resolveShareTarget(record, tagName || null)
  return active.filter((share) => shareMatchesSelection(share.info, { status: 'active', target }, Date.now()))
}

async function publishCollection(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw) as {
    targetType?: 'folder' | 'tag' | 'manual'
    targetValue?: string
    title?: string
    noteIds?: string[]
    password?: string
    expiresAt?: number | null
    memberSort?: 'default' | 'newest' | 'oldest' | 'title' | null
  }
  if (body.targetType === 'manual') return publishManualCollection(c, state, body)
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
    existing.memberSort = body.memberSort ?? null
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
    memberSort: body.memberSort ?? null,
    createdAt: Date.now(),
  }
  state.shareCollections.set(created.id, created)
  return c.json({ id: created.id, slug: created.slug })
}

/**
 * A hand-picked collection: the owner names it and chooses the notes. The address itself is the
 * target value, mirroring the worker — one address per collection, never one per folder.
 */
function publishManualCollection(
  c: Context,
  state: DemoState,
  body: { title?: string; noteIds?: string[]; password?: string; expiresAt?: number | null },
): Response {
  const title = (body.title ?? '').trim()
  const noteIds = [...new Set(body.noteIds ?? [])]
  if (!title || noteIds.length === 0) return apiError(400, 'invalid_collection', 'A hand-picked collection needs a title and at least one note')
  const slug = `demo-${newDemoId().slice(-8)}`
  const created: DemoShareCollection = {
    id: newDemoId(),
    slug,
    targetValue: slug,
    targetType: 'manual',
    title,
    noteIds,
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

/** The demo mirror of the worker's member orders, so a preset reads the same on both sides. */
function sortDemoMembers(state: DemoState, members: ReturnType<typeof membersOf>, sort: string | null | undefined) {
  // The note's updated_at lives on the note, not on the share info — the same fact the worker's
  // member statement reads through its join.
  const noteUpdatedAt = (share: ReturnType<typeof membersOf>[number]): number =>
    state.notes.get(share.info.noteId)?.updatedAt ?? 0
  const sorted = [...members]
  if (sort === 'newest') sorted.sort((a, b) => noteUpdatedAt(b) - noteUpdatedAt(a) || b.info.slug.localeCompare(a.info.slug))
  else if (sort === 'oldest') sorted.sort((a, b) => noteUpdatedAt(a) - noteUpdatedAt(b) || a.info.slug.localeCompare(b.info.slug))
  else if (sort === 'title') sorted.sort((a, b) => (a.info.noteTitle ?? '').localeCompare(b.info.noteTitle ?? '') || a.info.slug.localeCompare(b.info.slug))
  else sorted.sort((a, b) => Number(b.info.isPinned ?? false) - Number(a.info.isPinned ?? false) || noteUpdatedAt(b) - noteUpdatedAt(a) || b.info.slug.localeCompare(a.info.slug))
  return sorted
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
  const members = sortDemoMembers(state, membersOf(state, collection), collection.memberSort)
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
