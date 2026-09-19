import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newSlug: () => `slug-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { hashPassword } from '../src/worker/lib/password'
import { computeVisitorFingerprint } from '../src/worker/lib/share-analytics'
import { purgeExpiredOperationalData } from '../src/worker/lib/maintenance'
import { shareManageRoutes, shareRoutes } from '../src/worker/routes/share'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database, VISIT_FP_SECRET: undefined as string | undefined } }

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  DB_ENV.env.VISIT_FP_SECRET = undefined
  return db
}

async function seedUser(db: D1Shim, id = USER, passwordHash = 'x'): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, 'login', 'Author', '', ?4, ?4)`,
    id, `user-${id}`, passwordHash, H.now,
  )
}

async function seedNote(db: D1Shim, fields: Record<string, unknown>): Promise<string> {
  const content = (fields.content ?? '') as string
  const id = (fields.id ?? 'n-' + ++H.counter) as string
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, '', ?5, '', 1, 1, 1, ?6, ?7, 0, 0, ?8, ?9, ?9)`,
    id, fields.user_id ?? USER, fields.folder_id ?? null, fields.title ?? 'Note', content,
    fields.is_pinned ? 1 : 0, fields.is_starred ? 1 : 0,
    shaOf(content), H.now,
  )
  return id
}

async function seedShare(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO shares (slug, note_id, user_id, folder_id, tags, password_hash, expires_at, views, is_enabled, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    fields.slug ?? 'share-' + ++H.counter,
    fields.note_id,
    fields.user_id ?? USER,
    fields.folder_id ?? null,
    fields.tags ?? '[]',
    fields.password_hash ?? null,
    fields.expires_at ?? null,
    fields.views ?? 0,
    fields.is_enabled ?? 1,
    fields.created_at ?? H.now,
  )
}

async function seedVisit(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO share_visits (user_id, note_id, slug, visited_at, visitor_fp, country, referrer_host,
       device_type, os, browser, is_bot, is_self_referrer, is_owner)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'desktop', 'os', 'browser', ?8, 0, 0)`,
    USER, fields.note_id, fields.slug ?? 'share-1',
    fields.visited_at ?? Date.now() - 60_000,
    fields.visitor_fp ?? `fp-${++H.counter}`,
    fields.country ?? 'US',
    fields.referrer_host ?? null,
    fields.is_bot ? 1 : 0,
  )
}

const EXECUTION_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/share', async (c, next) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    await next()
  })
  app.use('/api/share/*', async (c, next) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/share', shareManageRoutes)
  app.route('/api/public', shareRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function postJsonUnused(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteJson(app: Hono<AppBindings>, path: string, body?: unknown): Promise<Response> {
  if (body === undefined) return request(app, path, { method: 'DELETE' })
  return request(app, path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('share list route (real D1)', () => {
  it('returns shares with global stats and honors status/search filters', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'Active note' })
    const n2 = await seedNote(db, { title: 'Paused note' })
    await seedShare(db, { note_id: n1, slug: 'alpha', views: 5 })
    await seedShare(db, { note_id: n2, slug: 'beta', views: 2, is_enabled: 0 })
    const app = makeApp()

    const res = await request(app, '/api/share?status=active')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shares.map((s: { slug: string }) => s.slug)).toEqual(['alpha'])
    expect(body.total).toBe(1)
    expect(body.globalStats.totalShares).toBe(2)
    expect(body.globalStats.activeShares).toBe(1)
    expect(body.globalStats.pausedShares).toBe(1)

    const paused = await (await request(app, '/api/share?status=paused')).json()
    expect(paused.shares.map((s: { slug: string }) => s.slug)).toEqual(['beta'])

    const searched = await (await request(app, '/api/share?search=Paused')).json()
    expect(searched.shares.map((s: { slug: string }) => s.slug)).toEqual(['beta'])
  })

  it('reports note views from share_visits stats and excludes bot visits by default', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1' })
    await seedShare(db, { note_id: 'n-1', slug: 's-1', views: 10 })
    await seedVisit(db, { note_id: 'n-1', slug: 's-1' })
    await seedVisit(db, { note_id: 'n-1', slug: 's-1', is_bot: true, visitor_fp: 'bot-fp' })
    const app = makeApp()

    const body = await (await request(app, '/api/share')).json()
    expect(body.shares[0].views).toBe(1)
    expect(body.shares[0].uniqueVisitors).toBe(1)
    expect(body.globalStats.totalViews).toBe(1)

    const withBots = await (await request(app, '/api/share?excludeBots=false')).json()
    expect(withBots.globalStats.totalViews).toBe(2)
  })
})

