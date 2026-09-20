import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { errorResponse } from '../src/worker/lib/errors'
import { hashPassword } from '../src/worker/lib/password'
import { blogManageRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const WIPE_PASSWORD = 'wipe-12345678'
const DAY_MS = 86_400_000
const ENV = { env: { DB: null as unknown as D1Database } }

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedAuthor(db: D1Shim): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, 'login', 'Author', '', 1, 1)`,
    USER, `user-${USER}`, await hashPassword(WIPE_PASSWORD),
  )
}

interface VisitSeed {
  visitedAt?: number
  visitorFp?: string
  isBot?: number
}

async function seedVisit(db: D1Shim, fields: VisitSeed = {}): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, country, is_bot, is_self_referrer, is_owner)
     VALUES (?1, 'p-1', 'post-1', ?2, ?3, 'US', ?4, 0, 0)`,
    USER,
    fields.visitedAt ?? Date.now(),
    fields.visitorFp ?? `fp-${Math.random()}`,
    fields.isBot ?? 0,
  )
}

async function visitCount(db: D1Shim): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM blog_visits WHERE user_id = ?1').bind(USER).first<{ n: number }>()
  return row?.n ?? 0
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/blog', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.use('/api/blog/*', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog', blogManageRoutes)
  return app
}

function deleteJson(app: Hono<AppBindings>, path: string, body?: unknown): Promise<Response> {
  return app.request(path, body === undefined
    ? { method: 'DELETE' }
    : {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, ENV.env as AppBindings['Bindings'])
}

describe('blog visit log cleanup guards (SH-47)', () => {
  it('rejects older_than cleanup with a non-positive or unparseable days instead of wiping logs', async () => {
    const db = await makeDb()
    await seedAuthor(db)
    await seedVisit(db, { visitedAt: Date.now() - 400 * DAY_MS, visitorFp: 'fp-old' })
    await seedVisit(db, { visitedAt: Date.now() - 60_000, visitorFp: 'fp-new' })
    const app = makeApp()

    for (const days of ['0', '-5', 'abc']) {
      const res = await deleteJson(app, `/api/blog/visits?type=older_than&days=${days}`)
      expect(res.status).toBe(400)
      expect(await visitCount(db)).toBe(2)
    }

    const ok = await deleteJson(app, '/api/blog/visits?type=older_than&days=30')
    expect(ok.status).toBe(200)
    expect((await ok.json()).deleted).toBe(1)
    expect(await visitCount(db)).toBe(1)
  })

  it('refuses to wipe every log unless the current password is re-entered', async () => {
    const db = await makeDb()
    await seedAuthor(db)
    await seedVisit(db, { visitorFp: 'fp-1' })
    await seedVisit(db, { visitorFp: 'fp-2', isBot: 1 })
    const app = makeApp()

    const noBody = await deleteJson(app, '/api/blog/visits?type=all')
    expect(noBody.status).toBe(401)
    expect((await noBody.json()).error.code).toBe('wrong_password')
    expect(await visitCount(db)).toBe(2)

    const wrong = await deleteJson(app, '/api/blog/visits?type=all', { password: 'not-it-12345678' })
    expect(wrong.status).toBe(401)
    expect(await visitCount(db)).toBe(2)
  })

  it('wipes every log once the current password is re-entered', async () => {
    const db = await makeDb()
    await seedAuthor(db)
    await seedVisit(db, { visitorFp: 'fp-1' })
    await seedVisit(db, { visitorFp: 'fp-2', isBot: 1 })
    const app = makeApp()

    const ok = await deleteJson(app, '/api/blog/visits?type=all', { password: WIPE_PASSWORD })
    expect(ok.status).toBe(200)
    expect((await ok.json()).deleted).toBe(2)
    expect(await visitCount(db)).toBe(0)
  })

  it('keeps targeted cleanup (bots/older_than) free of the password requirement', async () => {
    const db = await makeDb()
    await seedAuthor(db)
    await seedVisit(db, { visitedAt: Date.now() - 400 * DAY_MS, visitorFp: 'fp-old-real' })
    await seedVisit(db, { visitorFp: 'fp-bot', isBot: 1 })
    const app = makeApp()

    const bots = await deleteJson(app, '/api/blog/visits?type=bots')
    expect(bots.status).toBe(200)
    expect((await bots.json()).deleted).toBe(1)

    const older = await deleteJson(app, '/api/blog/visits?type=older_than&days=30')
    expect(older.status).toBe(200)
    expect((await older.json()).deleted).toBe(1)
  })
})
