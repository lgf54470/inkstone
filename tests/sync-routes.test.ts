import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { syncRoutes } from '../src/worker/routes/sync'
import { createSession } from '../src/worker/lib/session-store'
import { loadSession } from '../src/worker/middleware/auth'
import { errorResponse } from '../src/worker/lib/errors'
import { LIMITS } from '../src/shared/constants'
import { createD1Database as createDb, runSql, queryRows, queryFirst, type D1Shim } from './d1-harness'

const LEGACY_COOKIE = 'inkstone_session'

let db: D1Shim

function makeApp(extraEnv: Record<string, unknown> = {}): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))
  app.use('/api/*', loadSession)
  app.use('/api/*', async (c, next) => {
    for (const [key, value] of Object.entries(extraEnv)) {
      ;(c.env as unknown as Record<string, unknown>)[key] = value
    }
    await next()
  })
  app.route('/api/sync', syncRoutes)
  return app
}

async function makeDb(): Promise<void> {
  const { TABLE_STATEMENTS } = await import('../src/worker/db/schema/tables')
  const { INDEX_STATEMENTS } = await import('../src/worker/db/schema/indexes')
  db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
}

async function seedUser(username = 'alice'): Promise<string> {
  const id = `u-${++H.counter}`
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, role, settings, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', ?2, ?2, '', 'owner', '{}', ?3, ?3)`,
    id, username, H.now,
  )
  return id
}

async function seedNote(id: string, userId: string, title = 'Note'): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, ?3, '# note', '', 1, 1, 6, 0, 0, 0, 0, 'hash', ?4, ?4)`,
    id, userId, title, H.now,
  )
}

async function seedChange(seq: number, userId: string, entity: string, entityId: string, op = 'upsert'): Promise<void> {
  await runSql(
    db,
    `INSERT INTO changes (seq, user_id, entity, entity_id, op, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    seq, userId, entity, entityId, op, H.now + seq,
  )
}

async function signIn(userId: string): Promise<string> {
  return createSession(db as unknown as D1Database, userId)
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, { DB: db as unknown as D1Database } as unknown as AppBindings['Bindings'], {
    waitUntil: vi.fn(),
  } as unknown as ExecutionContext)
}

describe('sync routes (real D1)', () => {
  it('requires an authenticated session', async () => {
    await makeDb()
    const app = makeApp()
    const res = await request(app, '/api/sync')
    expect(res.status).toBe(401)
  })

  it('serves a full snapshot when the client has no cursor', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote('note-a', userId, 'Alpha')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/sync', { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.full).toBe(true)
    expect(body.hasMore).toBe(false)
    expect(body.settingsChanged).toBe(true)
    expect(body.notes).toHaveLength(1)
    expect(body.notes[0].title).toBe('Alpha')
  })

  it('returns only the changed delta when the cursor is inside the change window', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote('note-a', userId, 'Alpha')
    await seedNote('note-b', userId, 'Beta')
    await seedChange(1, userId, 'note', 'note-a')
    await seedChange(2, userId, 'note', 'note-b')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/sync?since=1`, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    const body = await res.json()
    expect(body.full).toBe(false)
    expect(body.cursor).toBe(2)
    expect(body.notes).toHaveLength(1)
    expect(body.notes[0].id).toBe('note-b')
    expect(body.facetsFull).toBe(true)
  })

  it('propagates deletions through the change stream', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote('note-a', userId)
    await seedChange(1, userId, 'note', 'note-a')
    await seedChange(2, userId, 'note', 'note-a', 'delete')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/sync?since=1`, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    const body = await res.json()
    expect(body.notes).toHaveLength(0)
    expect(body.deletions).toEqual([{ entity: 'note', id: 'note-a' }])
  })

  it('synthesizes a deletion when a changed note no longer exists', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote('note-a', userId)
    await seedChange(1, userId, 'note', 'note-a')
    await seedChange(2, userId, 'note', 'ghost-note')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/sync?since=1`, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    const body = await res.json()
    expect(body.full).toBe(false)
    expect(body.notes).toHaveLength(0)
    expect(body.deletions).toEqual([{ entity: 'note', id: 'ghost-note' }])
  })

  it('never moves the client cursor backwards when the server has no newer changes', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedChange(1, userId, 'note', 'note-a')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/sync?since=999`, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    const body = await res.json()
    expect(body.full).toBe(false)
    expect(body.notes).toHaveLength(0)
    expect(body.cursor).toBe(999)
  })

  it('pages the full snapshot through nextKey without dropping notes', async () => {
    await makeDb()
    const userId = await seedUser()
    const total = LIMITS.syncBatchSize + 1
    for (let index = 0; index < total; index++) {
      await seedNote(`n${String(index).padStart(4, '0')}`, userId, `Note ${index}`)
    }
    const token = await signIn(userId)
    const app = makeApp()
    const cookie = { Cookie: `${LEGACY_COOKIE}=${token}` }

    const first = await (await request(app, '/api/sync', { headers: cookie })).json()
    expect(first.full).toBe(true)
    expect(first.notes).toHaveLength(LIMITS.syncBatchSize)
    expect(first.hasMore).toBe(true)
    expect(first.nextKey).toBe(`n${String(LIMITS.syncBatchSize - 1).padStart(4, '0')}`)

    const second = await (await request(app, `/api/sync?after=${first.nextKey}`, { headers: cookie })).json()
    expect(second.full).toBe(true)
    expect(second.notes).toHaveLength(1)
    expect(second.hasMore).toBe(false)
    expect(second.nextKey).toBeNull()
    expect(second.folders).toEqual([])
    expect(second.tags).toEqual([])

    const seen = new Set<string>()
    let key: string | null = null
    for (let page = 0; page < 3; page++) {
      const path = key ? `/api/sync?after=${key}` : '/api/sync'
      const body = await (await request(app, path, { headers: cookie })).json()
      for (const note of body.notes) seen.add(note.id)
      key = body.nextKey
      if (!key) break
    }
    expect(seen.size).toBe(total)
  })

  it('reports the realtime channel as unavailable when no sync hub is bound', async () => {
    await makeDb()
    const userId = await seedUser()
    const token = await signIn(userId)
    const app = makeApp()
    const res = await request(app, '/api/sync/ws', { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } })
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('storage_unavailable')
  })

  it('rejects websocket upgrades from untrusted origins before reaching the hub', async () => {
    await makeDb()
    const userId = await seedUser()
    const token = await signIn(userId)
    let hubRequest: Request | null = null
    const app = makeApp({
      SYNC_HUB: {
        idFromName: (name: string) => `do-${name}`,
        get: () => ({
          fetch: async (req: Request) => {
            hubRequest = req
            return new Response('ok')
          },
        }),
      },
    })
    const cookie = { Cookie: `${LEGACY_COOKIE}=${token}` }

    const missingUpgrade = await request(app, '/api/sync/ws', { headers: cookie })
    expect(missingUpgrade.status).toBe(400)

    const evilOrigin = await request(app, '/api/sync/ws', {
      headers: { ...cookie, Origin: 'https://evil.example', Upgrade: 'websocket' },
    })
    expect(evilOrigin.status).toBe(403)
    expect(hubRequest).toBeNull()

    const trusted = await request(app, '/api/sync/ws', {
      headers: { ...cookie, Origin: 'http://localhost', Upgrade: 'websocket' },
    })
    expect(trusted.status).toBe(200)
    expect(hubRequest?.url).toBe('https://sync-hub.internal/connect')
  })
})