describe('share note-share & upsert routes (real D1)', () => {
  it('returns share:null for an unshared note', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Unshared' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/note-share/n-1')).json()
    expect(body.share).toBeNull()
    expect(body.noteTitle).toBe('Unshared')
  })

  it('creates a share through POST /:noteId with a custom slug and password hash', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Create me' })
    const app = makeApp()

    const res = await postJson(app, `/api/share/${n1}`, {
      customSlug: 'my-custom',
      password: 'pass1234',
      tags: ['alpha', 'beta'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.share.slug).toBe('my-custom')
    expect(body.share.hasPassword).toBe(true)
    expect(body.share.noteTitle).toBe('Create me')
    const row = await firstRow(db, 'SELECT password_hash, tags FROM shares WHERE note_id = ?1', n1)
    expect(row!.password_hash).not.toBeNull()
    expect(row!.tags).toBe(JSON.stringify(['alpha', 'beta']))
  })

  it('rejects a custom slug that is already taken by another share', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'taken-slug' })
    const app = makeApp()

    const res = await postJson(app, `/api/share/${n2}`, { customSlug: 'taken-slug' })
    expect(res.status).toBe(409)
  })
})

describe('share batch routes (real D1)', () => {
  it('enables, disables and revokes shares for a list of note ids', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    const app = makeApp()

    const enabled = await postJson(app, '/api/share/batch', { action: 'enable', noteIds: [n1, n2] })
    expect(enabled.status).toBe(200)
    expect((await enabled.json()).count).toBe(2)
    expect((await allRows(db, 'SELECT * FROM shares WHERE user_id = ?1', USER)).length).toBe(2)
    expect(await firstRow(db, 'SELECT is_enabled FROM shares WHERE note_id = ?1', n1)).toEqual({ is_enabled: 1 })

    await postJson(app, '/api/share/batch', { action: 'disable', noteIds: [n1, n2] })
    expect((await allRows(db, 'SELECT * FROM shares WHERE is_enabled = 1')).length).toBe(0)

    const revoked = await postJson(app, '/api/share/batch', { action: 'revoke', noteIds: [n1] })
    expect((await revoked.json()).count).toBe(1)
    expect((await allRows(db, 'SELECT * FROM shares WHERE note_id = ?1', n1)).length).toBe(0)
  })

  it('expires and moves shares for a note list', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'keep' })
    const app = makeApp()

    const folder = 'c'.repeat(26)
    const moved = await postJson(app, '/api/share/batch', { action: 'move', noteIds: [n1], folderId: folder })
    expect((await moved.json()).ok).toBe(true)
    expect(await firstRow(db, 'SELECT folder_id FROM shares WHERE note_id = ?1', n1)).toEqual({ folder_id: folder })

    const expired = await postJson(app, '/api/share/batch', { action: 'expire', noteIds: [n1], expiresIn: 60 })
    expect((await expired.json()).ok).toBe(true)
    const row = await firstRow(db, 'SELECT expires_at FROM shares WHERE note_id = ?1', n1)
    expect(typeof row!.expires_at).toBe('number')
  })

  it('enables every note in a folder through batch-folder', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { folder_id: 'f-1' })
    const n2 = await seedNote(db, { folder_id: 'f-1' })
    await runSql(
      db,
      `INSERT INTO share_folders (id, user_id, parent_id, name, position, created_at, updated_at)
       VALUES ('f-1', ?1, NULL, 'Folder', 0, ?2, ?2)`,
      USER, H.now,
    )
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch-folder', { folderId: 'f-1', enabled: true })
    expect((await res.json()).count).toBe(2)
    expect((await allRows(db, 'SELECT note_id FROM shares WHERE user_id = ?1', USER)).length).toBe(2)
    expect(await firstRow(db, 'SELECT note_id FROM shares WHERE note_id = ?1', n1)).not.toBeNull()
    expect(await firstRow(db, 'SELECT note_id FROM shares WHERE note_id = ?1', n2)).not.toBeNull()
  })
})

