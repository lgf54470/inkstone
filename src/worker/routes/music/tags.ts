import type { Context, Hono } from 'hono'
import type { MusicTag } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { toTag } from './rows'
import type { MusicTagRow } from './rows'
import { createTagSchema, patchTagSchema } from './schemas'
import { pathParam } from './params'

const TAG_SELECT = 'id, name, color, parent_id, is_pinned, sort_order, created_at'

export function registerMusicTagRoutes(routes: Hono<AppBindings>): void {
  routes.get('/tags', requireAuth, (c) => listTags(c))
  routes.post('/tags', requireAuth, (c) => createTag(c))
  routes.patch('/tags/:id', requireAuth, (c) => patchTag(c))
  routes.delete('/tags/:id', requireAuth, (c) => deleteTag(c))
}

async function listTags(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT ${TAG_SELECT} FROM music_tags WHERE user_id = ?1 ORDER BY is_pinned DESC, sort_order ASC, name ASC`,
  ).bind(c.get('userId')).all<MusicTagRow>()
  return c.json({ tags: rows.results.map(toTag) })
}

async function createTag(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const body = await readJsonValidated(c, createTagSchema, JSON_BODY_LIMITS.small)
  const parentId = await resolveParentId(c.env.DB, userId, body.parentId ?? null)
  const id = newId()
  const now = Date.now()
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO music_tags (id, user_id, name, color, parent_id, is_pinned, sort_order, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6)`,
  ).bind(id, userId, body.name, body.color ?? null, parentId, now).run()
  if (!result.meta.changes) throw ApiError.conflict('A tag with this name already exists')
  const created = await loadTag(c.env.DB, userId, id)
  if (!created) throw ApiError.internal('The tag could not be loaded after creation')
  return c.json(created, 201)
}

async function patchTag(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const existing = await loadTag(c.env.DB, userId, id)
  if (!existing) throw ApiError.notFound('Tag not found')
  const body = await readJsonValidated(c, patchTagSchema, JSON_BODY_LIMITS.small)
  const parentId = body.parentId === undefined
    ? undefined
    : await resolveParentId(c.env.DB, userId, body.parentId, id)
  try {
    await updateTag(c.env.DB, userId, id, body, parentId)
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : '')) {
      throw ApiError.conflict('A tag with this name already exists')
    }
    throw error
  }
  return c.json((await loadTag(c.env.DB, userId, id)) ?? existing)
}

async function deleteTag(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const existing = await loadTag(c.env.DB, userId, id)
  if (!existing) throw ApiError.notFound('Tag not found')
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE music_tags SET parent_id = ?1
        WHERE user_id = ?2 AND parent_id = ?3
          AND NOT EXISTS (
            SELECT 1 FROM music_tags sibling
             WHERE sibling.user_id = ?2
               AND COALESCE(sibling.parent_id, '') = COALESCE(?1, '')
               AND sibling.name = music_tags.name
          )`,
    ).bind(existing.parentId, userId, id),
    c.env.DB.prepare('DELETE FROM music_track_tags WHERE user_id = ?1 AND tag_id = ?2').bind(userId, id),
    c.env.DB.prepare('DELETE FROM music_tags WHERE user_id = ?1 AND id = ?2').bind(userId, id),
  ])
  return c.json({ ok: true })
}

async function updateTag(
  db: D1Database,
  userId: string,
  id: string,
  body: { name?: string; color?: string | null; isPinned?: boolean; sortOrder?: number },
  parentId: string | null | undefined,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  const push = (column: string, value: unknown): void => {
    assignments.push(`${column} = ?${values.length + 1}`)
    values.push(value)
  }
  if (body.name !== undefined) push('name', body.name)
  if (body.color !== undefined) push('color', body.color)
  if (body.isPinned !== undefined) push('is_pinned', Number(body.isPinned))
  if (body.sortOrder !== undefined) push('sort_order', body.sortOrder)
  if (parentId !== undefined) push('parent_id', parentId)
  if (!assignments.length) return
  values.push(userId, id)
  await db.prepare(
    `UPDATE music_tags SET ${assignments.join(', ')} WHERE user_id = ?${values.length - 1} AND id = ?${values.length}`,
  ).bind(...values).run()
}

async function resolveParentId(
  db: D1Database,
  userId: string,
  parentId: string | null,
  selfId?: string,
): Promise<string | null> {
  if (!parentId) return null
  if (parentId === selfId) throw ApiError.badRequest('A tag cannot be its own parent')
  const rows = await db.prepare('SELECT id, parent_id FROM music_tags WHERE user_id = ?1')
    .bind(userId).all<{ id: string; parent_id: string | null }>()
  const parents = new Map(rows.results.map((row) => [row.id, row.parent_id]))
  if (!parents.has(parentId)) throw ApiError.badRequest('The parent tag does not exist')
  assertNoCycle(parents, parentId, selfId)
  return parentId
}

function assertNoCycle(parents: Map<string, string | null>, start: string, selfId: string | undefined): void {
  let cursor: string | null = start
  let depth = 0
  while (cursor && depth < 64) {
    if (cursor === selfId) throw ApiError.badRequest('Tag nesting would create a cycle')
    cursor = parents.get(cursor) ?? null
    depth += 1
  }
}

async function loadTag(db: D1Database, userId: string, id: string): Promise<MusicTag | null> {
  const row = await db.prepare(`SELECT ${TAG_SELECT} FROM music_tags WHERE user_id = ?1 AND id = ?2`)
    .bind(userId, id).first<MusicTagRow>()
  return row ? toTag(row) : null
}