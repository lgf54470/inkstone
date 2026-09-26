import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { parsePodcastFeed } from '../src/worker/routes/music/rss'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: () => {} } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  for (const statement of MUSIC_PLAYBACK_MIGRATION_STATEMENTS) await runSql(db, statement)
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'owner', 'x', 'login', 'Author', '', 1, 1)`,
    USER,
  )
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/music', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  })
  app.use('/api/music/*', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('podcast subscriptions (FEA-A2-1)', () => {
  it('creates a subscription and falls back to the host name for the title', async () => {
    await makeDb()
    const app = makeApp()
    const named = await json(app, '/api/music/podcasts', {
      url: 'https://feeds.example.com/show.xml', title: 'A Show',
    })
    expect(named.status).toBe(201)
    expect(await named.json()).toMatchObject({ title: 'A Show', url: 'https://feeds.example.com/show.xml' })

    const bare = await json(app, '/api/music/podcasts', { url: 'https://podcast.example.org/feed.rss' })
    expect(bare.status).toBe(201)
    expect((await bare.json() as { title: string }).title).toBe('podcast.example.org')
  })

  it('lists, renames and deletes subscriptions scoped to the user', async () => {
    await makeDb()
    const app = makeApp()
    const created = await (await json(app, '/api/music/podcasts', {
      url: 'https://feeds.example.com/show.xml', title: 'A Show',
    })).json() as { id: string }

    const list = await (await request(app, '/api/music/podcasts')).json() as { feeds: Array<{ id: string; title: string }> }
    expect(list.feeds).toHaveLength(1)

    const renamed = await (await json(app, `/api/music/podcasts/${created.id}`, { title: 'Renamed' }, 'PATCH')).json() as { title: string; url: string }
    expect(renamed.title).toBe('Renamed')
    expect(renamed.url).toBe('https://feeds.example.com/show.xml')

    expect((await request(app, `/api/music/podcasts/${created.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await request(app, '/api/music/podcasts')).json()).resolves.toMatchObject({ feeds: [] })
  })

  it('rejects non-http urls and empty payloads', async () => {
    await makeDb()
    const app = makeApp()
    for (const body of [
      { url: 'ftp://feeds.example.com/show.xml' },
      { url: '' },
      {},
    ]) {
      expect((await json(app, '/api/music/podcasts', body)).status, JSON.stringify(body)).toBe(400)
    }
  })

  it('answers 404 for a foreign or missing subscription', async () => {
    await makeDb()
    const app = makeApp()
    expect((await json(app, '/api/music/podcasts/no-such-id', { title: 'X' }, 'PATCH')).status).toBe(404)
    expect((await request(app, '/api/music/podcasts/no-such-id', { method: 'DELETE' })).status).toBe(404)
  })
})

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[A Show &amp; Its Friends]]></title>
    <description>Talks about &lt;things&gt;</description>
    <item>
      <title>Episode 1: the beginning</title>
      <enclosure url="https://cdn.example.com/ep1.mp3" length="1024" type="audio/mpeg"/>
      <itunes:duration>1:02:03</itunes:duration>
      <pubDate>Tue, 10 Jun 2025 09:00:00 +0000</pubDate>
      <description><![CDATA[First <b>episode</b>]]></description>
    </item>
    <item>
      <title>Episode 2</title>
      <enclosure url="https://cdn.example.com/ep2.mp3" length="2048" type="audio/mpeg"/>
      <itunes:duration>941</itunes:duration>
      <pubDate>not a date</pubDate>
      <description>Second</description>
    </item>
    <item>
      <title>Not an episode: no enclosure</title>
    </item>
  </channel>
