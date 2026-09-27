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
  const seed = async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  }
  app.use('/api/music', seed)
  app.use('/api/music/*', seed)
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function scan(app: Hono<AppBindings>, ids: string[]): Promise<Response> {
  return request(app, '/api/music/tracks/reference-health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

async function insertRow(db: D1Shim, id: string, source: string, objectKey: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, created_at, updated_at)
     VALUES (?1, ?2, 'Song A', 'Ann', '', 1000, ?3, ?4, 'audio/mpeg', 0, 1, 1)`,
    id, USER, source, objectKey,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// FB-F9: a scan asks each reference row for one byte and says what came back. The distinction the
// reader acts on is between a link that is gone and a host that was merely slow.
describe('reference row health scan (FB-F9)', () => {
  it('marks a row whose host answers as ok and a row that vanished as dead', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-ok', 'external', 'https://cdn.example.com/ok.mp3')
    await insertRow(db, 't-gone', 'external', 'https://cdn.example.com/gone.mp3')
    vi.stubGlobal('fetch', async (input: string | URL) => (
      String(input).includes('gone') ? new Response(null, { status: 404 }) : new Response(null, { status: 206 })
    ))

    const res = await scan(app, ['t-ok', 't-gone'])
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      results: [{ id: 't-ok', status: 'ok' }, { id: 't-gone', status: 'dead' }],
    })
  })

  it('separates a host that is down from a link that is gone', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-down', 'external', 'https://cdn.example.com/down.mp3')
    await insertRow(db, 't-forbidden', 'external', 'https://cdn.example.com/private.mp3')
    vi.stubGlobal('fetch', async (input: string | URL) => {
      if (String(input).includes('down')) throw new Error('connection refused')
      return new Response(null, { status: 403 })
    })

    const body = await (await scan(app, ['t-down', 't-forbidden'])).json() as { results: { id: string; status: string }[] }
    expect(body.results).toEqual([
      { id: 't-down', status: 'unreachable' },
      { id: 't-forbidden', status: 'dead' },
    ])
  })

  // The address rule is the library's own guard, not an accident of the network: a row pointing at a
  // private address can never be fetched, so it is dead rather than merely unreachable.
  it('marks a row on a private address as dead without asking for it', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-private', 'external', 'http://192.168.1.5/song.mp3')
    const seen: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      seen.push(String(input))
      return new Response(null, { status: 200 })
    })

    const body = await (await scan(app, ['t-private'])).json() as { results: { status: string }[] }
    expect(body.results[0]?.status).toBe('dead')
    expect(seen).toEqual([])
  })

  it('probes an online row through the catalogue that resolves its playable link', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-provider', 'provider', 'gds:netease:a1')
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input))
      if (String(input).includes('types=url')) {
        return new Response(JSON.stringify({ url: 'https://cdn.example.com/play.mp3' }), { status: 200 })
      }
      return new Response(null, { status: 200 })
    })

    const body = await (await scan(app, ['t-provider'])).json() as { results: { status: string }[] }
    expect(body.results[0]?.status).toBe('ok')
    expect(calls[0]).toContain('types=url')
    expect(calls.some((url) => url.includes('cdn.example.com/play.mp3'))).toBe(true)
  })

  it('ignores rows that are not somebody else\'s address, and caps the batch', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-r2', 'r2', 'objects/song.mp3')
    vi.stubGlobal('fetch', async () => { throw new Error('no request should be made') })

    expect(await (await scan(app, ['t-r2'])).json()).toEqual({ results: [] })
    expect((await scan(app, Array.from({ length: 80 }, (_, index) => `id-${index}`))).status).toBe(400)
  })
})
