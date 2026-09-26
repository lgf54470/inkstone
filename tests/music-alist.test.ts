import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

// The credential vault is a Durable Object the D1 harness cannot host; the tests
// swap in a reversible transform so encryption is still round-tripped and the
// plaintext never lands in the column.
vi.mock('../src/worker/lib/crypto', () => ({
  encryptSecret: async (_env: unknown, _info: string, value: unknown) =>
    `enc:${Buffer.from(JSON.stringify(value)).toString('base64')}`,
  decryptSecret: async (_env: unknown, _info: string, stored: string) =>
    JSON.parse(Buffer.from(stored.slice(4), 'base64').toString()) as unknown,
}))

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, queryRows, runSql, type D1Shim } from './d1-harness'

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

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('alist server config (FEA-A3-1)', () => {
  it('creates a server without ever echoing the token', async () => {
    const db = await makeDb()

    const app = makeApp()
    const res = await json(app, '/api/music/alist', {
      name: 'Home NAS', url: 'https://alist.example.com', token: 'alist-token-1', rootPath: '/media',
    })
    expect(res.status).toBe(201)
    const server = await res.json() as Record<string, unknown>
    expect(server.name).toBe('Home NAS')
    expect(server.url).toBe('https://alist.example.com')
    expect(server.rootPath).toBe('/media')
    expect('token' in server).toBe(false)

    const row = await db.prepare('SELECT secret FROM music_alist_servers WHERE id = ?1').bind(server.id).first<{ secret: string }>()
    expect(row?.secret).toBeTruthy()
    expect(row?.secret).not.toContain('alist-token-1')
  })

  it('lists servers and never carries the token through the wire', async () => {
    const db = await makeDb()

    const app = makeApp()
    await json(app, '/api/music/alist', { name: 'S1', url: 'https://a.example.com', token: 't1' })
    const list = await (await request(app, '/api/music/alist')).json() as { servers: Array<Record<string, unknown>> }
    expect(list.servers).toHaveLength(1)
    expect(list.servers[0]?.name).toBe('S1')
    expect(JSON.stringify(list)).not.toContain('t1')
  })

  it('updates fields and keeps the stored token when none is given', async () => {
    const db = await makeDb()

    const app = makeApp()
    const created = await (await json(app, '/api/music/alist', { name: 'S1', url: 'https://a.example.com', token: 'keep-me' })).json() as { id: string }
    const renamed = await (await json(app, `/api/music/alist/${created.id}`, { name: 'Renamed' }, 'PATCH')).json() as Record<string, unknown>
    expect(renamed.name).toBe('Renamed')
    const row = await db.prepare('SELECT secret FROM music_alist_servers WHERE id = ?1').bind(created.id).first<{ secret: string }>()
    expect(row?.secret).toBeTruthy()
    expect((await request(app, `/api/music/alist/${created.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await request(app, '/api/music/alist')).json()).resolves.toMatchObject({ servers: [] })
  })

  it('rejects non-http urls and missing names', async () => {
    const db = await makeDb()

    const app = makeApp()
    for (const body of [
      { name: 'X', url: 'ftp://x.example.com', token: 't' },
      { name: '', url: 'https://x.example.com', token: 't' },
      { name: 'X', url: 'https://x.example.com' },
    ]) {
      expect((await json(app, '/api/music/alist', body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})
