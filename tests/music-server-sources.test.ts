import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { parseProviderReference, parseServerObjectKey } from '../src/worker/routes/music/keys'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

/**
 * FB-M16: server-type sources, end to end through the routes. Two things are worth pinning here that
 * the adapter tests cannot see: the registration never hands the credential back to the browser, and
 * a song added from a server behaves like every other reference row (metadata in the library, the
 * play address resolved later, re-adding a no-op) — including that the row keeps answering after the
 * registration it came from is deleted.
 */
const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database, CREDENTIAL_VAULT: vault() } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

// A stand-in for the vault Durable Object: `/encrypt` answers a ciphertext, `/decrypt` the value.
function vault(): unknown {
  return {
    idFromName: () => 'vault-id',
    get: () => ({
      fetch: async (url: string, init: { body?: string }) => {
        const body = JSON.parse(String(init.body)) as { value?: unknown; ciphertext?: string }
        const answer = url.endsWith('/encrypt')
          ? { ciphertext: JSON.stringify(body.value) }
          : { value: JSON.parse(String(body.ciphertext)) }
        return new Response(JSON.stringify(answer), { status: 200 })
      },
    }),
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
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

function post(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function stubFetch(...answers: unknown[]): string[] {
  const seen: string[] = []
  const queue = [...answers]
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    seen.push(String(input))
    const answer = queue.shift() ?? {}
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
  return seen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const PING_OK = { 'subsonic-response': { status: 'ok' } }

async function register(app: Hono<AppBindings>, seen: string[]): Promise<string> {
  const response = await post(app, '/api/music/servers', {
    name: 'Home',
    kind: 'subsonic',
    url: 'https://music.example.com',
    username: 'owner',
    password: 'secret',
  })
  expect(response.status).toBe(201)
  expect(seen[0]).toContain('/rest/ping.view?')
  const created = (await response.json()) as Record<string, unknown>
  return String(created.id)
}

describe('server sources (FB-M16)', () => {
  it('verifies a registration, never answers with the credential, and can be probed', async () => {
    const app = makeApp()
    await makeDb()
    const seen = stubFetch(PING_OK, PING_OK)
    const id = await register(app, seen)

    const listed = await (await request(app, '/api/music/servers')).json() as { servers: Record<string, unknown>[] }
    expect(listed.servers).toHaveLength(1)
    expect(listed.servers[0]).toMatchObject({ id, name: 'Home', kind: 'subsonic', url: 'https://music.example.com', username: 'owner' })
    expect(JSON.stringify(listed)).not.toContain('secret')

    expect((await post(app, `/api/music/servers/${id}/probe`, {})).status).toBe(200)
  })

  it('searches the reader’s server and imports a hit as a reference row', async () => {
    const app = makeApp()
    await makeDb()
    const seen = stubFetch(
      PING_OK,
      { 'subsonic-response': { status: 'ok', searchResult3: { song: [{ id: '1', title: 'Nightfall', artist: 'Zoe', album: 'First Light', duration: 245 }] } } },
    )
    const id = await register(app, seen)

    const search = await (await request(app, `/api/music/servers/${id}/search?keywords=night`)).json()
    expect(search).toMatchObject({ kind: 'subsonic', results: [{ itemId: '1', title: 'Nightfall', durationMs: 245_000 }] })

    const imported = await post(app, `/api/music/servers/${id}/import`, { itemId: '1', title: 'Nightfall', artist: 'Zoe', album: 'First Light', durationMs: 245_000 })
    expect(imported.status).toBe(201)
    const track = (await imported.json()) as Record<string, unknown>
    expect(track).toMatchObject({ source: 'provider', providerSource: 'subsonic', providerSongId: '1', title: 'Nightfall' })

    // The row is a reference: the library holds its metadata only, and nothing was fetched to add it.
    const library = await (await request(app, '/api/music/library')).json() as { tracks: Record<string, unknown>[] }
    expect(library.tracks).toHaveLength(1)
    expect(library.tracks[0]).toMatchObject({ source: 'provider', providerSource: 'subsonic', providerSongId: '1' })

    // Adding the same song twice is a no-op, keyed by the (user, server, item) triple.
    const again = await post(app, `/api/music/servers/${id}/import`, { itemId: '1', title: 'Nightfall' })
    expect(again.status).toBe(200)
    const after = await (await request(app, '/api/music/library')).json() as { tracks: unknown[] }
    expect(after.tracks).toHaveLength(1)
  })

  it('keeps the imported rows when the registration is removed', async () => {
    const app = makeApp()
    await makeDb()
    const seen = stubFetch(PING_OK)
    const id = await register(app, seen)
    await post(app, `/api/music/servers/${id}/import`, { itemId: '1', title: 'Nightfall' })

    expect((await request(app, `/api/music/servers/${id}`, { method: 'DELETE' })).status).toBe(200)
    const library = await (await request(app, '/api/music/library')).json() as { tracks: unknown[] }
    expect(library.tracks).toHaveLength(1)
    // …and the registration is gone, so the row no longer resolves anywhere.
    expect((await request(app, `/api/music/servers/${id}/search?keywords=x`)).status).toBe(404)
  })

  it('refuses an empty search and an unknown server', async () => {
    const app = makeApp()
    await makeDb()
    const seen = stubFetch(PING_OK)
    const id = await register(app, seen)
    expect((await request(app, `/api/music/servers/${id}/search?keywords=%20`)).status).toBe(400)
    expect((await request(app, '/api/music/servers/nope/search?keywords=x')).status).toBe(404)
  })

  it('refuses a registration the server does not answer', async () => {
    const app = makeApp()
    await makeDb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const response = await post(app, '/api/music/servers', {
      name: 'Home', kind: 'subsonic', url: 'https://music.example.com', username: 'owner', password: 'secret',
    })
    expect(response.status).toBe(502)
  })
})

// The row's identity is the third thing the two halves have to agree on: the writer puts the kind,
// the server and the item in `object_key`, and the reader takes them back out without a join.
describe('server reference keys (FB-M16)', () => {
  it('round-trips a kind, a server and an item — item ids with colons included', () => {
    expect(parseServerObjectKey('srv:jellyfin:s1:abc:def')).toEqual({ kind: 'jellyfin', serverId: 's1', itemId: 'abc:def' })
    expect(parseServerObjectKey('srv:subsonic:s1:42')).toEqual({ kind: 'subsonic', serverId: 's1', itemId: '42' })
  })

  it('refuses a key that is not a server reference, and one with an unknown kind', () => {
    expect(parseServerObjectKey('gds:netease:9')).toBeNull()
    expect(parseServerObjectKey('srv:spotify:s1:42')).toBeNull()
    expect(parseServerObjectKey('srv:subsonic:s1')).toBeNull()
  })

  it('answers the same question for both reference families', () => {
    expect(parseProviderReference('gds:netease:9')).toEqual({ source: 'netease', songId: '9' })
    expect(parseProviderReference('srv:subsonic:s1:42')).toEqual({ source: 'subsonic', songId: '42' })
    expect(parseProviderReference('music/2026-01-01/x.mp3')).toBeNull()
  })
})