describe('share visits route (real D1)', () => {
  it('paginates visit logs and filters by bot', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Visited' })
    await seedShare(db, { note_id: n1, slug: 'v-1' })
    const base = Date.now()
    for (let i = 0; i < 12; i++) {
      await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: `fp-${i}`, visited_at: base + i })
    }
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-bot', visited_at: base - 1, is_bot: true })
    const app = makeApp()

    const pageOne = await (await request(app, '/api/share/visits?limit=10&page=1')).json()
    expect(pageOne.total).toBe(13)
    expect(pageOne.totalPages).toBe(2)
    expect(pageOne.visits.length).toBe(10)
    expect(pageOne.visits[0].visitorFp).toBe('fp-11')
    expect(pageOne.visits[0].botName).toBeNull()

    const pageTwo = await (await request(app, '/api/share/visits?limit=10&page=2')).json()
    expect(pageTwo.visits.length).toBe(3)
    expect(pageTwo.visits[0].visitorFp).toBe('fp-1')

    const bots = await (await request(app, '/api/share/visits?filter=bot')).json()
    expect(bots.total).toBe(1)
    expect(bots.visits[0].isBot).toBe(true)
  })

  it('rejects older_than cleanup with a non-positive or unparseable days instead of wiping logs', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    const now = Date.now()
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-old', visited_at: now - 400 * 86_400_000 })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-new', visited_at: now - 60_000 })
    const app = makeApp()

    for (const days of ['0', '-5', 'abc']) {
      const res = await request(app, `/api/share/visits?type=older_than&days=${days}`, { method: 'DELETE' })
      expect(res.status).toBe(400)
      expect((await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).length).toBe(2)
    }

    const ok = await request(app, '/api/share/visits?type=older_than&days=30', { method: 'DELETE' })
    expect(ok.status).toBe(200)
    expect((await ok.json()).deleted).toBe(1)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).length).toBe(1)
  })

  it('leaves bots/all cleanup untouched by the days validation', async () => {
    const db = await makeDb()
    await seedUser(db, USER, await hashPassword('wipe-days-1'))
    const n1 = await seedNote(db, {})
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-bot', is_bot: true })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-real' })
    const app = makeApp()

    const bots = await request(app, '/api/share/visits?type=bots', { method: 'DELETE' })
    expect(bots.status).toBe(200)
    expect((await bots.json()).deleted).toBe(1)

    const all = await deleteJson(app, '/api/share/visits?type=all&days=0', { password: 'wipe-days-1' })
    expect(all.status).toBe(200)
    expect((await all.json()).deleted).toBe(1)
  })
})

describe('share list and batch beyond the D1 bind budget (real D1)', () => {
  async function seedScaleShares(count: number): Promise<{ db: D1Shim; app: ReturnType<typeof makeApp>; ids: string[] }> {
    const db = await makeDb()
    const ids: string[] = []
    for (let i = 0; i < count; i++) ids.push(await seedNote(db, { title: `Scale ${i}` }))
    for (const id of ids) await seedShare(db, { note_id: id })
    return { db, app: makeApp(), ids }
  }

  it('lists 120 shares with per-note visit stats instead of failing on too many SQL variables', async () => {
    const { db, app, ids } = await seedScaleShares(120)
    const slugFirst = (await firstRow(db, 'SELECT slug FROM shares WHERE note_id = ?1', ids[0]))?.slug as string
    const slugSecond = (await firstRow(db, 'SELECT slug FROM shares WHERE note_id = ?1', ids[1]))?.slug as string
    await seedVisit(db, { note_id: ids[0], slug: slugFirst, visitor_fp: 'fa' })
    await seedVisit(db, { note_id: ids[0], slug: slugFirst, visitor_fp: 'fa' })
    await seedVisit(db, { note_id: ids[1], slug: slugSecond, visitor_fp: 'fb', is_bot: true })

    const res = await request(app, '/api/share')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shares.length).toBe(120)
    const seen = body.shares.find((s: { noteId: string }) => s.noteId === ids[0])
    expect(seen.views).toBe(2)
    expect(seen.uniqueVisitors).toBe(1)
    const botOnly = body.shares.find((s: { noteId: string }) => s.noteId === ids[1])
    expect(botOnly.views).toBe(0)
    expect(botOnly.uniqueVisitors).toBe(0)
  })

  it('runs disable, revoke, expire and move batches over 120 notes', async () => {
    const { db, app, ids } = await seedScaleShares(120)

    const disable = await postJson(app, '/api/share/batch', { action: 'disable', noteIds: ids })
    expect(disable.status).toBe(200)
    expect(((await disable.json()).count)).toBe(120)
    expect((await firstRow(db, 'SELECT COUNT(*) as c FROM shares WHERE user_id = ?1 AND is_enabled = 0', USER))!.c).toBe(120)

    const expire = await postJson(app, '/api/share/batch', { action: 'expire', noteIds: ids, expiresIn: 3_600_000 })
    expect(expire.status).toBe(200)
    expect((await firstRow(db, 'SELECT COUNT(*) as c FROM shares WHERE user_id = ?1 AND expires_at IS NOT NULL', USER))!.c).toBe(120)

    const move = await postJson(app, '/api/share/batch', { action: 'move', noteIds: ids, folderId: null })
    expect(move.status).toBe(200)

    const revoke = await postJson(app, '/api/share/batch', { action: 'revoke', noteIds: ids })
    expect(revoke.status).toBe(200)
    expect((await firstRow(db, 'SELECT COUNT(*) as c FROM shares WHERE user_id = ?1', USER))!.c).toBe(0)
  })

  it('toggles a whole folder of 120 notes without exceeding the bind budget', async () => {
    const db = await makeDb()
    await runSql(
      db,
      `INSERT INTO share_folders (id, user_id, parent_id, name, position, created_at, updated_at)
       VALUES ('f-1', ?1, NULL, 'Big folder', 0, ?2, ?2)`,
      USER, H.now,
    )
    const ids: string[] = []
    for (let i = 0; i < 120; i++) ids.push(await seedNote(db, { folder_id: 'f-1' }))
    for (const id of ids) await seedShare(db, { note_id: id, is_enabled: 0 })
    const app = makeApp()

    const enable = await postJson(app, '/api/share/batch-folder', { folderId: 'f-1', enabled: true })
    expect(enable.status).toBe(200)
    expect((await firstRow(db, 'SELECT COUNT(*) as c FROM shares WHERE user_id = ?1 AND is_enabled = 1', USER))!.c).toBe(120)

    const disable = await postJson(app, '/api/share/batch-folder', { folderId: 'f-1', enabled: false })
    expect(disable.status).toBe(200)
    expect((await firstRow(db, 'SELECT COUNT(*) as c FROM shares WHERE user_id = ?1 AND is_enabled = 0', USER))!.c).toBe(120)
  })
})

