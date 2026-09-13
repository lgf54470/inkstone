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
import { shareManageRoutes, shareRoutes } from '../src/worker/routes/share'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedUser(db: D1Shim, id = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    id, `user-${id}`, H.now,
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
    id, USER, fields.folder_id ?? null, fields.title ?? 'Note', content,
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

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
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
    await seedShare(db, { note_id: n1, slug: 'taken' })
    const app = makeApp()

    const res = await postJson(app, `/api/share/${n2}`, { customSlug: 'taken' })
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

  it('returns 403 for a disabled share and 404 for an expired one', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'off-1', is_enabled: 0 })
    await seedShare(db, { note_id: n2, slug: 'old-1', expires_at: H.now - 1000 })
    const app = makeApp()

    expect((await postJson(app, '/api/public/off-1', {})).status).toBe(403)
    expect((await postJson(app, '/api/public/old-1', {})).status).toBe(404)
  })

  it('requires the correct password for a password-protected share', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'pw-1', password_hash: shaOf('secret') })
    const app = makeApp()

    const missing = await postJson(app, '/api/public/pw-1', {})
    expect(missing.status).toBe(401)
    expect((await missing.json()).error.code).toBe('password_required')

    const wrong = await postJson(app, '/api/public/pw-1', { password: 'nope' })
    expect(wrong.status).toBe(401)
    expect((await wrong.json()).error.code).toBe('password_invalid')
  })

  it('enforces the 6-character minimum on new passwords but keeps legacy 4-character ones verifiable', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { title: 'Short' })
    await seedShare(db, { note_id: n1, slug: 'legacy-short', password_hash: await hashPassword('abcd') })
    const n2 = await seedNote(db, { title: 'New' })
    const app = makeApp()

    const tooShort = await postJson(app, `/api/share/${n2}`, { password: 'abcde' })
    expect(tooShort.status).toBe(400)
    expect((await tooShort.json()).error.message).toContain('at least 6')

    const accepted = await postJson(app, `/api/share/${n2}`, { password: 'abcdef' })
    expect(accepted.status).toBe(200)
    expect((await accepted.json()).share.hasPassword).toBe(true)

    const legacy = await postJson(app, '/api/public/legacy-short', { password: 'abcd' })
    expect(legacy.status).toBe(200)
  })
})
