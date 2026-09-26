import { describe, expect, it } from 'vitest'
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
