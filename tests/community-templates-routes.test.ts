import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { communityTemplatesRoutes } from '../src/worker/routes/community-templates'
import { loadSession } from '../src/worker/middleware/auth'
import { createSession } from '../src/worker/lib/session-store'
import { errorResponse } from '../src/worker/lib/errors'
import { createD1Database as createDb, runSql, queryRows, type D1Shim } from './d1-harness'

const NOW = 2_000_000_000_000
const LEGACY_COOKIE = 'inkstone_session'

let db: D1Shim

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))
  app.use('/api/*', loadSession)
  app.route('/api/templates/community', communityTemplatesRoutes)
  return app
}

async function makeDb(): Promise<void> {
  const { TABLE_STATEMENTS } = await import('../src/worker/db/schema/tables')
  const { INDEX_STATEMENTS } = await import('../src/worker/db/schema/indexes')
  db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
}

async function seedUser(): Promise<string> {
  const id = 'ct-user'
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, role, settings, created_at, last_seen_at)
     VALUES (?1, 'alice', 'x', 'alice', 'Alice', '', 'owner', '{}', ?2, ?2)`,
    id, NOW,
  )
  return id
}

function vid(seed: string): string {
  return `a${seed.padStart(25, 'c')}`
}

async function seedTemplate(id: string, createdAt: number, name: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO community_templates (id, author_id, author_name, name, description, content, tags, category, created_at)
     VALUES (?1, 'ct-user', 'Alice', ?2, '', '# tpl', '[]', '', ?3)`,
    id, name, createdAt,
  )
}

async function signIn(userId: string): Promise<string> {
  return createSession(db as unknown as D1Database, userId)
}

function request(app: Hono<AppBindings>, path: string, token: string): Promise<Response> {
  return app.request(path, { headers: { Cookie: `${LEGACY_COOKIE}=${token}` } },
    { DB: db as unknown as D1Database } as unknown as AppBindings['Bindings'],
    { waitUntil: vi.fn() } as unknown as ExecutionContext)
}

describe('community templates routes (real D1)', () => {
  it('lists templates newest first with pagination cursors', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedTemplate(vid('1'), NOW + 100, 'Oldest')
    await seedTemplate(vid('2'), NOW + 200, 'Middle')
    await seedTemplate(vid('3'), NOW + 300, 'Newest')
    const token = await signIn(userId)
    const app = makeApp()

    const page1 = await (await request(app, '/api/templates/community?limit=2', token)).json()
    expect(page1.templates.map((t: { name: string }) => t.name)).toEqual(['Newest', 'Middle'])
    expect(page1.hasMore).toBe(true)
    expect(page1.nextCursor).toBe(`${NOW + 200}_${vid('2')}`)

    const page2 = await (await request(app, `/api/templates/community?limit=2&before=${encodeURIComponent(page1.nextCursor)}`, token)).json()
    expect(page2.templates.map((t: { name: string }) => t.name)).toEqual(['Oldest'])
    expect(page2.hasMore).toBe(false)
    expect(page2.nextCursor).toBeNull()
  })

  it('returns every template when no limit is passed and the directory is small', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedTemplate(vid('1'), NOW + 1, 'Only')
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/templates/community', token)
    const body = await res.json()
    expect(body.templates).toHaveLength(1)
    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  it('rejects malformed pagination cursors', async () => {
    await makeDb()
    const userId = await seedUser()
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/templates/community?before=not-a-cursor', token)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('bad_request')
    expect(await queryRows(db, 'SELECT id FROM community_templates')).toHaveLength(0)
  })

  it('clamps an out-of-range limit into the supported page size window', async () => {
    await makeDb()
    const userId = await seedUser()
    const token = await signIn(userId)
    const app = makeApp()

    const zero = await (await request(app, '/api/templates/community?limit=0', token)).json()
    const huge = await (await request(app, '/api/templates/community?limit=99999', token)).json()
    expect(zero.hasMore).toBe(false)
    expect(huge.hasMore).toBe(false)
  })
})
