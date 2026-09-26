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

function request(app: Hono<AppBindings>, path: string): Promise<Response> {
  return app.request(path, undefined, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } as RequestInit)
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
        { id: 'a1', name: 'Song A', artist: ['Ann', 'Ben'], album: 'Album One', duration: 210000 },
        { id: 'b2', name: 'Song B', artist: 'Cat', album: '', duration: 0 },
      ]), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/search?keywords=song&source=netease')
    expect(res.status).toBe(200)
    const body = await res.json() as { results: Array<{ source: string; sourceId: string; title: string; artist: string; album: string; durationMs: number | null }> }
    expect(body.results).toEqual([
      { source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann, Ben', album: 'Album One', durationMs: 210000 },
      { source: 'netease', sourceId: 'b2', title: 'Song B', artist: 'Cat', album: '', durationMs: null },
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