</rss>`

describe('parsePodcastFeed (FEA-A2-2)', () => {
  it('parses the channel and the enclosure-bearing items', () => {
    const parsed = parsePodcastFeed(SAMPLE_RSS)
    expect(parsed).not.toBeNull()
    expect(parsed?.title).toBe('A Show & Its Friends')
    expect(parsed?.description).toBe('Talks about <things>')
    expect(parsed?.episodes).toEqual([
      {
        title: 'Episode 1: the beginning',
        audioUrl: 'https://cdn.example.com/ep1.mp3',
        sizeBytes: 1024,
        durationSeconds: 3723,
        publishedAt: Date.parse('Tue, 10 Jun 2025 09:00:00 +0000'),
        description: 'First <b>episode</b>',
      },
      {
        title: 'Episode 2',
        audioUrl: 'https://cdn.example.com/ep2.mp3',
        sizeBytes: 2048,
        durationSeconds: 941,
        publishedAt: null,
        description: 'Second',
      },
    ])
  })

  it('answers null for a non-RSS body', () => {
    expect(parsePodcastFeed('<html><body>hello</body></html>')).toBeNull()
  })
})

describe('podcast episodes (FEA-A2-2)', () => {
  it('fetches the feed once, parses episodes and caches the answer', async () => {
    await makeDb()
    const app = makeApp()
    const created = await (await json(app, '/api/music/podcasts', { url: 'https://feeds.example.com/show.xml' })).json() as { id: string; title: string }
    const fetchCalls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      fetchCalls.push(String(url))
      return new Response(SAMPLE_RSS, { status: 200 })
    })

    const first = await request(app, `/api/music/podcasts/${created.id}/episodes`)
    expect(first.status).toBe(200)
    const body = await first.json() as { episodes: Array<{ title: string; audioUrl: string; durationSeconds: number }>; title: string }
    expect(body.episodes).toHaveLength(2)
    expect(body.episodes[0]?.audioUrl).toBe('https://cdn.example.com/ep1.mp3')
    expect(body.episodes[0]?.durationSeconds).toBe(3723)
    // The first fetch backfills the host-name stand-in with the channel title.
    expect(body.title).toBe('A Show & Its Friends')

    const second = await request(app, `/api/music/podcasts/${created.id}/episodes`)
    expect(second.status).toBe(200)
    expect((await second.json() as { episodes: unknown[] }).episodes).toHaveLength(2)
    expect(fetchCalls).toEqual(['https://feeds.example.com/show.xml'])

    vi.unstubAllGlobals()
  })

  it('answers 502 when the upstream feed is unreachable or not RSS', async () => {
    await makeDb()
    const app = makeApp()
    const created = await (await json(app, '/api/music/podcasts', { url: 'https://feeds.example.com/show.xml' })).json() as { id: string }
    vi.stubGlobal('fetch', async () => new Response('<html>nope</html>', { status: 200 }))
    expect((await request(app, `/api/music/podcasts/${created.id}/episodes`)).status).toBe(502)
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }))
    expect((await request(app, `/api/music/podcasts/${created.id}/episodes`)).status).toBe(502)
    vi.unstubAllGlobals()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SAMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Imported One" type="rss" xmlUrl="https://feeds.example.com/one.xml" htmlUrl="https://example.com/one"/>
    <outline text="Imported Two" type="rss" xmlUrl="https://feeds.example.com/two.xml"/>
    <outline text="Just a folder" type="folder">
      <outline text="Nested Show" type="rss" xmlUrl="https://feeds.example.com/nested.xml"/>
    </outline>
    <outline text="No feed url" type="rss"/>
  </body>
</opml>`

describe('podcast OPML (FEA-A2-3)', () => {
  it('exports every subscription as an OPML document', async () => {
    await makeDb()
    const app = makeApp()
    await json(app, '/api/music/podcasts', { url: 'https://feeds.example.com/show.xml', title: 'A Show' })
    const res = await request(app, '/api/music/podcasts/opml')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('xml')
    const text = await res.text()
    expect(text).toContain('<opml version="2.0">')
    expect(text).toContain('xmlUrl="https://feeds.example.com/show.xml"')
    expect(text).toContain('text="A Show"')
  })

  it('imports subscriptions from OPML, skipping duplicates and non-feed outlines', async () => {
    await makeDb()
    const app = makeApp()
    const first = await json(app, '/api/music/podcasts/opml', { opml: SAMPLE_OPML })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ created: 3, skipped: 0 })

    // A second import of the same file skips every existing feed URL.
    const again = await json(app, '/api/music/podcasts/opml', { opml: SAMPLE_OPML })
    expect((await again.json() as { skipped: number }).skipped).toBe(3)

    const list = await (await request(app, '/api/music/podcasts')).json() as { feeds: Array<{ title: string; url: string }> }
    expect(list.feeds.map((feed) => feed.url).sort()).toEqual([
      'https://feeds.example.com/nested.xml',
      'https://feeds.example.com/one.xml',
      'https://feeds.example.com/two.xml',
    ])
    const one = list.feeds.find((feed) => feed.url === 'https://feeds.example.com/one.xml')
    expect(one?.title).toBe('Imported One')
  })

  it('rejects an OPML body that holds no feeds', async () => {
    await makeDb()
    const app = makeApp()
    expect((await json(app, '/api/music/podcasts/opml', { opml: '<html>nope</html>' })).status).toBe(400)
    expect((await json(app, '/api/music/podcasts/opml', {})).status).toBe(400)
  })
})