describe('share analytics routes (real D1)', () => {
  it('computes global analytics from visits and excludes bots by default', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Top note' })
    await seedShare(db, { note_id: n1, slug: 'a-1' })
    await seedVisit(db, { note_id: n1, slug: 'a-1', country: 'us', visitor_fp: 'f1' })
    await seedVisit(db, { note_id: n1, slug: 'a-1', country: 'us', visitor_fp: 'f1', is_bot: true })
    const app = makeApp()

    const body = await (await request(app, '/api/share/analytics/global?range=30d')).json()
    expect(body.totalViews).toBe(1)
    expect(body.totalVisitors).toBe(1)
    expect(body.topCountries[0].name).toBe('US')
    expect(body.topNotes[0].noteTitle).toBe('Top note')
    expect(body.timeline.length).toBe(30)
    expect(body.filterStats.bots).toBe(1)
  })

  it('sanitizes an unknown range to the 30d window instead of answering with full history', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'r-1' })
    await seedVisit(db, { note_id: n1, slug: 'r-1', visited_at: Date.now() - 400 * 86_400_000, visitor_fp: 'fp-ancient' })
    await seedVisit(db, { note_id: n1, slug: 'r-1', visited_at: Date.now() - 60_000, visitor_fp: 'fp-recent' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/analytics/global?range=zzz')).json()
    expect(body.range).toBe('30d')
    expect(body.totalViews).toBe(1)
    expect(body.timeline.length).toBe(30)
  })

  it('buckets range=all from the earliest visit instead of 1970', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'al-1' })
    const oldTs = Date.now() - 800 * 86_400_000
    await seedVisit(db, { note_id: n1, slug: 'al-1', visited_at: oldTs, visitor_fp: 'fp-a' })
    await seedVisit(db, { note_id: n1, slug: 'al-1', visited_at: Date.now() - 400 * 86_400_000, visitor_fp: 'fp-b' })
    await seedVisit(db, { note_id: n1, slug: 'al-1', visited_at: Date.now() - 60_000, visitor_fp: 'fp-c' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/analytics/global?range=all')).json()
    expect(body.totalViews).toBe(3)
    expect(body.timeline.length).toBe(12)
    expect(body.timeline[0].timestamp).toBe(oldTs)
    expect(body.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(3)
  })

  it('keeps an empty range=all window recent rather than starting at epoch', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'mt-1' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/analytics/global?range=all')).json()
    expect(body.timeline.length).toBe(12)
    expect(body.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(0)
    expect(body.timeline[0].timestamp).toBeGreaterThan(0)
  })

  it('computes per-note analytics scoped to the note', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Only this' })
    const n2 = await seedNote(db, { title: 'Other' })
    await seedShare(db, { note_id: n1, slug: 'p-1' })
    await seedShare(db, { note_id: n2, slug: 'p-2' })
    await seedVisit(db, { note_id: n1, slug: 'p-1' })
    await seedVisit(db, { note_id: n2, slug: 'p-2' })
    const app = makeApp()

    const body = await (await request(app, `/api/share/analytics/note/${n1}?range=30d`)).json()
    expect(body.noteTitle).toBe('Only this')
    expect(body.totalViews).toBe(1)
    expect(body.url).toContain('/s/p-1')
  })
})

