import { Hono, type Context } from 'hono'
import type { MusicTrack } from '@shared/types'
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

// FEA-A2-4 demo stub: the idempotent registration. The demo keeps the returned
// track inside its library store — the same contract the worker pins.
async function episodeImportHandler(c: Context, state: DemoState): Promise<Response> {
  const feed = state.musicPodcastFeeds.get(c.req.param('id') ?? '')
  if (!feed) return apiError(404, 'not_found', 'Podcast feed not found')
  const body = await jsonBody(c.req.raw)
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl : ''
  if (!/^https?:\/\//.test(audioUrl) || !/\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(audioUrl.split('?')[0] ?? '')) {
    return apiError(400, 'bad_request', 'Unsupported media format')
  }
  const existing = state.musicTracks.get(`podcast:${audioUrl}`)
  if (existing) return c.json(existing.track)
  const now = Date.now()
  const track: MusicTrack = {
    id: newDemoId(),
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : audioUrl,
    artist: '',
    album: feed.title,
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : 0,
    source: 'external',
    format: 'mp3',
    webdavPath: null,
    mime: 'audio/mpeg',
    sizeBytes: 0,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    contentHash: null,
    createdAt: now,
    updatedAt: now,
  }
  state.musicTracks.set(`podcast:${audioUrl}`, { track, file: new File([new Uint8Array(0)], 'episode.mp3') })
  return c.json(track, 201)
}

// FEA-A2-3 demo stub: the OPML round trip on the same in-memory records. The
// demo pins the dedupe contract, not full OPML parsing — that lives in the
// worker's parseOpmlFeeds, which the tests exercise directly.
const OPML_XML_URL = /xmlUrl\s*=\s*["']([^"']+)["']/gi

async function opmlExportHandler(c: Context, state: DemoState): Promise<Response> {
  const outlines = [...state.musicPodcastFeeds.values()]
    .map((feed) => `<outline type="rss" text="${feed.title.replace(/"/g, '&quot;')}" xmlUrl="${feed.url}"/>`)
    .join('\n  ')
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <body>\n  ${outlines}\n  </body>\n</opml>\n`, 200, {
    'Content-Type': 'text/x-opml+xml; charset=utf-8',
  })
}

async function opmlImportHandler(c: Context, state: DemoState): Promise<Response> {
  const body = await jsonBody(c.req.raw)
  const opml = typeof body.opml === 'string' ? body.opml : ''
  const known = new Set([...state.musicPodcastFeeds.values()].map((feed) => feed.url))
  let created = 0
  let skipped = 0
  for (const match of opml.matchAll(OPML_XML_URL)) {
    const url = match[1]!.trim()
    if (!/^https?:\/\//.test(url) || known.has(url)) {
      skipped += 1
      continue
    }
    known.add(url)
    const now = Date.now()
    state.musicPodcastFeeds.set(url, {
      id: newDemoId(),
      title: url.replace(/\/+$/, '').split('/').pop() ?? url,
      url,
      description: '',
      createdAt: now,
      updatedAt: now,
    })
    created += 1
  }
  return c.json({ created, skipped })
}

export function registerDemoMusicPodcastRoutes(app: Hono, state: DemoState): void {
  app.get('/api/music/podcasts', (c) => listHandler(c, state))
  app.post('/api/music/podcasts', (c) => createHandler(c, state))
  app.get('/api/music/podcasts/opml', (c) => opmlExportHandler(c, state))
  app.post('/api/music/podcasts/opml', (c) => opmlImportHandler(c, state))
  app.patch('/api/music/podcasts/:id', (c) => patchHandler(c, state))
  app.delete('/api/music/podcasts/:id', (c) => deleteHandler(c, state))
  app.get('/api/music/podcasts/:id/episodes', (c) => episodesHandler(c, state))
  app.post('/api/music/podcasts/:id/episodes/import', (c) => episodeImportHandler(c, state))
}
