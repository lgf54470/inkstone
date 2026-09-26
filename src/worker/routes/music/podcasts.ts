import type { Context, Hono } from 'hono'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { enforceMusicBudget } from './budget'
import { pathParam } from './params'
import { createPodcastFeedSchema, patchPodcastFeedSchema } from './schemas'

// FEA-A2-1: podcast subscriptions are the user's own feed registrations. The
// feed XML is fetched on demand (A2-2); this table only holds what the user
// subscribed to, so the routes are a plain CRUD scoped by user_id.
export function registerMusicPodcastRoutes(routes: Hono<AppBindings>): void {
  routes.get('/podcasts', requireAuth, (c) => listFeeds(c))
  routes.post('/podcasts', requireAuth, (c) => createFeed(c))
  routes.patch('/podcasts/:id', requireAuth, (c) => patchFeed(c))
  routes.delete('/podcasts/:id', requireAuth, (c) => deleteFeed(c))
}

interface PodcastFeedRow {
  id: string
  title: string
  url: string
  description: string
  created_at: number
  updated_at: number
}

async function listFeeds(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT id, title, url, description, created_at, updated_at
     FROM music_podcast_feeds WHERE user_id = ?1 ORDER BY created_at ASC`,
  ).bind(c.get('userId')).all<PodcastFeedRow>()
  return c.json({ feeds: rows.results.map(toFeedView) })
}

async function createFeed(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, createPodcastFeedSchema, JSON_BODY_LIMITS.small)
  const id = newId()
  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO music_podcast_feeds (id, user_id, title, url, description, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, '', ?5, ?5)`,
  ).bind(id, userId, body.title?.trim() || hostNameOf(body.url), body.url, now).run()
  const created = await loadFeedRow(c.env.DB, userId, id)
  if (!created) throw ApiError.internal('The podcast feed row vanished after insert')
  return c.json(toFeedView(created), 201)
}

async function patchFeed(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  const row = await loadFeedRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Podcast feed not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, patchPodcastFeedSchema, JSON_BODY_LIMITS.small)
  await c.env.DB.prepare(
    'UPDATE music_podcast_feeds SET title = ?1, url = ?2, updated_at = ?3 WHERE user_id = ?4 AND id = ?5',
  ).bind(body.title ?? row.title, body.url ?? row.url, Date.now(), userId, id).run()
  const updated = await loadFeedRow(c.env.DB, userId, id)
  if (!updated) throw ApiError.internal('The podcast feed row vanished after update')
  return c.json(toFeedView(updated))
}

async function deleteFeed(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  const id = pathParam(c, 'id')
  if (!(await loadFeedRow(c.env.DB, userId, id))) throw ApiError.notFound('Podcast feed not found')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  await c.env.DB.prepare('DELETE FROM music_podcast_feeds WHERE user_id = ?1 AND id = ?2').bind(userId, id).run()
  return c.json({ ok: true })
}

function toFeedView(row: PodcastFeedRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// A subscription without a title still needs a stable display name before the
// first feed refresh fills in the channel title.
function hostNameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function loadFeedRow(db: D1Database, userId: string, id: string): Promise<PodcastFeedRow | null> {
  return db.prepare(
    `SELECT id, title, url, description, created_at, updated_at
     FROM music_podcast_feeds WHERE user_id = ?1 AND id = ?2`,
  ).bind(userId, id).first<PodcastFeedRow>()
}
