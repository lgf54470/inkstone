/**
 * The audience-side position channel (N-34 / ADR-0006).
 *
 * The cases are the ADR's verification list, in order: the row holds a hash and not a token; a viewer
 * with the token sees the position and nothing else; every way of not being entitled answers the same
 * way as a link that never existed; a write is readable on the next beat; a heartbeat is not a view;
 * and the lease never outlives the share it rides on.
 */
import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { SHARE_PRESENCE_TTL_MS } from '../src/shared/share-presence'
import { hashPassword } from '../src/worker/lib/password'
import { shareAccessCookieName } from '../src/worker/lib/share-asset-session'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { shareManageRoutes, shareRoutes } from '../src/worker/routes/share'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { SCHEMA_MIGRATIONS } from '../src/worker/db/schema/migrations'
import { createD1Database, queryFirst, runSql, type D1Shim } from './d1-harness'

const H = vi.hoisted(() => ({ counter: 0 }))
const USER = 'user-1'
const OTHER = 'user-2'
const PASSCODE = 'board minutes 2026'
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

function env(db: D1Database): AppBindings['Bindings'] {
  return { DB: db } as unknown as AppBindings['Bindings']
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  const asOwner: AppBindings['Variables'] = { userId: USER, database: { ftsEnabled: false } }
  app.use('*', async (c, next) => {
    c.set('userId', asOwner.userId)
    c.set('database', asOwner.database)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/share', shareManageRoutes)
  app.route('/api/public', shareRoutes)
  return app
}

async function freshDb(): Promise<D1Shim> {
  const db = createD1Database()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

async function seedUser(db: D1Shim, id: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?1, 'x', 'login', 'Author', '', ?2, ?2)`,
    id, Date.now(),
  )
}

async function seedNote(db: D1Shim, userId: string, title: string): Promise<string> {
  const id = `note-${++H.counter}`
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, '', '# One', '', 1, 1, 5, 0, 0, 0, 0, 'hash', ?4, ?4)`,
    id, userId, title, Date.now(),
  )
  return id
}

async function seedShare(db: D1Shim, fields: { note_id: string, slug: string, user_id?: string, is_enabled?: number, expires_at?: number | null, password_hash?: string | null }): Promise<void> {
  await runSql(
    db,
    `INSERT INTO shares (slug, note_id, user_id, folder_id, tags, password_hash, expires_at, views, is_enabled, created_at, last_viewed_at)
     VALUES (?2, ?1, ?3, NULL, '[]', ?7, ?4, 0, ?5, ?6, NULL)`,
    fields.note_id, fields.slug, fields.user_id ?? USER, fields.expires_at ?? null, fields.is_enabled ?? 1, Date.now(), fields.password_hash ?? null,
  )
}

/** The shape every scenario starts from: one live share of one titled note. */
async function presentedShare(db: D1Shim, slug = 'live-1'): Promise<string> {
  const noteId = await seedNote(db, USER, 'Quarterly Review')
  await seedShare(db, { note_id: noteId, slug })
  return noteId
}

function post(app: Hono<AppBindings>, db: D1Shim, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, env(db as unknown as D1Database), ctx)
}

async function startShow(app: Hono<AppBindings>, db: D1Shim, noteId: string): Promise<{ token: string, slug: string, expiresAt: number }> {
  const response = await post(app, db, `/api/share/${noteId}/present/start`, {})
  expect(response.status).toBe(200)
  return await response.json() as Promise<{ token: string, slug: string, expiresAt: number }>
}

