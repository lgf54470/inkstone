import { Hono, type Context } from 'hono'
import type { DemoState } from '../../state'
import { newDemoId } from '../../state'
import { apiError, jsonBody } from '../helpers/info'

// FEA-A2-1 demo stub: the demo cannot fetch feeds, so subscriptions are plain
// records managed in memory — the same CRUD contract the worker routes pin.
function feedView(feed: { id: string; title: string; url: string; description: string; createdAt: number; updatedAt: number }) {
  return { ...feed }
}

function hostNameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function listHandler(c: Context, state: DemoState): Promise<Response> {
  return c.json({ feeds: [...state.musicPodcastFeeds.values()].map(feedView) })
}

async function createHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url || !/^https?:\/\//.test(url)) {
    return apiError(400, 'bad_request', 'Provide an http(s) feed URL')
  }
  const now = Date.now()
  const feed = {
    id: newDemoId(),
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : hostNameOf(url),
    url,
    description: '',
    createdAt: now,
    updatedAt: now,
  }
  state.musicPodcastFeeds.set(feed.id, feed)
  return c.json(feedView(feed), 201)
}

async function patchHandler(c: Context, state: DemoState): Promise<Response> {
  const feed = state.musicPodcastFeeds.get(c.req.param('id') ?? '')
  if (!feed) return apiError(404, 'not_found', 'Podcast feed not found')
  const body = await jsonBody(c.req.raw)
  if (typeof body.title === 'string' && body.title.trim()) feed.title = body.title.trim()
  if (typeof body.url === 'string' && body.url.trim()) feed.url = body.url.trim()
  feed.updatedAt = Date.now()
  return c.json(feedView(feed))
}

async function deleteHandler(c: Context, state: DemoState): Promise<Response> {
  if (!state.musicPodcastFeeds.delete(c.req.param('id') ?? '')) return apiError(404, 'not_found', 'Podcast feed not found')
  return c.json({ ok: true as const })
}

// FEA-A2-2 demo stub: the demo cannot fetch feeds, so the episode list is a
// fixed sample — the contract (feedId/title/episodes shape) is what it pins.
const DEMO_EPISODES = [
  {
    title: 'Episode 1: the demo',
    audioUrl: 'https://cdn.example.com/ep1.mp3',
    sizeBytes: 4096,
    durationSeconds: 3723,
    publishedAt: Date.parse('Tue, 10 Jun 2025 09:00:00 +0000'),
    description: 'A fixed sample episode',
  },
  {
    title: 'Episode 2: the sequel',
    audioUrl: 'https://cdn.example.com/ep2.mp3',
    sizeBytes: 2048,
    durationSeconds: 941,
    publishedAt: null,
    description: 'Another fixed sample episode',
  },
]

async function episodesHandler(c: Context, state: DemoState): Promise<Response> {
  const feed = state.musicPodcastFeeds.get(c.req.param('id') ?? '')
  if (!feed) return apiError(404, 'not_found', 'Podcast feed not found')
  return c.json({ feedId: feed.id, title: feed.title, cached: false, episodes: DEMO_EPISODES })
}

export function registerDemoMusicPodcastRoutes(app: Hono, state: DemoState): void {
  app.get('/api/music/podcasts', (c) => listHandler(c, state))
  app.post('/api/music/podcasts', (c) => createHandler(c, state))
  app.patch('/api/music/podcasts/:id', (c) => patchHandler(c, state))
  app.delete('/api/music/podcasts/:id', (c) => deleteHandler(c, state))
  app.get('/api/music/podcasts/:id/episodes', (c) => episodesHandler(c, state))
}
