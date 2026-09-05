import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { CommunityTemplate, CommunityTemplateInput } from '@shared/types'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { isValidId, newId } from '../lib/id'
import { JSON_BODY_LIMITS, readJson } from '../lib/request'
import { consumeAttemptBudget, ThrottleError } from '../lib/throttle'
import { requireAuth } from '../middleware/auth'

export const communityTemplatesRoutes = new Hono<AppBindings>()

communityTemplatesRoutes.use('*', requireAuth)

interface CommunityRow {
  id: string
  author_id: string
  author_name: string
  name: string
  description: string
  content: string
  tags: string
  category: string
  created_at: number
}

function toCommunityTemplate(row: CommunityRow): CommunityTemplate {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(row.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((tag) => typeof tag === 'string')
  }
  catch {
    tags = []
  }
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    name: row.name,
    description: row.description,
    content: row.content,
    tags,
    category: row.category,
    createdAt: row.created_at,
  }
}

const COMMUNITY_SELECT = `id, author_id, author_name, name, description, content, tags, category, created_at`

communityTemplatesRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${COMMUNITY_SELECT} FROM community_templates ORDER BY created_at DESC, id ASC`,
  ).all<CommunityRow>()
  return c.json({ templates: results.map(toCommunityTemplate) })
})

function parseCommunityInput(body: Partial<CommunityTemplateInput>): CommunityTemplateInput {
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw ApiError.badRequest('name is required')
  }
  if (typeof body.content !== 'string' || !body.content.trim()) {
    throw ApiError.badRequest('content is required')
  }
  const description = typeof body.description === 'string' ? body.description : ''
  const category = typeof body.category === 'string' ? body.category : ''
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
    : []
  return {
    id: body.id,
    name: body.name.trim().slice(0, LIMITS.titleMaxLength),
    description: description.slice(0, 240),
    content: body.content,
    tags: tags.map((tag) => tag.trim().slice(0, 30)).filter(Boolean),
    category: category.slice(0, 120),
  }
}

communityTemplatesRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  await enforcePublishBudget(c.env.DB, userId)
  const body = await readJson<Partial<CommunityTemplateInput>>(c, JSON_BODY_LIMITS.small)
  const input = parseCommunityInput(body)
  const id = await resolvePublishId(c.env.DB, input.id, userId)
  await upsertTemplate(c.env.DB, id, userId, input)

  const row = await c.env.DB.prepare(
    `SELECT ${COMMUNITY_SELECT} FROM community_templates WHERE id = ?1`,
  ).bind(id).first<CommunityRow>()
  if (!row) return c.json({ error: { code: 'internal', message: 'Failed to store the community template' } }, 500)
  return c.json({ template: toCommunityTemplate(row) })
})

async function enforcePublishBudget(db: D1Database, userId: string): Promise<void> {
  // Publishing (or updating) counts against a per-user hourly budget so a
  // single account cannot flood the shared directory; authors updating
  // their own templates consume the same budget, which is acceptable.
  try {
    await consumeAttemptBudget(db, [{
      key: `community-template:publish:${userId}`,
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    }])
  } catch (error) {
    if (error instanceof ThrottleError) {
      throw new ApiError(
        429,
        'too_many_attempts',
        `Too many community template publishes. Try again in ${error.retryAfterSec} seconds`,
        { retryAfter: error.retryAfterSec },
      )
    }
    throw error
  }
}

async function resolvePublishId(
  db: D1Database,
  inputId: string | undefined,
  userId: string,
): Promise<string> {
  if (inputId === undefined) return newId()
  if (!isValidId(inputId)) throw ApiError.badRequest('id must be a valid template id')
  const existing = await db.prepare(
    `SELECT author_id FROM community_templates WHERE id = ?1`,
  ).bind(inputId).first<{ author_id: string }>()
  if (existing && existing.author_id !== userId) {
    throw ApiError.forbidden('Only the author can update a published template')
  }
  return inputId
}

async function upsertTemplate(
  db: D1Database,
  id: string,
  userId: string,
  input: CommunityTemplateInput,
): Promise<void> {
  const author = await db.prepare(
    `SELECT name FROM users WHERE id = ?1`,
  ).bind(userId).first<{ name: string }>()
  const authorName = author?.name || 'Inkstone'
  await db.prepare(
    `INSERT INTO community_templates (id, author_id, author_name, name, description, content, tags, category, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(id) DO UPDATE SET
       author_name = excluded.author_name,
       name = excluded.name,
       description = excluded.description,
       content = excluded.content,
       tags = excluded.tags,
       category = excluded.category,
       created_at = excluded.created_at`,
  )
    .bind(id, userId, authorName, input.name, input.description, input.content, JSON.stringify(input.tags), input.category, Date.now())
    .run()
}

communityTemplatesRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  if (!isValidId(id)) throw ApiError.badRequest('id must be a valid template id')
  const existing = await c.env.DB.prepare(
    `SELECT author_id FROM community_templates WHERE id = ?1`,
  ).bind(id).first<{ author_id: string }>()
  if (!existing) throw ApiError.notFound('Community template not found')
  if (existing.author_id !== userId) {
    throw ApiError.forbidden('Only the author can unpublish a template')
  }
  await c.env.DB.prepare(`DELETE FROM community_templates WHERE id = ?1`).bind(id).run()
  return c.json({ ok: true as const })
})
