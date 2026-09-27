import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

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

// The init has to reach `app.request`: this helper dropped it, which turned every json() call
// below into a GET and a 404 that looked like a missing route.
function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider proxy (FEA-A1-2)', () => {
  it('searches the whitelisted upstream and normalizes the hits', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify([
        { id: 'a1', name: 'Song A', artist: ['Ann', 'Ben'], album: 'Album One', duration: 210000, pic_id: 'p1', lyric_id: 'l1' },
        { id: 'b2', name: 'Song B', artist: 'Cat', album: '', duration: 0 },
      ]), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/search?keywords=song&source=netease')
    expect(res.status).toBe(200)
    const body = await res.json() as { results: Array<{ source: string; sourceId: string; title: string; artist: string; album: string; durationMs: number | null; coverId: string | null; lyricId: string | null }> }
    // FB-F5: the cover and lyric ids the upstream hands out are the only way to ask for that
    // song's artwork and words later, so they survive the normalization instead of being dropped.
    expect(body.results).toEqual([
      { source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann, Ben', album: 'Album One', durationMs: 210000, coverId: 'p1', lyricId: 'l1' },
      { source: 'netease', sourceId: 'b2', title: 'Song B', artist: 'Cat', album: '', durationMs: null, coverId: null, lyricId: null },
    ])
    expect(calls[0]).toContain('music-api.gdstudio.xyz')
    expect(calls[0]).toContain('types=search')
  })

  it('rejects an unknown upstream source and an empty keywords query', async () => {
    await makeDb()
    const app = makeApp()
    expect((await request(app, '/api/music/provider/search?keywords=x&source=spotify')).status).toBe(400)
    expect((await request(app, '/api/music/provider/search?keywords=%20')).status).toBe(400)
  })

  it('answers 502 when the upstream fails or overshoots the byte cap', async () => {
    await makeDb()
    const app = makeApp()
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }))
    expect((await request(app, '/api/music/provider/search?keywords=x&source=kuwo')).status).toBe(502)
    vi.stubGlobal('fetch', async () => new Response('{"data":"', { status: 200 }))
    expect((await request(app, '/api/music/provider/search?keywords=x&source=kuwo')).status).toBe(502)
  })

  it('fetches a lyric through the proxy and hands back its text', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ lyric: '[00:06.220]Hello, it\'s me' }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/lyric?source=netease&id=l1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ lyric: "[00:06.220]Hello, it's me" })
    expect(calls[0]).toContain('types=lyric')
    expect((await request(app, '/api/music/provider/lyric?source=netease&id=')).status).toBe(400)
    expect((await request(app, '/api/music/provider/lyric?source=spotify&id=l1')).status).toBe(400)
  })

  it('proxies the artwork bytes and refuses a private address', async () => {
    await makeDb()
    const app = makeApp()
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const target = String(url)
      if (target.includes('p2.music.126.net')) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      return new Response(JSON.stringify({ url: 'https://p2.music.126.net/cover.jpg' }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/cover?source=netease&id=p1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('image/jpeg')
    expect((await res.arrayBuffer()).byteLength).toBe(3)

    // An upstream that answers with an address on this network must not be followed: the
    // picture is fetched from wherever the catalogue says, so that answer has to be a public one.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'http://127.0.0.1:8080/cover.jpg' }), { status: 200 }))
    expect((await request(app, '/api/music/provider/cover?source=netease&id=p1')).status).toBe(502)
  })

  // FB-F5: an online row is metadata only, but the words are worth keeping, so the import
  // accepts a lyric and stores it where every lyric surface already looks.
  it('imports a provider track with its lyric', async () => {
    await makeDb()
    const app = makeApp()
    const res = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease',
      sourceId: 'a1',
      title: 'Song A',
      artist: 'Ann',
      lyric: '[00:01.000]la',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { lyric: string | null; hasLyric: boolean; coverUrl: string | null }
    expect(body.lyric).toBe('[00:01.000]la')
    expect(body.hasLyric).toBe(true)
    // No object storage in this harness, so a cover is dropped rather than failing the add.
    expect(body.coverUrl).toBeNull()
  })

  // FB-F8: the row carries the catalogue it came from, so the client can ask for "the same song
  // elsewhere" without offering the entry that just failed. Another source's row has no catalogue.
  it('names the catalogue identity a provider row was written with', async () => {
    await makeDb()
    const app = makeApp()
    const imported = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease',
      sourceId: 'a1',
      title: 'Song A',
    })
    expect(imported.status).toBe(201)
    expect(await imported.json()).toMatchObject({ providerSource: 'netease', providerSongId: 'a1' })

    // The same identity has to survive the library listing, which is where a reader's rows come from.
    const listed = await request(app, '/api/music/library')
    const body = await listed.json() as { tracks: { providerSource?: string | null; providerSongId?: string | null }[] }
    const row = body.tracks.find((entry) => entry.providerSource === 'netease')
    expect(row?.providerSongId).toBe('a1')
  })

  it('resolves one playable url per play through the url endpoint', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ url: 'https://cdn.example.com/stream.mp3', br: 320000 }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/url?source=netease&id=a1&quality=320')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ url: 'https://cdn.example.com/stream.mp3' })
    expect(calls[0]).toContain('types=url')
    expect((await request(app, '/api/music/provider/url?source=netease&id=')).status).toBe(400)
  })
})