describe('share presence — starting a show', () => {
  it('hands back a token once and stores only its hash', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const started = await startShow(app, db, noteId)

    expect(started.token).toMatch(/^[0-9a-f]{64}$/)
    expect(started.slug).toBe('live-1')
    const row = await queryFirst(db, `SELECT token_hash, slide, page, step, expires_at - updated_at AS lease FROM share_presence WHERE slug = 'live-1'`)
    expect(row, 'a show is one row').toBeTruthy()
    expect(row!.token_hash).not.toContain(started.token)
    expect(row!.token_hash).toHaveLength(64)
    expect([row!.slide, row!.page, row!.step]).toEqual([0, 0, 0])
    expect(row!.lease).toBe(SHARE_PRESENCE_TTL_MS)
  })

  it('refuses a note the account has no live share of', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const foreign = await seedNote(db, OTHER, 'Not yours')
    await presentedShare(db, 'yours-1')
    const app = makeApp()

    const response = await post(app, db, `/api/share/${foreign}/present/start`, {})
    expect(response.status).toBe(404)
    const rows = await queryFirst(db, `SELECT COUNT(*) AS n FROM share_presence`)
    expect(rows!.n).toBe(0)
  })

  it('caps the lease at the share’s own expiry', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const soon = Date.now() + 60_000
    const noteId = await seedNote(db, USER, 'Quick one')
    await seedShare(db, { note_id: noteId, slug: 'short-1', expires_at: soon })
    const app = makeApp()

    const started = await startShow(app, db, noteId)
    expect(started.expiresAt).toBe(soon)
  })

  it('replaces the previous token, so an old link stops working', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const first = await startShow(app, db, noteId)
    const second = await startShow(app, db, noteId)

    const stale = await post(app, db, '/api/public/live-1/present', { token: first.token })
    expect(stale.status).toBe(404)
    const fresh = await post(app, db, '/api/public/live-1/present', { token: second.token })
    expect(fresh.status).toBe(200)
  })
})

describe('share presence — a viewer reads the position', () => {
  it('answers the position and the title, and says the answer is not cacheable', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    await post(app, db, `/api/share/${noteId}/present`, { slide: 3, page: 1, step: 2 })

    const response = await post(app, db, '/api/public/live-1/present', { token })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('set-cookie'), 'a heartbeat mints no session').toBeNull()
    expect(await response.json()).toMatchObject({ slide: 3, page: 1, step: 2, title: 'Quarterly Review' })
  })

  it('writes no visitor row: following a talk is not another way of viewing a page', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    const before = await queryFirst(db, `SELECT COUNT(*) AS n FROM share_visits`)

    for (let beat = 0; beat < 5; beat++) expect((await post(app, db, '/api/public/live-1/present', { token })).status).toBe(200)
    const after = await queryFirst(db, `SELECT COUNT(*) AS n FROM share_visits`)
    expect(after!.n).toBe(before!.n)
  })

  it('is readable immediately after the write that moved it', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)

    await post(app, db, `/api/share/${noteId}/present`, { slide: 1, page: 0, step: 0 })
    expect(await readPosition(app, db, token)).toEqual([1, 0, 0])
    await post(app, db, `/api/share/${noteId}/present`, { slide: 1, page: 2, step: 3 })
    expect(await readPosition(app, db, token)).toEqual([1, 2, 3])
  })

  it('answers one identical way for every kind of not being entitled', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    const revokable = await seedNote(db, USER, 'Revoked soon')
    await seedShare(db, { note_id: revokable, slug: 'gone-1' })
    await startShow(app, db, revokable)
    await runSql(db, `UPDATE shares SET is_enabled = 0 WHERE slug = 'gone-1'`)

    const answers = [
      await post(app, db, '/api/public/no-such-slug/present', { token }),
      await post(app, db, '/api/public/live-1/present', { token: 'f'.repeat(64) }),
      await post(app, db, '/api/public/live-1/present', {}),
      await post(app, db, '/api/public/gone-1/present', { token }),
    ]
    const bodies = []
    for (const response of answers) {
      expect(response.status).toBe(404)
      bodies.push(await response.clone().json())
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size, 'the existence of a show is not the caller’s to learn').toBe(1)
  })

  it('takes the row with a share that was revoked while its lease still ran', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    await runSql(db, `UPDATE shares SET is_enabled = 0`)

    expect((await post(app, db, '/api/public/live-1/present', { token })).status).toBe(404)
    expect(await queryFirst(db, `SELECT COUNT(*) AS n FROM share_presence`)).toMatchObject({ n: 0 })
  })
})