describe('share public note route (real D1)', () => {
  it('serves an enabled share without a password as a PublicNote', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'Public title' })
    await seedShare(db, { note_id: n1, slug: 'pub-1' })
    const app = makeApp()

    const res = await postJson(app, '/api/public/pub-1', {})
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Public title')
    expect(body.share.slug).toBe('pub-1')
    expect(body.author.name).toBe('Author')
  })

  it('answers an identical 404 body for disabled, expired and unknown links (SH-07)', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'off-1', is_enabled: 0 })
    await seedShare(db, { note_id: n2, slug: 'old-1', expires_at: Date.now() - 1000 })
    const app = makeApp()

    const disabled = await (await postJson(app, '/api/public/off-1', {})).json()
    const expired = await (await postJson(app, '/api/public/old-1', {})).json()
    const missing = await (await postJson(app, '/api/public/nope-nope', {})).json()
    expect(disabled).toEqual(missing)
    expect(expired).toEqual(missing)
  })

  it('dedupes views per client IP, not per user-agent (SH-03)', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'view-counted', is_enabled: 1 })
    const app = makeApp()
    DB_ENV.env.VISIT_FP_SECRET = 'dedupe-test-secret'

    // visit recording runs via waitUntil; the test context must let us await it
    const pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) } as unknown as ExecutionContext
    const access = async (ua: string): Promise<Response> => {
      pending.length = 0
      const res = await app.request('/api/public/view-counted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': ua },
        body: JSON.stringify({}),
      }, DB_ENV.env as AppBindings['Bindings'], ctx)
      await Promise.all(pending)
      return res
    }

    await access('Mozilla/5.0 ShareTest/1.0')
    await access('Mozilla/5.0 ShareTest/1.0')
    let row = await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', 'view-counted')
    expect(row?.views).toBe(1)

    await access('Mozilla/5.0 ShareOther/1.0')
    row = await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', 'view-counted')
    expect(row?.views).toBe(1)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'view-counted')).length).toBe(1)
  })

  it('never writes a visit row for bot user-agents', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'bot-quiet', is_enabled: 1 })
    const app = makeApp()

    const pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) } as unknown as ExecutionContext
    const res = await app.request('/api/public/bot-quiet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      body: JSON.stringify({}),
    }, DB_ENV.env as AppBindings['Bindings'], ctx)
    await Promise.all(pending)

    expect(res.status).toBe(200)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'bot-quiet')).length).toBe(0)
    const row = await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', 'bot-quiet')
    expect(row?.views).toBe(0)
  })

  it('answers 429 once the slug+IP read budget is exhausted (SH-03)', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'budgeted', is_enabled: 1 })
    const app = makeApp()

    let status = 0
    for (let attempt = 0; attempt < 40; attempt += 1) {
      status = (await postJson(app, '/api/public/budgeted', {})).status
      if (status === 429) break
    }
    expect(status).toBe(429)
  })

  it('requires the correct password for a password-protected share', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'pw-1', password_hash: shaOf('secret') })
    const app = makeApp()

    const missingBody = await (await postJson(app, '/api/public/pw-1', {})).json()
    expect(missingBody.error.code).toBe('password_required')

    const wrongBody = await (await postJson(app, '/api/public/pw-1', { password: 'nope' })).json()
    expect(wrongBody).toEqual(missingBody)
  })

  it('enforces the 8-character minimum on new passwords but keeps legacy 4-character ones verifiable', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'Short' })
    await seedShare(db, { note_id: n1, slug: 'legacy-short', password_hash: await hashPassword('abcd') })
    const n2 = await seedNote(db, { title: 'New' })
    const app = makeApp()

    const tooShort = await postJson(app, `/api/share/${n2}`, { password: 'abcdef' })
    expect(tooShort.status).toBe(400)
    expect((await tooShort.json()).error.message).toContain('at least 8')

    const accepted = await postJson(app, `/api/share/${n2}`, { password: 'abcdefgh' })
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).share.hasPassword).toBe(true)

    const legacy = await postJson(app, '/api/public/legacy-short', { password: 'abcd' })
    expect(legacy.status).toBe(200)
  })
})

describe('share passcode brute-force window (SH-09)', () => {
  it('rejects an overlong passcode guess with 400 instead of truncating it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'pw9-1', password_hash: await hashPassword('right-passcode') })
    const app = makeApp()

    const res = await postJson(app, '/api/public/pw9-1', { password: 'x'.repeat(129) })
    expect(res.status).toBe(400)
  })

  // Eleven scrypt verifications need more than the 5s default budget on slow runners.
  it('locks the passcode gate on the tenth wrong guess even from fresh IPs', { timeout: 30_000 }, async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'pw9-2', password_hash: await hashPassword('right-passcode') })
    const app = makeApp()

    for (let attempt = 1; attempt <= 11; attempt++) {
      const res = await postJsonWithIp(app, '/api/public/pw9-2', { password: 'nope' }, `203.0.113.${attempt}`)
      expect(res.status, `attempt ${attempt}`).toBe(attempt <= 10 ? 401 : 429)
    }
  })
})

