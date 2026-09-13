import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { searchRoutes } from '../src/worker/routes/search'
import { loadSession } from '../src/worker/middleware/auth'
import { createSession } from '../src/worker/lib/session-store'
import { errorResponse } from '../src/worker/lib/errors'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const NOW = 2_000_000_000_000

// 26-char valid ids ([0-9a-hjkmnp-tv-z]{26}); the graph route validates center/folder formats
function vid(seed: string): string {
  return `a${seed.padStart(25, 'c')}`
}
const LEGACY_COOKIE = 'inkstone_session'

let db: D1Shim

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))
  app.use('/api/*', loadSession)
  app.route('/api/search', searchRoutes)
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
  const id = 'graph-user'
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, role, settings, created_at, last_seen_at)
     VALUES (?1, 'alice', 'x', 'alice', 'Alice', '', 'owner', '{}', ?2, ?2)`,
    id, NOW,
  )
  return id
}

async function seedNote(id: string, userId: string, updatedAt: number, folderId: string | null = null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?4, '# note', '', 1, 1, 6, 0, 0, 0, 0, 'hash', ?5, ?5)`,
    id, userId, folderId, `Title ${id}`, updatedAt,
  )
}

async function seedLink(userId: string, source: string, target: string | null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO links (source_note_id, target_note_id, target_key, target_title, user_id)
     VALUES (?1, ?2, ?3, ?3, ?4)`,
    source, target, target ?? 'missing-note', userId,
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

interface GraphNode {
  id: string
  degree: number
  inDegree: number
  outDegree: number
}

describe('graph route degree aggregation (real D1)', () => {
  it('computes degree, in and out degrees once per user without correlated probes', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('1'), userId, NOW + 30)
    await seedNote(vid('2'), userId, NOW + 20)
    await seedNote(vid('3'), userId, NOW + 10)
    await seedLink(userId, vid('1'), vid('2'))
    await seedLink(userId, vid('1'), vid('3'))
    await seedLink(userId, vid('2'), vid('3'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph', token)
    expect(res.status).toBe(200)
    const body = await res.json()
    const byId = new Map<string, GraphNode>(body.nodes.map((node: GraphNode) => [node.id, node]))
    expect(byId.get(vid('1'))).toMatchObject({ degree: 2, inDegree: 0, outDegree: 2 })
    expect(byId.get(vid('2'))).toMatchObject({ degree: 2, inDegree: 1, outDegree: 1 })
    expect(byId.get(vid('3'))).toMatchObject({ degree: 2, inDegree: 2, outDegree: 0 })
    expect(body.edges).toHaveLength(3)
    expect(body.meta.totalNodes).toBe(3)
  })

  it('orders global nodes by degree descending and keeps unresolved links out of link degrees', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('h'), userId, NOW + 10)
    await seedNote(vid('l'), userId, NOW + 40)
    await seedNote(vid('x'), userId, NOW + 30)
    await seedLink(userId, vid('l'), vid('h'))
    await seedLink(userId, vid('x'), null)
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, '/api/search/graph', token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id)).toEqual([vid('l'), vid('h'), vid('x')])
    const hub = body.nodes.find((node: GraphNode) => node.id === vid('h'))
    expect(hub).toMatchObject({ degree: 1, inDegree: 1, outDegree: 0 })
  })

  it('limits the local graph to the configured depth around the center', async () => {
    await makeDb()
    const userId = await seedUser()
    await seedNote(vid('1'), userId, NOW)
    await seedNote(vid('2'), userId, NOW)
    await seedNote(vid('3'), userId, NOW)
    await seedLink(userId, vid('1'), vid('2'))
    await seedLink(userId, vid('2'), vid('3'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/search/graph?mode=local&center=${vid('1')}&depth=1`, token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id).sort()).toEqual([vid('1'), vid('2')])
    expect(body.meta.centerId).toBe(vid('1'))
  })

  it('applies folder and tag filters before degree ordering', async () => {
    await makeDb()
    const userId = await seedUser()
    const folder = vid('f')
    await runSql(
      db,
      `INSERT INTO folders (id, user_id, parent_id, name, position, created_at, updated_at, deleted_at)
       VALUES (?1, ?2, NULL, 'Work', 0, ?3, ?3, NULL)`,
      folder, userId, NOW,
    )
    await seedNote(vid('wh'), userId, NOW + 5, folder)
    await seedNote(vid('wl'), userId, NOW + 40, folder)
    await seedNote(vid('on'), userId, NOW + 50, null)
    await seedLink(userId, vid('wl'), vid('wh'))
    await seedLink(userId, vid('on'), vid('wh'))
    await runSql(
      db,
      `INSERT INTO tags (id, user_id, name, created_at) VALUES ('tag-1', ?1, 'work', ?2)`,
      userId, NOW,
    )
    await runSql(db, `INSERT INTO note_tags (note_id, tag_id) VALUES (?1, 'tag-1')`, vid('wh'))
    const token = await signIn(userId)
    const app = makeApp()

    const res = await request(app, `/api/search/graph?folderId=${folder}`, token)
    const body = await res.json()
    expect(body.nodes.map((node: GraphNode) => node.id)).toEqual([vid('wh'), vid('wl')])
    expect(body.nodes[0].degree).toBe(2)

    const tagged = await request(app, '/api/search/graph?tags=work', token)
    const taggedBody = await tagged.json()
    expect(taggedBody.nodes.map((node: GraphNode) => node.id)).toEqual([vid('wh')])
  })
})
