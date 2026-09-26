import type { Context, Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { readUpstreamBytes } from './outbound'
import { enforceMusicBudget } from './budget'
import { parsePodcastFeed, parseOpmlFeeds, escapeXml, type PodcastEpisode } from './rss'
import { pathParam } from './params'
import { resolveMusicTrackType } from './keys'
import { insertWebdavTrack } from './webdav-routes'
import { createPodcastFeedSchema, importPodcastEpisodeSchema, importPodcastOpmlSchema, patchPodcastFeedSchema } from './schemas'
import type { MusicTrackRow } from './rows'

// FEA-A2-1: podcast subscriptions are the user's own feed registrations. The
// feed XML is fetched on demand (A2-2); this table only holds what the user
// subscribed to, so the routes are a plain CRUD scoped by user_id.
export function registerMusicPodcastRoutes(routes: Hono<AppBindings>): void {
  routes.get('/podcasts', requireAuth, (c) => listFeeds(c))
  routes.post('/podcasts', requireAuth, (c) => createFeed(c))
  // The OPML routes must sit above the :id routes — "opml" is a word, not an id.
  routes.get('/podcasts/opml', requireAuth, (c) => exportOpml(c))
  routes.post('/podcasts/opml', requireAuth, (c) => importOpml(c))
  routes.patch('/podcasts/:id', requireAuth, (c) => patchFeed(c))
  routes.delete('/podcasts/:id', requireAuth, (c) => deleteFeed(c))
  routes.get('/podcasts/:id/episodes', requireAuth, (c) => listEpisodes(c))
  routes.post('/podcasts/:id/episodes/import', requireAuth, (c) => importEpisode(c))
}

interface PodcastFeedRow {
  id: string
  title: string
  url: string
  description: string
  episodes_json: string | null
  fetched_at: number | null
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

// FEA-A2-2: the episode list of one feed, served from the row's cached JSON
// while it is fresh. The first successful fetch backfills the host-name
// stand-in title with the channel title; later fetches keep a user rename.
async function listEpisodes(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'podcast', userId)
  const id = pathParam(c, 'id')
  const row = await loadFeedRow(c.env.DB, userId, id)
  if (!row) throw ApiError.notFound('Podcast feed not found')
  if (row.fetched_at && row.episodes_json && Date.now() - row.fetched_at < LIMITS.musicPodcastCacheTtlMs) {
    return c.json({ feedId: id, title: row.title, cached: true, episodes: JSON.parse(row.episodes_json) as PodcastEpisode[] })
  }
  let response: Response
  try {
    response = await fetch(row.url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ApiError(502, 'storage_unavailable', 'The podcast feed is unreachable')
  }
  if (!response.ok) throw new ApiError(502, 'storage_unavailable', `The podcast feed failed: HTTP ${response.status}`)
  const bytes = await readUpstreamBytes(response, LIMITS.musicPodcastFeedMaxBytes)
  if (!bytes) throw new ApiError(502, 'storage_unavailable', 'The podcast feed is too large or unreadable')
  const parsed = parsePodcastFeed(new TextDecoder().decode(bytes))
  if (!parsed) throw new ApiError(502, 'storage_unavailable', 'The podcast feed is not a recognizable RSS feed')
  const title = row.fetched_at === null && parsed.title ? parsed.title : row.title
  await c.env.DB.prepare(
    'UPDATE music_podcast_feeds SET episodes_json = ?1, fetched_at = ?2, title = ?3, updated_at = ?4 WHERE user_id = ?5 AND id = ?6',
  ).bind(JSON.stringify(parsed.episodes), Date.now(), title, Date.now(), userId, id).run()
  return c.json({ feedId: id, title, cached: false, episodes: parsed.episodes })
}

// FEA-A2-3: the whole subscription list as an OPML document — the standard
// format every podcast app exchanges, so a subscription list is never trapped.
async function exportOpml(c: Context<AppBindings>): Promise<Response> {
  const rows = await c.env.DB.prepare(
    'SELECT id, title, url, description, episodes_json, fetched_at, created_at, updated_at FROM music_podcast_feeds WHERE user_id = ?1 ORDER BY created_at ASC',
  ).bind(c.get('userId')).all<PodcastFeedRow>()
  const outlines = rows.results
    .map((row) => `<outline type="rss" text="${escapeXml(row.title)}" xmlUrl="${escapeXml(row.url)}"/>`)
    .join('\n  ')
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Podcast subscriptions</title></head>\n  <body>\n  ${outlines}\n  </body>\n</opml>\n`
  return new Response(body, {
    headers: {
      'Content-Type': 'text/x-opml+xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="podcast-subscriptions.opml"',
    },
  })
}

// Import: every feed outline becomes a subscription unless the URL is already
// subscribed, so re-importing an exported file is a no-op rather than duplicates.
async function importOpml(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const body = await readJsonValidated(c, importPodcastOpmlSchema, JSON_BODY_LIMITS.profile)
  const outlines = parseOpmlFeeds(body.opml)
  if (!outlines.length) throw ApiError.badRequest('The OPML document holds no podcast feeds')
  const existing = await c.env.DB.prepare('SELECT url FROM music_podcast_feeds WHERE user_id = ?1')
    .bind(userId).all<{ url: string }>()
  const known = new Set(existing.results.map((row) => row.url))
  const now = Date.now()
  let created = 0
  let skipped = 0
  for (const outline of outlines) {
    if (known.has(outline.url)) {
      skipped += 1
      continue
    }
    known.add(outline.url)
    await c.env.DB.prepare(
      `INSERT INTO music_podcast_feeds (id, user_id, title, url, description, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, '', ?5, ?5)`,
    ).bind(newId(), userId, outline.title || hostNameOf(outline.url), outline.url, now).run()
    created += 1
  }
  return c.json({ created, skipped })
}

// FEA-A2-4: playing an episode runs through one idempotent registration — the
// episode becomes an ordinary external reference row (the feed title rides as
// the album), so the player, the queue and the progress persistence reuse
// everything the URL import built. A repeat play answers the existing row.
async function importEpisode(c: Context<AppBindings>): Promise<Response> {
  const userId = c.get('userId')
  await enforceMusicBudget(c.env.DB, 'write', userId)
  const id = pathParam(c, 'id')
  const feed = await loadFeedRow(c.env.DB, userId, id)
  if (!feed) throw ApiError.notFound('Podcast feed not found')
  const body = await readJsonValidated(c, importPodcastEpisodeSchema, JSON_BODY_LIMITS.small)
  const trackType = resolveMusicTrackType(body.audioUrl, '')
  if (!trackType) throw ApiError.badRequest('Unsupported media format')

  const existing = await c.env.DB.prepare(
    `SELECT id FROM music_tracks WHERE user_id = ?1 AND source = 'external' AND object_key = ?2`,
  ).bind(userId, body.audioUrl).first<{ id: string }>()
  if (existing) {
    const row = await c.env.DB.prepare('SELECT * FROM music_tracks WHERE id = ?1').bind(existing.id).first<MusicTrackRow>()
    if (row) return c.json(toTrackFromRow(row, feed.title))
  }

  const now = Date.now()
  const row: MusicTrackRow = {
    id: newId(),
    title: body.title?.trim() || new URL(body.audioUrl).pathname.split('/').filter(Boolean).pop() || 'Episode',
    artist: '',
    album: feed.title,
    duration_ms: body.durationMs ?? 0,
    source: 'external',
    object_key: body.audioUrl,
    mime: trackType.mime,
    size_bytes: 0,
    cover_url: null,
    lyric: null,
    is_favorite: 0,
    is_pinned: 0,
    play_count: 0,
    last_played_at: null,
    content_hash: null,
    created_at: now,
    updated_at: now,
  }
  await insertWebdavTrack(c.env.DB, userId, row)
  return c.json(toTrackFromRow(row, feed.title), 201)
}

function toTrackFromRow(row: MusicTrackRow, feedTitle: string): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album || feedTitle,
    durationMs: row.duration_ms,
    source: row.source,
    format: resolveMusicTrackType(row.object_key, row.mime)?.format ?? null,
    webdavPath: null,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: Boolean(row.is_favorite),
    isPinned: Boolean(row.is_pinned),
    playCount: row.play_count,
    lastPlayedAt: row.last_played_at,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
    `SELECT id, title, url, description, episodes_json, fetched_at, created_at, updated_at
     FROM music_podcast_feeds WHERE user_id = ?1 AND id = ?2`,
  ).bind(userId, id).first<PodcastFeedRow>()
}