// requestClientIp only trusts CF-Connecting-IP when the edge set `cf`, so the probe attaches it.
async function postJsonWithIp(
  app: Hono<AppBindings>,
  path: string,
  body: unknown,
  clientIp: string,
): Promise<Response> {
  const request = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientIp },
    body: JSON.stringify(body),
  })
  Object.defineProperty(request, 'cf', { value: { clientIp } })
  return app.request(request, undefined, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function publicVisitAccess(app: Hono<AppBindings>, slug: string, referrer: string): Promise<Response> {
  const pending: Promise<unknown>[] = []
  const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) } as unknown as ExecutionContext
  const res = await app.request(`/api/public/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 RefProbe/1.0' },
    body: JSON.stringify({ referrer }),
  }, DB_ENV.env as AppBindings['Bindings'], ctx)
  await Promise.all(pending)
  return res
}

describe('share public referrer hygiene (SH-08)', () => {
  it('drops non-browser scheme referrers instead of storing them raw', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'ref-js' })

    const res = await publicVisitAccess(makeApp(), 'ref-js', 'javascript:alert(document.domain)')

    expect(res.status).toBe(200)
    const row = await firstRow(db, 'SELECT referrer FROM share_visits WHERE slug = ?1', 'ref-js')
    expect(row?.referrer).toBeNull()
  })

  it('stores only origin and path of an http referrer, never the query', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'ref-https' })

    const res = await publicVisitAccess(makeApp(), 'ref-https', 'https://news.example.com/article/42?token=secret#frag')

    expect(res.status).toBe(200)
    const row = await firstRow(db, 'SELECT referrer FROM share_visits WHERE slug = ?1', 'ref-https')
    expect(row?.referrer).toBe('https://news.example.com/article/42')
  })

  it('rejects an oversized referrer in the access body with 400', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'ref-long' })
    const app = makeApp()

    const res = await postJson(app, '/api/public/ref-long', { referrer: 'https://a.example/?' + 'x'.repeat(600) })

    expect(res.status).toBe(400)
  })
})

async function visitAccess(app: Hono<AppBindings>, slug: string, ua: string): Promise<Response> {
  const pending: Promise<unknown>[] = []
  const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) } as unknown as ExecutionContext
  const res = await app.request(`/api/public/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': ua },
    body: JSON.stringify({}),
  }, DB_ENV.env as AppBindings['Bindings'], ctx)
  await Promise.all(pending)
  return res
}

describe('share visitor fingerprint secret (SH-04)', () => {
  it('mints the fingerprint from the instance secret, not the public date salt', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'fp-secret', is_enabled: 1 })
    DB_ENV.env.VISIT_FP_SECRET = 'instance-test-secret'
    const app = makeApp()

    await visitAccess(app, 'fp-secret', 'Mozilla/5.0 FpOne/1.0')
    await visitAccess(app, 'fp-secret', 'Mozilla/5.0 FpTwo/1.0')

    const row = await firstRow(db, 'SELECT visitor_fp FROM share_visits WHERE slug = ?1', 'fp-secret')
    const fp = row?.visitor_fp as string | null
    expect(fp).toBeTruthy()
    const now = new Date()
    expect(fp).not.toBe(await computeVisitorFingerprint('local', '', null, now))
    expect(fp).not.toBe(await computeVisitorFingerprint('local', '', null, new Date(now.getTime() - 86_400_000)))
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'fp-secret')).length).toBe(1)
    const views = await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', 'fp-secret')
    expect(views?.views).toBe(1)
  })

  it('separates the fingerprint per share owner so one visitor is not linkable across accounts', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedUser(db, 'user-2')
    const n1 = await seedNote(db, { user_id: USER })
    const n2 = await seedNote(db, { user_id: 'user-2' })
    await seedShare(db, { note_id: n1, slug: 'fp-a', is_enabled: 1, user_id: USER })
    await seedShare(db, { note_id: n2, slug: 'fp-b', is_enabled: 1, user_id: 'user-2' })
    DB_ENV.env.VISIT_FP_SECRET = 'instance-test-secret'
    const app = makeApp()

    expect((await visitAccess(app, 'fp-a', 'Mozilla/5.0 FpLink/1.0')).status).toBe(200)
    expect((await visitAccess(app, 'fp-b', 'Mozilla/5.0 FpLink/1.0')).status).toBe(200)

    const a = await firstRow(db, 'SELECT visitor_fp FROM share_visits WHERE slug = ?1', 'fp-a')
    const b = await firstRow(db, 'SELECT visitor_fp FROM share_visits WHERE slug = ?1', 'fp-b')
    expect(a?.visitor_fp).toBeTruthy()
    expect(b?.visitor_fp).toBeTruthy()
    expect(a?.visitor_fp).not.toBe(b?.visitor_fp)
  })

  it('records no fingerprint when the instance secret is missing', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'fp-missing', is_enabled: 1 })
    const app = makeApp()

    expect((await visitAccess(app, 'fp-missing', 'Mozilla/5.0 FpNone/1.0')).status).toBe(200)

    const row = await firstRow(db, 'SELECT visitor_fp FROM share_visits WHERE slug = ?1', 'fp-missing')
    expect(row?.visitor_fp).toBeNull()
  })
})

