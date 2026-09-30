import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const ALICE = 'user-alice'
const BOB = 'user-bob'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext
const NOW = 2_000_000_000_000

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedUser(db: D1Shim, id: string, username: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', ?2, '', 1000, 1000)`,
    id, username,
  )
}

async function seedNote(db: D1Shim, userId: string, id: string, title: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, content, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5)`,
    id, userId, title, `body of ${title}`, NOW,
  )
}

function makeApp(actingUserId: string): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/blog', async (c, next) => {
    c.set('userId', actingUserId)
    await next()
  })
  app.use('/api/blog/*', async (c, next) => {
    c.set('userId', actingUserId)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog', blogManageRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  return app
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function publish(app: Hono<AppBindings>, noteId: string, slug: string): Promise<Response> {
  return postJson(app, '/api/blog/posts', { noteId, slug, isPublished: true })
}

/**
 * A slug names a post inside one blog. Instance-wide uniqueness made the second account's own post
 * fail to publish because the first account had used the name, and `/check-slug` answered the same
 * question for both, so one blog's naming was readable from another's editor.
 */
describe('blog post slugs are unique per account', () => {
  it('lets two accounts publish the same slug', async () => {
    const db = await makeDb()
    await seedUser(db, ALICE, 'alice')
    await seedUser(db, BOB, 'bob')
    await seedNote(db, ALICE, 'note-alice', 'Alice post')
    await seedNote(db, BOB, 'note-bob', 'Bob post')

    const alice = await publish(makeApp(ALICE), 'note-alice', 'hello-world')
    expect(alice.status).toBe(200)
    const bob = await publish(makeApp(BOB), 'note-bob', 'hello-world')
    expect(bob.status).toBe(200)

    const rows = await db
      .prepare('SELECT user_id, slug FROM blog_posts ORDER BY user_id')
      .all<{ user_id: string; slug: string }>()
    expect(rows.results).toEqual([
      { user_id: ALICE, slug: 'hello-world' },
      { user_id: BOB, slug: 'hello-world' },
    ])
  })

  it('still refuses a second post under the same slug for the same account', async () => {
    const db = await makeDb()
    await seedUser(db, ALICE, 'alice')
    await seedNote(db, ALICE, 'note-one', 'One')
    await seedNote(db, ALICE, 'note-two', 'Two')

    const app = makeApp(ALICE)
    expect((await publish(app, 'note-one', 'taken')).status).toBe(200)
    expect((await publish(app, 'note-two', 'taken')).status).toBe(409)
  })

  it('answers slug availability from the asking account own posts only', async () => {
    const db = await makeDb()
    await seedUser(db, ALICE, 'alice')
    await seedUser(db, BOB, 'bob')
    await seedNote(db, ALICE, 'note-alice', 'Alice post')
    await publish(makeApp(ALICE), 'note-alice', 'alice-slug')

    const asBob = await makeApp(BOB).request(
      '/api/blog/check-slug?slug=alice-slug',
      undefined,
      DB_ENV.env as AppBindings['Bindings'],
      EXECUTION_CTX,
    )
    expect(asBob.status).toBe(200)
    expect(await asBob.json()).toEqual({ available: true })

    const asAlice = await makeApp(ALICE).request(
      '/api/blog/check-slug?slug=alice-slug',
      undefined,
      DB_ENV.env as AppBindings['Bindings'],
      EXECUTION_CTX,
    )
    expect(await asAlice.json()).toEqual({ available: false, reason: 'Slug is already in use' })
  })

  it('serves each blog its own post under the shared slug', async () => {
    const db = await makeDb()
    await seedUser(db, ALICE, 'alice')
    await seedUser(db, BOB, 'bob')
    await seedNote(db, ALICE, 'note-alice', 'Alice post')
    await seedNote(db, BOB, 'note-bob', 'Bob post')
    await publish(makeApp(ALICE), 'note-alice', 'hello-world')
    await publish(makeApp(BOB), 'note-bob', 'hello-world')

    const forAlice = await makeApp(ALICE).request(
      '/api/blog/public/posts/hello-world?owner=alice',
      undefined,
      DB_ENV.env as AppBindings['Bindings'],
      EXECUTION_CTX,
    )
    const alicePost = (await forAlice.json() as { post: { title: string } }).post
    expect(alicePost.title).toBe('Alice post')

    const forBob = await makeApp(BOB).request(
      '/api/blog/public/posts/hello-world?owner=bob',
      undefined,
      DB_ENV.env as AppBindings['Bindings'],
      EXECUTION_CTX,
    )
    const bobPost = (await forBob.json() as { post: { title: string } }).post
    expect(bobPost.title).toBe('Bob post')
  })
})