describe('share presence — the heartbeat stays cheap', () => {
  it('answers 304 with no row when nothing moved since the last beat', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    await post(app, db, `/api/share/${noteId}/present`, { slide: 2, page: 0, step: 1 })

    const first = await post(app, db, '/api/public/live-1/present', { token })
    const etag = first.headers.get('etag') ?? ''
    expect(first.status).toBe(200)
    expect(etag).toMatch(/^W\/"\d+-\d+-\d+-\d+"$/)

    const second = await post(app, db, '/api/public/live-1/present', { token }, { 'If-None-Match': etag })
    expect(second.status).toBe(304)
    expect(await second.text(), 'a 304 carries no answer').toBe('')
    expect(second.headers.get('etag')).toBe(etag)
    expect(second.headers.get('cache-control')).toBe('no-store')

    await post(app, db, `/api/share/${noteId}/present`, { slide: 3, page: 0, step: 1 })
    const third = await post(app, db, '/api/public/live-1/present', { token }, { 'If-None-Match': etag })
    expect(third.status, 'a real turn cannot be answered with a 304').toBe(200)
    expect(third.headers.get('etag')).not.toBe(etag)
  })
})

describe('share presence — writing and stopping', () => {
  it('refuses to write a position into a show nobody started', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()

    const response = await post(app, db, `/api/share/${noteId}/present`, { slide: 1, page: 0, step: 0 })
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('not_found')
  })

  it('refuses to move a show whose lease ran out', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)
    await runSql(db, `UPDATE share_presence SET expires_at = ?1 WHERE slug = 'live-1'`, Date.now() - 1)

    expect((await post(app, db, `/api/share/${noteId}/present`, { slide: 5, page: 0, step: 0 })).status).toBe(404)
    expect((await post(app, db, '/api/public/live-1/present', { token })).status, 'a lapsed show is not still on air').toBe(404)
  })

  it('starts a new show at its first page even when a move came before', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const first = await startShow(app, db, noteId)
    await post(app, db, `/api/share/${noteId}/present`, { slide: 7, page: 1, step: 2 })

    const second = await startShow(app, db, noteId)
    expect(await readPosition(app, db, second.token), 'a fresh show does not inherit where the last one stopped').toEqual([0, 0, 0])
    expect((await post(app, db, '/api/public/live-1/present', { token: first.token })).status).toBe(404)
  })

  it('refuses a position that is not a page number', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    await startShow(app, db, noteId)

    for (const body of [{ slide: -1, page: 0, step: 0 }, { slide: 1.5, page: 0, step: 0 }, { slide: 20_000, page: 0, step: 0 }, {}]) {
      expect((await post(app, db, `/api/share/${noteId}/present`, body)).status, JSON.stringify(body)).toBe(400)
    }
  })

  it('stops the show, and stopping twice is still stopped', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)

    expect((await post(app, db, `/api/share/${noteId}/present/stop`, {})).status).toBe(200)
    expect((await post(app, db, '/api/public/live-1/present', { token })).status).toBe(404)
    expect((await post(app, db, `/api/share/${noteId}/present/stop`, {})).status, 'a browser may press stop on unload too').toBe(200)
  })

  it('will not write into another account’s show even with the same slug shape', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    const mine = await presentedShare(db, 'mine-1')
    const app = makeApp()
    const started = await startShow(app, db, mine)
    // The other account owns a note whose share happens to carry the same slug column shape; it must
    // not be able to move this show by naming its own note.
    const theirs = await seedNote(db, OTHER, 'Their note')
    await seedShare(db, { note_id: theirs, slug: 'theirs-1', user_id: OTHER })
    const asOther = new Hono<AppBindings>()
    asOther.use('*', async (c, next) => {
      c.set('userId', OTHER)
      await next()
    })
    asOther.onError((err, c) => errorResponse(c, err))
    asOther.route('/api/share', shareManageRoutes)
    const response = await asOther.request(`/api/share/${mine}/present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slide: 9, page: 0, step: 0 }),
    }, env(db as unknown as D1Database), ctx)
    expect(response.status, 'the other account does not own that note’s share').toBe(404)
    expect(await readPosition(app, db, started.token, 'mine-1'), 'and the show did not move').toEqual([0, 0, 0])
  })
})

describe('share presence — the schema says one show per link', () => {
  // No version number here on purpose: another branch appends a migration, and this file's job is to
  // say the presence table arrives by append (immutability is `check-migration-immutability`'s).
  it('ships the presence table as an appended migration, not only as a declared table', () => {
    const created = SCHEMA_MIGRATIONS.filter((migration) => migration.statements.join(' ').includes('share_presence'))
    expect(created, 'exactly one migration creates the presence table').toHaveLength(1)
    expect(TABLE_STATEMENTS.join(' '), 'and the declared shape carries it for a fresh database').toContain('CREATE TABLE IF NOT EXISTS share_presence')
  })

  it('holds one row per share, so a second writer moves the same show', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await presentedShare(db)
    const app = makeApp()
    await startShow(app, db, noteId)

    const rows = await queryFirst(db, `SELECT COUNT(*) AS n FROM share_presence`)
    expect(rows!.n).toBe(1)
    const duplicate = await runSql(db, `INSERT INTO share_presence (slug, user_id, note_id, token_hash, slide, page, step, updated_at, expires_at) VALUES ('live-1', 'user-1', 'x', 'y', 1, 1, 1, 1, 9e14)`).then(() => 'written').catch(() => 'refused')
    expect(duplicate, 'the slug is the primary key: a share has one show').toBe('refused')
  })
})

describe('share presence — a passcode share keeps its show behind the passcode', () => {
  it('refuses a heartbeat that holds the token but never passed the gate', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await seedNote(db, USER, 'Board Minutes')
    await seedShare(db, { note_id: noteId, slug: 'locked-1', password_hash: await hashPassword(PASSCODE) })
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)

    const refused = await post(app, db, '/api/public/locked-1/present', { token })
    const stranger = await post(app, db, '/api/public/never-was/present', { token })
    const refusedText = await refused.text()
    expect(refused.status, 'a token is not a passcode').toBe(404)
    expect(refusedText, 'and it says the same thing a link that never existed says').toBe(await stranger.text())
  })

  it('answers once the visitor holds the proof the gate handed out, and keeps that proof scoped', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const noteId = await seedNote(db, USER, 'Board Minutes')
    await seedShare(db, { note_id: noteId, slug: 'locked-1', password_hash: await hashPassword(PASSCODE) })
    const app = makeApp()
    const { token } = await startShow(app, db, noteId)

    const gate = await post(app, db, '/api/public/locked-1', { password: PASSCODE })
    expect(gate.status).toBe(200)
    const line = gate.headers.getSetCookie().find((entry) => entry.startsWith(`${shareAccessCookieName('locked-1')}=`))
    expect(line, 'the gate has to leave a proof the heartbeat can carry').toBeTruthy()
    expect(line).toContain('Path=/api/public/')
    expect(line).toContain('HttpOnly')

    const beat = await post(app, db, '/api/public/locked-1/present', { token }, { cookie: line!.split(';')[0] })
    expect(beat.status).toBe(200)
    expect(await beat.json()).toMatchObject({ slide: 0, page: 0, step: 0, title: 'Board Minutes' })
  })

  it('will not take one share of one account as another share’s', async () => {
    const db = await freshDb()
    await seedUser(db, USER)
    const first = await seedNote(db, USER, 'Board Minutes')
    const second = await seedNote(db, USER, 'Private Roadmap')
    await seedShare(db, { note_id: first, slug: 'locked-1', password_hash: await hashPassword(PASSCODE) })
    await seedShare(db, { note_id: second, slug: 'locked-2', password_hash: await hashPassword(PASSCODE) })
    const app = makeApp()
    const show = await startShow(app, db, second)

    const gate = await post(app, db, '/api/public/locked-1', { password: PASSCODE })
    const proof = gate.headers.getSetCookie().find((entry) => entry.includes('locked-1'))?.split(';')[0]
    expect(proof).toBeTruthy()
    const beat = await post(app, db, '/api/public/locked-2/present', { token: show.token }, { cookie: proof! })
    expect(beat.status, 'the proof names the link it was minted for').toBe(404)
  })
})

/** The viewer's question, asked once: where is the show, and did the answer say so. */
async function readPosition(app: Hono<AppBindings>, db: D1Shim, token: string, slug = 'live-1'): Promise<(number | undefined)[]> {
  const response = await post(app, db, `/api/public/${slug}/present`, { token })
  const body = await response.json() as { slide?: number, page?: number, step?: number, error?: { code?: string } }
  if (response.status !== 200) throw new Error(`${slug}: read answered ${response.status} ${JSON.stringify(body)}`)
  return [body.slide, body.page, body.step]
}