describe('share visit log lifecycle (SH-05)', () => {
  async function seedVisitRow(db: D1Shim, slug: string, noteId: string): Promise<void> {
    await seedVisit(db, { slug, note_id: noteId, visitor_fp: `fp-${slug}` })
  }

  it('deleting a share through the manage route removes its visit rows', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { slug: 'gone-1', note_id: n1 })
    await seedVisitRow(db, 'gone-1', n1)
    const app = makeApp()

    const res = await request(app, `/api/share/${n1}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'gone-1')).length).toBe(0)
  })

  it('batch revoke removes visit rows for the revoked notes', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { slug: 'gone-2', note_id: n1 })
    await seedVisitRow(db, 'gone-2', n1)
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch', { action: 'revoke', noteIds: [n1] })
    expect(res.status).toBe(200)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'gone-2')).length).toBe(0)
  })

  it('the maintenance cron sweeps visit rows whose share no longer exists', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { slug: 'alive-1', note_id: n1 })
    await seedVisitRow(db, 'alive-1', n1)
    await seedVisitRow(db, 'ghost-1', n1)

    await purgeExpiredOperationalData(db as unknown as D1Database)

    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'ghost-1')).length).toBe(0)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE slug = ?1', 'alive-1')).length).toBe(1)
  })

  it('global stats ignore visit rows without a live share', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { slug: 'stats-1', note_id: n1 })
    await seedVisitRow(db, 'stats-1', n1)
    await seedVisitRow(db, 'stats-orphan', n1)
    const app = makeApp()

    const body = await (await request(app, '/api/share')).json()
    expect(body.globalStats.totalViews).toBe(1)
    expect(body.globalStats.totalVisitors).toBe(1)
  })

  it('the visit log list hides rows whose share was revoked', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { slug: 'list-1', note_id: n1 })
    await seedVisitRow(db, 'list-1', n1)
    await seedVisitRow(db, 'list-orphan', n1)
    const app = makeApp()

    const body = await (await request(app, '/api/share/visits')).json()
    expect(body.total).toBe(1)
    expect(body.visits.every((v: { slug: string }) => v.slug === 'list-1')).toBe(true)
  })
})

describe('share slug anti-enumeration (SH-07)', () => {
  it('requires at least six characters for a new custom slug', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    const app = makeApp()

    const short = await postJson(app, `/api/share/${n1}`, { customSlug: 'abcde' })
    expect(short.status).toBe(400)

    const ok = await postJson(app, `/api/share/${n1}`, { customSlug: 'abcdef' })
    expect(ok.status).toBe(200)
    expect((await ok.json()).share.slug).toBe('abcdef')
  })

  it('check-slug hides the unavailability reason and throttles probing', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'taken-one' })
    const app = makeApp()

    const reserved = await (await request(app, '/api/share/check-slug?slug=api')).json()
    expect(reserved.available).toBe(false)
    expect(reserved.reason).toBeUndefined()

    const taken = await (await request(app, '/api/share/check-slug?slug=taken-one')).json()
    expect(taken.available).toBe(false)
    expect(taken.reason).toBeUndefined()

    let status = 200
    for (let probe = 0; probe < 40; probe += 1) {
      status = (await request(app, `/api/share/check-slug?slug=probe-${probe}`)).status
      if (status === 429) break
    }
    expect(status).toBe(429)
  })
})

describe('share batch affected-row counts (SH-10)', () => {
  it('reports the number of shares touched, not the request size', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedUser(db, 'user-2')
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'b10-own' })
    const n2 = await seedNote(db, { user_id: 'user-2' })
    await seedShare(db, { note_id: n2, slug: 'b10-other', user_id: 'user-2' })
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch', { action: 'disable', noteIds: [n1, n2, 'ghost-note'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, count: 1 })
    expect((await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 'b10-other'))!.is_enabled).toBe(1)
  })

  it('batch enable upserts own notes and skips foreign ones without a 500', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedUser(db, 'user-2')
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'b10-off', is_enabled: 0 })
    const n3 = await seedNote(db, {})
    const n2 = await seedNote(db, { user_id: 'user-2' })
    await seedShare(db, { note_id: n2, slug: 'b10-other', user_id: 'user-2', is_enabled: 0 })
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch', { action: 'enable', noteIds: [n1, n3, n2, 'ghost-note'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, count: 2 })
    expect((await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 'b10-off'))!.is_enabled).toBe(1)
    expect((await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 'b10-other'))!.is_enabled).toBe(0)
    const fresh = await firstRow(db, 'SELECT note_id, is_enabled FROM shares WHERE note_id = ?1 AND user_id = ?2', n3, USER)
    expect(fresh!.is_enabled).toBe(1)
  })

  it('batch-folder disable counts shares, not notes in the folder', async () => {
    const db = await makeDb()
    await seedUser(db)
    await runSql(db, `INSERT INTO folders (id, user_id, name, created_at, updated_at) VALUES ('f-1', ?1, 'Work', ?2, ?2)`, USER, H.now)
    const n1 = await seedNote(db, { folder_id: 'f-1' })
    await seedShare(db, { note_id: n1, slug: 'b10-folder' })
    await seedNote(db, { folder_id: 'f-1' })
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch-folder', { folderId: 'f-1', enabled: false })
    expect(await res.json()).toEqual({ ok: true, count: 1 })
  })
})

describe('share LIKE wildcard escaping (SH-11)', () => {
  it('treats _ in the share list search as a literal underscore', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'a_b report' })
    await seedShare(db, { note_id: n1, slug: 'like-1' })
    const n2 = await seedNote(db, { title: 'axb report' })
    await seedShare(db, { note_id: n2, slug: 'like-2' })
    const app = makeApp()

    const body = await (await request(app, '/api/share?search=a_b')).json()
    expect(body.shares.map((s: { slug: string }) => s.slug)).toEqual(['like-1'])
  })

  it('treats _ in the visit-log search as a literal underscore', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'First' })
    await seedShare(db, { note_id: n1, slug: 'a_b' })
    await seedVisit(db, { note_id: n1, slug: 'a_b', visitor_fp: 'f1' })
    const n2 = await seedNote(db, { title: 'Second' })
    await seedShare(db, { note_id: n2, slug: 'axb' })
    await seedVisit(db, { note_id: n2, slug: 'axb', visitor_fp: 'f2' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/visits?search=a_b')).json()
    expect(body.visits.map((v: { slug: string }) => v.slug)).toEqual(['a_b'])
  })

  it('treats _ in a tag name as a literal when toggling shares', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'wild-1', tags: '["a_b"]' })
    const n2 = await seedNote(db, {})
    await seedShare(db, { note_id: n2, slug: 'wild-2', tags: '["axb"]' })
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch-toggle-group', { type: 'tag', target: 'a_b', enabled: false })
    expect(res.status).toBe(200)
    expect((await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 'wild-1'))!.is_enabled).toBe(0)
    expect((await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 'wild-2'))!.is_enabled).toBe(1)
  })
})

describe('share visit wipe requires the current password (SH-12)', () => {
  it('refuses to wipe all logs without the password and keeps every row', async () => {
    const db = await makeDb()
    await seedUser(db, USER, await hashPassword('wipe-12345678'))
    const n1 = await seedNote(db, {})
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-1' })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-2', is_bot: true })
    const app = makeApp()

    const noBody = await deleteJson(app, '/api/share/visits?type=all')
    expect(noBody.status).toBe(401)
    expect((await noBody.json()).error.code).toBe('wrong_password')
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).length).toBe(2)

    const wrong = await deleteJson(app, '/api/share/visits?type=all', { password: 'not-it-12345678' })
    expect(wrong.status).toBe(401)
    expect((await wrong.json()).error.code).toBe('wrong_password')
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).length).toBe(2)
  })

  it('wipes every log once the current password is re-entered', async () => {
    const db = await makeDb()
    await seedUser(db, USER, await hashPassword('wipe-12345678'))
    const n1 = await seedNote(db, {})
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-1' })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-2', is_bot: true })
    const app = makeApp()

    const ok = await deleteJson(app, '/api/share/visits?type=all', { password: 'wipe-12345678' })
    expect(ok.status).toBe(200)
    expect((await ok.json()).deleted).toBe(2)
    expect((await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).length).toBe(0)
  })

  it('keeps targeted cleanup (bots/older_than) free of the password requirement', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-old-real', visited_at: Date.now() - 400 * 86_400_000 })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-bot', is_bot: true })
    const app = makeApp()

    const bots = await deleteJson(app, '/api/share/visits?type=bots')
    expect(bots.status).toBe(200)
    expect((await bots.json()).deleted).toBe(1)

    const older = await deleteJson(app, '/api/share/visits?type=older_than&days=30')
    expect(older.status).toBe(200)
    expect((await older.json()).deleted).toBe(1)
  })
})
