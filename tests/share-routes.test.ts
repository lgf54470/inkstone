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
import { LIMITS } from '../src/shared/constants'
import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED, collectionChannelToken } from '../src/shared/share-channel'
import { shareManageRoutes, shareRoutes } from '../src/worker/routes/share'
import { FILTERED_STATS_TTL_MS } from '../src/worker/routes/share/global-stats'
import { createD1Database as createDb, captureSql, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

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
    `INSERT INTO shares (slug, note_id, user_id, folder_id, tags, password_hash, expires_at, views, is_enabled, created_at, last_viewed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
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
    fields.last_viewed_at ?? null,
  )
}

/** The account's stored settings document, written verbatim so a corrupt one can be seeded too. */
async function setShareSettings(db: D1Shim, settings: unknown): Promise<void> {
  const raw = typeof settings === 'string' ? settings : JSON.stringify(settings)
  // Upsert rather than update: an UPDATE against a missing owner would silently do nothing, and a
  // test that quietly wrote no settings would go green on the default instead of the value stated.
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, settings, created_at, last_seen_at)
     VALUES (?1, ?1, 'x', 'login', 'Author', '', ?2, ?3, ?3)
     ON CONFLICT(id) DO UPDATE SET settings = excluded.settings`,
    USER, raw, H.now,
  )
}

async function seedVisit(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO share_visits (user_id, note_id, slug, visited_at, visitor_fp, country, referrer_host,
       device_type, os, browser, user_agent, is_bot, is_self_referrer, is_owner, channel)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'desktop', 'os', 'browser', ?8, ?9, 0, 0, ?10)`,
    USER, fields.note_id, fields.slug ?? 'share-1',
    fields.visited_at ?? Date.now() - 60_000,
    fields.visitor_fp ?? `fp-${++H.counter}`,
    fields.country ?? 'US',
    fields.referrer_host ?? null,
    fields.user_agent ?? null,
    fields.is_bot ? 1 : 0,
    fields.channel ?? null,
  )
}

/** The stored marker of one visit row, or undefined when the row is not there at all. */
async function visitChannel(db: D1Shim, slug: string): Promise<string | null | undefined> {
  const row = await firstRow(db, 'SELECT channel FROM share_visits WHERE slug = ?1', slug)
  return row ? (row.channel as string | null) : undefined
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

/**
 * One public access with the visit write it deferred awaited, the way `waitUntil` hands it back: a
 * test cannot see what the recording wrote until that task has run.
 */
async function accessAwaitingVisits(app: Hono<AppBindings>, slug: string, userAgent = 'Mozilla/5.0 ShareTest/1.0'): Promise<Response> {
  const pending: Promise<unknown>[] = []
  const ctx = { waitUntil: (task: Promise<unknown>) => { pending.push(task) } } as unknown as ExecutionContext
  const response = await app.request(`/api/public/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({}),
  }, DB_ENV.env as AppBindings['Bindings'], ctx)
  await Promise.all(pending)
  return response
}

/** The visitor rows one public link holds, in write order. */
function visitRows(db: D1Shim, slug: string): Promise<Array<Record<string, unknown>>> {
  return allRows(db, 'SELECT id, visitor_fp FROM share_visits WHERE slug = ?1 ORDER BY id', slug)
}

/** The view counter the same link reports. */
async function viewCount(db: D1Shim, slug: string): Promise<unknown> {
  return (await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', slug))?.views
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

describe('share summary route (real D1)', () => {
  it('returns the share count and note id set for the current user only', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { id: 'n-a', title: 'Active' })
    const n2 = await seedNote(db, { id: 'n-b', title: 'Paused' })
    await seedShare(db, { note_id: n1, slug: 'alpha' })
    await seedShare(db, { note_id: n2, slug: 'beta', is_enabled: 0 })
    await seedUser(db, 'user-2')
    const foreignNote = await seedNote(db, { id: 'n-c', title: 'Foreign', user_id: 'user-2' })
    await seedShare(db, { note_id: foreignNote, slug: 'gamma', user_id: 'user-2' })

    const res = await request(makeApp(), '/api/share/summary')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect([...body.sharedNoteIds].sort()).toEqual(['n-a', 'n-b'])
    expect(body.totalShares).toBe(2)
  })

  it('answers with just the count and ids, without visit aggregation', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1' })
    await seedShare(db, { note_id: 'n-1', slug: 's-1', views: 3 })
    await seedVisit(db, { note_id: 'n-1', slug: 's-1' })

    const body = await (await request(makeApp(), '/api/share/summary')).json()
    expect(body).toEqual({ totalShares: 1, sharedNoteIds: ['n-1'] })
  })
})

interface PreparedLike {
  bind(...values: unknown[]): PreparedLike
  all(): Promise<{ results: unknown[] }>
  first(): Promise<Record<string, unknown> | null>
  run(): Promise<unknown>
}

// Counts D1 round-trips: `direct` = a serial prepare().all()/.first(), `batch` =
// one round-trip however many statements ride along. Statements built through
// the wrapper still execute inside batch without being double-counted.
function instrumentRoundTrips(): { direct: number; batch: number } {
  const calls = { direct: 0, batch: 0 }
  const real = DB_ENV.env.DB as unknown as {
    prepare(sql: string): PreparedLike
    batch(statements: PreparedLike[]): Promise<unknown>
  }
  const wrap = (stmt: PreparedLike): PreparedLike => ({
    bind: (...values: unknown[]) => wrap(stmt.bind(...values)),
    all: async () => { calls.direct += 1; return stmt.all() },
    first: async () => { calls.direct += 1; return stmt.first() },
    run: async () => stmt.run(),
  })
  DB_ENV.env.DB = {
    prepare: (sql: string) => wrap(real.prepare(sql)),
    batch: (statements: PreparedLike[]) => { calls.batch += 1; return real.batch(statements) },
  } as unknown as D1Database
  return calls
}

describe('share stats route (SH-72)', () => {
  it('answers the sidebar counters without list rows or per-note visit stats', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { id: 'st-a', title: 'Plain' })
    const n2 = await seedNote(db, { id: 'st-b', title: 'Expiring' })
    await seedShare(db, { note_id: n1, slug: 'st-a', views: 4 })
    await seedShare(db, { note_id: n2, slug: 'st-b', expires_at: Date.now() + 86_400_000 })
    await seedVisit(db, { note_id: n1, slug: 'st-a', visitor_fp: 'fp-st-1' })
    const statements = captureSql(db)

    const res = await request(makeApp(), '/api/share/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.globalStats.totalShares).toBe(2)
    expect(body.globalStats.activeShares).toBe(2)
    expect(body.globalStats.expiringShares).toBe(1)
    expect(body.globalStats.expiringSoonShares).toBe(1)
    expect(body.shares).toBeUndefined()
    // Neither the row query nor the per-note visit stats belong to a counters-only answer.
    expect(statements.some((sql) => sql.includes('as share_tags_json'))).toBe(false)
    expect(statements.some((sql) => sql.includes('COUNT(DISTINCT visitor_fp) as uvs'))).toBe(false)
  })

  it('answers in a single batch plus the memo lookup (audit #15)', async () => {
    await makeDb()
    const calls = instrumentRoundTrips()

    const body = await (await request(makeApp(), '/api/share/stats')).json()
    expect(body.globalStats.totalShares).toBe(0)
    expect(calls.batch).toBe(1)
    // The one serial flight is the one-row memo read: on a fresh memo it replaces the whole
    // history walk the filtered aggregate used to be, and it writes the refill back at most
    // once per window.
    expect(calls.direct).toBe(1)
  })
})

describe('share read budget (SH-81)', () => {
  /** Puts the account's read key over the line, the way a runaway loop would. */
  async function overspendReadBudget(db: D1Shim): Promise<void> {
    await runSql(
      db,
      `INSERT INTO login_attempts (key, fails, last_fail_at, locked_until) VALUES (?1, ?2, ?3, ?4)`,
      `share-read:${USER}`, 200, Date.now(), Date.now() + 60_000,
    )
  }

  it('answers the unbounded analytics and log reads with 429 once the account is over budget', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { id: 'rb-1', title: 'Budgeted' })
    await seedShare(db, { note_id: n1, slug: 'rb-1' })
    await overspendReadBudget(db)
    const app = makeApp()

    for (const path of [
      '/api/share/analytics/global?range=all',
      '/api/share/analytics/note/rb-1?range=all',
      '/api/share/visits',
    ]) {
      const res = await request(app, path)
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error.code).toBe('too_many_attempts')
      expect(body.error.details.retryAfter).toBeGreaterThan(0)
    }
  })

  it('leaves an on-budget read untouched', async () => {
    await makeDb()

    const res = await request(makeApp(), '/api/share/analytics/global?range=all')
    expect(res.status).toBe(200)
  })

  it('never charges a bounded range, which only fetches one window of rows', async () => {
    const db = await makeDb()
    await overspendReadBudget(db)

    const res = await request(makeApp(), '/api/share/analytics/global?range=30d')
    expect(res.status).toBe(200)
  })
})

describe('share note visit stats query (SH-73)', () => {
  it('scopes the per-note stats to the owner and searches an index instead of the table', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { id: 'ns-1', title: 'Alpha' })
    const n2 = await seedNote(db, { id: 'ns-2', title: 'Beta' })
    await seedShare(db, { note_id: n1, slug: 'ns-1' })
    await seedShare(db, { note_id: n2, slug: 'ns-2' })
    await seedVisit(db, { note_id: n1, slug: 'ns-1', visitor_fp: 'fp-ns-1' })
    await seedVisit(db, { note_id: n1, slug: 'ns-1', visitor_fp: 'fp-ns-2' })
    const statements = captureSql(db)

    const body = await (await request(makeApp(), '/api/share')).json()
    expect(body.shares.find((share: { noteId: string }) => share.noteId === 'ns-1').uniqueVisitors).toBe(2)

    const statsSql = statements.find((sql) => sql.includes('COUNT(DISTINCT visitor_fp) as uvs'))
    expect(statsSql).toBeDefined()
    expect(statsSql).toContain('user_id = ?1')

    // The measured plan (bound parameters, as the app sends them) is unchanged by the owner
    // predicate: it still searches idx_share_visits_note_time. What this guards is the other
    // half of that measurement — the statement stays index-served and never fans out into a
    // full table scan, which is what a rewrite dropping the note_id predicate would cause.
    const plan = await allRows(db, `EXPLAIN QUERY PLAN ${statsSql}`, USER, ...body.shares.map((share: { noteId: string }) => share.noteId))
    const detail = plan.map((row) => String(row.detail)).join(' | ')
    expect(detail).toContain('SEARCH share_visits USING')
    expect(detail).not.toContain('SCAN share_visits')
  })
})

describe('share stale link hygiene (SH-70)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = () => Date.now()

  /**
   * The stale query joins `users` for the account's own threshold, so the owner row has to exist —
   * without it every link would read as quiet-free and the tests would prove nothing.
   */
  async function ensureOwner(db: D1Shim): Promise<void> {
    await runSql(
      db,
      `INSERT OR IGNORE INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES (?1, ?1, 'x', 'login', 'Author', '', ?2, ?2)`,
      USER, H.now,
    )
  }

  /** One public link, last read `daysAgo` days ago; `null` means nobody ever opened it. */
  async function seedLink(
    db: D1Shim,
    slug: string,
    daysAgo: number | null,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    await ensureOwner(db)
    const noteId = await seedNote(db, { id: `stale-${slug}`, title: `Title ${slug}` })
    await seedShare(db, {
      note_id: noteId,
      slug,
      views: daysAgo === null ? 0 : 3,
      last_viewed_at: daysAgo === null ? null : now() - daysAgo * DAY_MS,
      ...extra,
    })
    return noteId
  }

  async function staleBlock(db: D1Shim) {
    const body = await (await request(makeApp(), '/api/share/analytics/global?range=30d')).json()
    return body.staleLinks as {
      thresholdDays: number
      total: number
      neverViewed: number
      items: Array<{ noteId: string; noteTitle: string | null; slug: string; lastViewedAt: number | null; views: number }>
    }
  }

  it('reports the links nobody opened inside the threshold, and not the ones still being read', async () => {
    const db = await makeDb()
    await seedLink(db, 'quiet', 200)
    await seedLink(db, 'fresh', 3)

    const stale = await staleBlock(db)

    expect(stale.thresholdDays).toBe(90)
    expect(stale.total).toBe(1)
    expect(stale.items.map((item) => item.slug)).toEqual(['quiet'])
    // The row carries what the card has to say about it: which note, when it was last read.
    expect(stale.items[0].noteTitle).toBe('Title quiet')
    // The real last-visit time, not the share's creation or a zero: the seeded row is 200 days old,
    // while `created_at` is a decade in the future in this harness.
    const lastViewed = stale.items[0].lastViewedAt ?? 0
    expect(Math.abs(lastViewed - (now() - 200 * DAY_MS))).toBeLessThan(60_000)
  })

  it('treats a link that was never opened as quiet, and says how many those are', async () => {
    const db = await makeDb()
    await seedLink(db, 'never', null)
    await seedLink(db, 'old', 400)

    const stale = await staleBlock(db)

    expect(stale.total).toBe(2)
    expect(stale.neverViewed).toBe(1)
    // Never-read links come first: they are the ones that never worked at all.
    expect(stale.items.map((item) => item.slug)).toEqual(['never', 'old'])
    expect(stale.items[0].lastViewedAt).toBeNull()
  })

  it('counts every quiet link while listing only the oldest page', async () => {
    const db = await makeDb()
    for (let index = 1; index <= 7; index += 1) await seedLink(db, `stale-${index}`, 100 + index)

    const stale = await staleBlock(db)

    expect(stale.total).toBe(7)
    expect(stale.items).toHaveLength(5)
    expect(stale.items.map((item) => item.slug)).toEqual(['stale-7', 'stale-6', 'stale-5', 'stale-4', 'stale-3'])
  })

  it('takes the threshold from the account, so a slow site can widen it', async () => {
    const db = await makeDb()
    await seedLink(db, 'sixty-days', 60)
    await setShareSettings(db, { share: { staleLinkDays: 30 } })

    const stale = await staleBlock(db)

    expect(stale.thresholdDays).toBe(30)
    expect(stale.items.map((item) => item.slug)).toEqual(['sixty-days'])
  })

  it('reports nothing at all when the owner turned the hygiene report off', async () => {
    const db = await makeDb()
    await seedLink(db, 'ancient', 900)
    await setShareSettings(db, { share: { staleLinkDays: 0 } })

    const stale = await staleBlock(db)

    expect(stale).toEqual({ thresholdDays: 0, total: 0, neverViewed: 0, items: [] })
  })

  it('leaves out links that are not public, which have nobody to be quiet for', async () => {
    const db = await makeDb()
    await seedLink(db, 'paused', 300, { is_enabled: 0 })
    await seedLink(db, 'expired', 300, { expires_at: now() - DAY_MS })
    await seedLink(db, 'live', 300)

    const stale = await staleBlock(db)

    expect(stale.items.map((item) => item.slug)).toEqual(['live'])
  })

  it('keeps working when the stored settings document is unreadable', async () => {
    const db = await makeDb()
    await seedLink(db, 'quiet', 200)
    await setShareSettings(db, '{not json')

    const stale = await staleBlock(db)

    // A corrupt document must fall back to the shipped threshold, not take the endpoint down.
    expect(stale.thresholdDays).toBe(90)
    expect(stale.total).toBe(1)
  })

  it('asks the database once, however many links have gone quiet', async () => {
    const db = await makeDb()
    for (let index = 1; index <= 6; index += 1) await seedLink(db, `many-${index}`, 100 + index)
    const statements = captureSql(db)
    const calls = instrumentRoundTrips()

    const stale = await staleBlock(db)

    expect(stale.total).toBe(6)
    expect(statements.filter((sql) => sql.includes('last_viewed_at'))).toHaveLength(1)
    expect(calls.batch).toBe(1)
  })
})

describe('share list and analytics db.batch round-trips (SH-17a)', () => {
  it('answers the share list in exactly two batches and no serial query', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Round trip' })
    await seedShare(db, { note_id: n1, slug: 'rt-1' })
    await seedVisit(db, { note_id: n1, slug: 'rt-1' })
    const calls = instrumentRoundTrips()

    const body = await (await request(makeApp(), '/api/share')).json()
    expect(body.shares[0].views).toBe(1)
    expect(body.shares[0].uniqueVisitors).toBe(1)
    expect(body.globalStats.totalShares).toBe(1)
    expect(calls.batch).toBe(2)
    // The serial budget now includes the one-row memo read (audit #15): cheap on every request,
    // and it lets the batch drop the whole-history UV aggregate whenever the memo is fresh.
    expect(calls.direct).toBe(1)
  })

  it('answers global analytics in one batch plus the dependent top-notes lookup', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Global rt' })
    await seedShare(db, { note_id: n1, slug: 'ag-rt' })
    await seedVisit(db, { note_id: n1, slug: 'ag-rt', visitor_fp: 'f-rt' })
    const calls = instrumentRoundTrips()

    const body = await (await request(makeApp(), '/api/share/analytics/global?range=30d')).json()
    expect(body.totalViews).toBe(1)
    expect(body.totalVisitors).toBe(1)
    expect(body.topNotes[0].noteTitle).toBe('Global rt')
    expect(body.recentVisits.length).toBe(1)
    expect(body.filterStats.bots).toBe(0)
    expect(calls.direct).toBe(1)
    expect(calls.batch + calls.direct).toBeLessThanOrEqual(2)
  })

  it('answers note analytics with the share-gate query plus one batch', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { id: 'na-rt', title: 'Note rt' })
    await seedShare(db, { note_id: n1, slug: 'an-rt' })
    await seedVisit(db, { note_id: n1, slug: 'an-rt' })
    const calls = instrumentRoundTrips()

    const body = await (await request(makeApp(), '/api/share/analytics/note/na-rt?range=30d')).json()
    expect(body.totalViews).toBe(1)
    expect(body.noteTitle).toBe('Note rt')
    expect(body.recentVisits.length).toBe(1)
    expect(calls.direct).toBe(1)
    expect(calls.batch + calls.direct).toBeLessThanOrEqual(2)
  })

  it('still answers 404 from the share gate alone, without visit queries', async () => {
    await makeDb()
    const calls = instrumentRoundTrips()

    const res = await request(makeApp(), '/api/share/analytics/note/ghost?range=30d')
    expect(res.status).toBe(404)
    expect(calls.batch).toBe(0)
    expect(calls.direct).toBe(1)
  })
})

describe('share sidebar count parity (SH-30)', () => {
  it('excludes shares of soft-deleted notes from badge, folder and tag counts', async () => {
    const db = await makeDb()
    await runSql(
      db,
      `INSERT INTO share_folders (id, user_id, parent_id, name, position, created_at, updated_at)
       VALUES ('sf-p', ?1, NULL, 'Shared', 0, ?2, ?2)`,
      USER, H.now,
    )
    await runSql(db, `INSERT INTO share_tags (id, user_id, name, created_at) VALUES ('st-p', ?1, 'alpha', ?2)`, USER, H.now)
    const live = await seedNote(db, { title: 'Live' })
    const trashed = await seedNote(db, { title: 'Trashed' })
    await runSql(db, 'UPDATE notes SET deleted_at = ?1 WHERE id = ?2', H.now, trashed)
    await seedShare(db, { note_id: live, slug: 'parity-live', folder_id: 'sf-p', tags: '["alpha"]' })
    await seedShare(db, { note_id: trashed, slug: 'parity-trash', folder_id: 'sf-p', tags: '["alpha"]' })

    const body = await (await request(makeApp(), '/api/share')).json()
    expect(body.shares.map((s: { slug: string }) => s.slug)).toEqual(['parity-live'])
    expect(body.globalStats.totalShares).toBe(1)
    expect(body.globalStats.activeShares).toBe(1)
    expect(body.globalStats.folderCounts['sf-p']).toEqual({ total: 1, shared: 1 })
    expect(body.globalStats.tagCounts['alpha']).toEqual({ total: 1, shared: 1 })
    expect(body.truncated).toBe(false)
  })

  it('keeps the expiring category disjoint from expired and permanent', async () => {
    const db = await makeDb()
    const now = Date.now()
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    const n3 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'ex-future', expires_at: now + 86_400_000 })
    await seedShare(db, { note_id: n2, slug: 'ex-past', expires_at: now - 86_400_000 })
    await seedShare(db, { note_id: n3, slug: 'ex-none' })
    const app = makeApp()
    const slugs = async (status: string) =>
      (await (await request(app, `/api/share?status=${status}`)).json()).shares.map((s: { slug: string }) => s.slug)

    expect(await slugs('expiring')).toEqual(['ex-future'])
    expect(await slugs('expired')).toEqual(['ex-past'])
    expect(await slugs('permanent')).toEqual(['ex-none'])
  })

  it('separates the shares that expire within a week from the ones merely having a date (SH-53)', async () => {
    const db = await makeDb()
    const now = Date.now()
    const soon = await seedNote(db, {})
    const later = await seedNote(db, {})
    const gone = await seedNote(db, {})
    await seedShare(db, { note_id: soon, slug: 'soon-3d', expires_at: now + 3 * 86_400_000 })
    await seedShare(db, { note_id: later, slug: 'later-30d', expires_at: now + 30 * 86_400_000 })
    await seedShare(db, { note_id: gone, slug: 'gone', expires_at: now - 86_400_000 })
    const app = makeApp()
    const slugs = async (status: string) =>
      (await (await request(app, `/api/share?status=${status}`)).json()).shares.map((s: { slug: string }) => s.slug)

    expect(await slugs('expiring_soon')).toEqual(['soon-3d'])
    // "Has expiry" stays the superset of every future date — including the soon ones, so no row
    // disappears from the wider category — while "soon" narrows it, and expired stays disjoint.
    expect((await slugs('expiring')).sort()).toEqual(['later-30d', 'soon-3d'])
    expect(await slugs('expired')).toEqual(['gone'])
    const stats = (await (await request(app, '/api/share')).json()).globalStats
    expect(stats.expiringSoonShares).toBe(1)
  })

  it('counts the categories the sidebar used to leave blank (SH-52)', async () => {
    const db = await makeDb()
    const now = Date.now()
    const locked = await seedNote(db, {})
    const dated = await seedNote(db, {})
    const forever = await seedNote(db, {})
    await seedShare(db, { note_id: locked, slug: 'locked', password_hash: 'hash' })
    await seedShare(db, { note_id: dated, slug: 'dated', expires_at: now + 30 * 86_400_000 })
    await seedShare(db, { note_id: forever, slug: 'forever' })

    const stats = (await (await request(makeApp(), '/api/share')).json()).globalStats
    expect([stats.passwordShares, stats.expiringShares, stats.permanentShares]).toEqual([1, 1, 2])
  })

  it('marks the list truncated when it exceeds the server row limit', async () => {
    const db = await makeDb()
    for (let i = 0; i < 501; i++) {
      const id = await seedNote(db, { title: `Bulk ${i}` })
      await seedShare(db, { note_id: id })
    }

    const body = await (await request(makeApp(), '/api/share')).json()
    expect(body.shares.length).toBe(500)
    expect(body.total).toBe(500)
    expect(body.truncated).toBe(true)
  }, 30_000)
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

  it('extends each link from the later of its own expiry and now, leaving permanent links alone', async () => {
    const db = await makeDb()
    const soon = await seedNote(db, {})
    const lapsed = await seedNote(db, {})
    const permanent = await seedNote(db, {})
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    await seedShare(db, { note_id: soon, slug: 'soon', expires_at: now + 2 * day })
    await seedShare(db, { note_id: lapsed, slug: 'lapsed', expires_at: now - 30 * day })
    await seedShare(db, { note_id: permanent, slug: 'permanent', expires_at: null })
    const app = makeApp()

    const res = await postJson(app, '/api/share/batch', { action: 'extend', noteIds: [soon, lapsed, permanent], extendDays: 7 })
    expect(res.status).toBe(200)
    // The permanent link is reported rather than counted: nothing about it changed.
    expect(await res.json()).toMatchObject({ ok: true, count: 2, permanent: 1 })

    const extended = await firstRow(db, 'SELECT expires_at FROM shares WHERE slug = ?1', 'soon')
    expect(Math.abs((extended!.expires_at as number) - (now + 9 * day))).toBeLessThan(5_000)
    // A lapsed link extends from now: counting from its own past expiry would leave it lapsed.
    const restarted = await firstRow(db, 'SELECT expires_at FROM shares WHERE slug = ?1', 'lapsed')
    expect(Math.abs((restarted!.expires_at as number) - (now + 7 * day))).toBeLessThan(5_000)
    const untouched = await firstRow(db, 'SELECT expires_at FROM shares WHERE slug = ?1', 'permanent')
    expect(untouched!.expires_at).toBeNull()
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

  it('answers the count and the page in one batch (audit #17)', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Batched' })
    await seedShare(db, { note_id: n1, slug: 'v-batch' })
    await seedVisit(db, { note_id: n1, slug: 'v-batch', visitor_fp: 'fp-b1' })
    await seedVisit(db, { note_id: n1, slug: 'v-batch', visitor_fp: 'fp-b2' })
    const calls = instrumentRoundTrips()

    const body = await (await request(makeApp(), '/api/share/visits?limit=10&page=1')).json()
    expect(body.total).toBe(2)
    expect(body.visits.length).toBe(2)
    // The route's own count+page pair is one batch. The remaining flights belong to the read
    // budget ahead of it: one batch for its upsert and two direct probes for its lock checks
    // (before and after) — none of them a second pass over the log.
    expect(calls.batch).toBe(2)
    expect(calls.direct).toBe(2)
  })

  it('ships only the display prefix of a fingerprint and nothing on non-bot rows', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Hashed' })
    await seedShare(db, { note_id: n1, slug: 'h-1' })
    const base = Date.now()
    await seedVisit(db, { note_id: n1, slug: 'h-1', visited_at: base, visitor_fp: '0123456789abcdef0123456789abcdef' })
    await seedVisit(db, {
      note_id: n1,
      slug: 'h-1',
      visited_at: base + 1,
      is_bot: true,
      visitor_fp: 'fedcba9876543210fedcba9876543210',
      user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    })

    const body = await (await request(makeApp(), '/api/share/visits')).json()
    expect(body.visits.map((v: { visitorFp: string }) => v.visitorFp)).toEqual(['fedcba98', '01234567'])
    expect(body.visits[0].botName).toBe('Googlebot')
    expect(body.visits[1].botName).toBeNull()
    expect(JSON.stringify(body)).not.toContain('7654321')
  })

  it('falls back to page/limit defaults for unparseable numbers instead of binding NaN', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Paged' })
    await seedShare(db, { note_id: n1, slug: 'p-1' })
    const base = Date.now()
    for (let i = 0; i < 3; i++) {
      await seedVisit(db, { note_id: n1, slug: 'p-1', visitor_fp: `fp-${i}`, visited_at: base + i })
    }
    const app = makeApp()

    const garbage = await request(app, '/api/share/visits?page=abc&limit=abc')
    expect(garbage.status).toBe(200)
    const body = await garbage.json()
    expect(body.page).toBe(1)
    expect(body.limit).toBe(50)
    expect(body.visits.length).toBe(3)

    const negative = await (await request(app, '/api/share/visits?page=-3&limit=1')).json()
    expect(negative.page).toBe(1)
    expect(negative.limit).toBe(10)

    const wild = await request(app, '/api/share/visits?page=999999999999&limit=99999')
    expect(wild.status).toBe(200)
    const clamped = await wild.json()
    expect(clamped.limit).toBe(100)
    expect(Number.isInteger(clamped.page)).toBe(true)
    expect(clamped.page).toBeGreaterThanOrEqual(1)
    // The cap bounds the worst OFFSET, not just the type: past it a caller is paging into
    // nothing, so it is folded back to the ceiling rather than trusted with a nine-figure offset.
    expect(clamped.page).toBe(10_000)
    expect(clamped.visits.length).toBe(0)
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

/**
 * ADR-0003: the session view folds one visitor's visits into sittings. Its boundaries are the part
 * that has to be exact — a gap, a UTC day, and a page edge are each a place where a wrong operator
 * would silently produce a different story about what a visitor read.
 */
describe('share visitor sessions (ADR-0003)', () => {
  const DAY = 24 * 60 * 60 * 1000
  const GAP = 30 * 60 * 1000

  /** A moment inside the current UTC day, so a +2×gap window cannot cross midnight by accident. */
  function insideToday(offsetMs: number): number {
    return Math.floor(Date.now() / DAY) * DAY + offsetMs
  }

  async function seedVisits(db: D1Shim, rows: Array<Record<string, unknown>>): Promise<string> {
    const noteId = await seedNote(db, { title: 'Read' })
    await seedShare(db, { note_id: noteId, slug: 's-1' })
    for (const row of rows) await seedVisit(db, { note_id: noteId, slug: 's-1', ...row })
    return noteId
  }

  it('starts a new session one millisecond past the gap, and only there', async () => {
    const db = await makeDb()
    const base = insideToday(60_000)
    await seedVisits(db, [
      { visitor_fp: 'fp-a', visited_at: base },
      { visitor_fp: 'fp-a', visited_at: base + GAP },
      { visitor_fp: 'fp-a', visited_at: base + 2 * GAP + 1 },
    ])

    const body = await (await request(makeApp(), '/api/share/sessions?range=all')).json()

    // Newest first: the lone trailing visit is its own session, the two on the boundary are one.
    expect(body.sessions.map((session: { visits: number }) => session.visits)).toEqual([1, 2])
  })

  it('never merges two visits that fall on either side of UTC midnight', async () => {
    const db = await makeDb()
    const midnight = Math.floor(Date.now() / DAY) * DAY
    await seedVisits(db, [
      { visitor_fp: 'fp-a', visited_at: midnight - 60_000 },
      { visitor_fp: 'fp-a', visited_at: midnight + 60_000 },
    ])

    const body = await (await request(makeApp(), '/api/share/sessions?range=all')).json()

    // Two minutes apart, one fingerprint — and still two sessions: the salt rotates at midnight, so
    // the two rows were never the same visitor as far as the data is concerned.
    expect(body.sessions).toHaveLength(2)
    expect(body.sessions.every((session: { visits: number }) => session.visits === 1)).toBe(true)
    expect(body.sessions[0].fingerprint).toBe(body.sessions[1].fingerprint)
  })

  it('keeps two fingerprints apart and lists each session\u2019s notes in reading order', async () => {
    const db = await makeDb()
    const first = await seedNote(db, { title: 'First' })
    const second = await seedNote(db, { title: 'Second' })
    await seedShare(db, { note_id: first, slug: 's-1' })
    const base = insideToday(60_000)
    await seedVisit(db, { note_id: first, slug: 's-1', visitor_fp: 'fp-a', visited_at: base })
    await seedVisit(db, { note_id: first, slug: 's-1', visitor_fp: 'fp-a', visited_at: base + 1000 })
    await seedVisit(db, { note_id: second, slug: 's-1', visitor_fp: 'fp-a', visited_at: base + 2000 })
    await seedVisit(db, { note_id: second, slug: 's-1', visitor_fp: 'fp-b', visited_at: base + 3000 })

    const body = await (await request(makeApp(), '/api/share/sessions?range=all')).json()

    expect(body.sessions).toHaveLength(2)
    const [newer, older] = body.sessions
    expect(newer.notes).toHaveLength(1)
    expect(older.visits).toBe(3)
    expect(older.notes.map((note: { noteId: string; visits: number }) => [note.noteId, note.visits])).toEqual([
      [first, 2],
      [second, 1],
    ])
    expect(older.notes[0].noteTitle).toBe('First')
  })

  it('applies the same traffic filters the log panel applies', async () => {
    const db = await makeDb()
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 's-1' })
    await seedVisit(db, { note_id: noteId, slug: 's-1', visitor_fp: 'fp-bot', visited_at: insideToday(60_000), is_bot: true })
    const app = makeApp()

    const quiet = await (await request(app, '/api/share/sessions?range=all')).json()
    const loud = await (await request(app, '/api/share/sessions?range=all&excludeBots=false')).json()

    expect(quiet.sessions).toEqual([])
    expect(loud.sessions).toHaveLength(1)
  })

  it('sends the fingerprint head and never the stored digest', async () => {
    const db = await makeDb()
    const digest = 'abcdef0123456789abcdef0123456789'
    await seedVisits(db, [{ visitor_fp: digest, visited_at: insideToday(60_000) }])

    const body = await (await request(makeApp(), '/api/share/sessions?range=all')).json()

    expect(body.sessions[0].fingerprint).toBe(digest.slice(0, 8))
    expect(JSON.stringify(body)).not.toContain(digest)
  })

  it('pages whole sessions without repeating or dropping one', async () => {
    const db = await makeDb()
    const base = insideToday(60_000)
    await seedVisits(db, [
      { visitor_fp: 'fp-a', visited_at: base },
      { visitor_fp: 'fp-b', visited_at: base + 1000 },
      { visitor_fp: 'fp-c', visited_at: base + 2000 },
    ])
    const app = makeApp()

    const pageOne = await (await request(app, '/api/share/sessions?range=all&limit=2')).json()
    expect(pageOne.sessions).toHaveLength(2)
    expect(pageOne.nextCursor).toBeTruthy()
    const pageTwo = await (await request(app, `/api/share/sessions?range=all&limit=2&cursor=${encodeURIComponent(pageOne.nextCursor)}`)).json()

    const seen = [...pageOne.sessions, ...pageTwo.sessions].map((session: { startedAt: number }) => session.startedAt)
    expect(pageTwo.nextCursor).toBeNull()
    expect(new Set(seen).size).toBe(3)
    expect(seen).toEqual([...seen].sort((a, b) => b - a))
  })

  it('rejects a cursor it did not mint instead of quietly answering the first page', async () => {
    const db = await makeDb()
    await seedVisits(db, [{ visitor_fp: 'fp-a', visited_at: insideToday(60_000) }])

    const res = await request(makeApp(), '/api/share/sessions?range=all&cursor=not-a-cursor')

    expect(res.status).toBe(400)
  })

  it('groups only visits that carry a fingerprint, and says so by leaving the rest out', async () => {
    const db = await makeDb()
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 's-1' })
    // No instance secret means no fingerprint is minted: the row is still logged, and it belongs to
    // no session — the two views are allowed to differ, and this is the case where they do.
    await runSql(
      db,
      `INSERT INTO share_visits (user_id, note_id, slug, visited_at, visitor_fp, device_type, os, browser, is_bot, is_self_referrer, is_owner)
       VALUES (?1, ?2, 's-1', ?3, NULL, 'desktop', 'os', 'browser', 0, 0, 0)`,
      USER, noteId, insideToday(60_000),
    )
    const app = makeApp()

    const sessions = await (await request(app, '/api/share/sessions?range=all')).json()
    const logs = await (await request(app, '/api/share/visits')).json()

    expect(sessions.sessions).toEqual([])
    expect(logs.visits).toHaveLength(1)
  })
})

describe('visit rows of deleted notes report a missing title (SH-34)', () => {
  it('returns null noteTitle in the visits list, recent visits and top notes', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { title: 'Deleted soon' })
    await seedShare(db, { note_id: n1, slug: 'dg-1' })
    await seedVisit(db, { note_id: n1, slug: 'dg-1' })
    await runSql(db, 'DELETE FROM notes WHERE id = ?1', n1)
    const app = makeApp()

    const visits = await (await request(app, '/api/share/visits')).json()
    expect(visits.visits[0].noteTitle).toBeNull()

    const global = await (await request(app, '/api/share/analytics/global?range=30d')).json()
    expect(global.recentVisits[0].noteTitle).toBeNull()
    expect(global.topNotes[0].noteTitle).toBeNull()
    expect(global.topNotes[0].views).toBe(1)
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

  it('does not resolve a top note title across accounts', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedUser(db, 'user-2')
    const foreign = await seedNote(db, { user_id: 'user-2', title: 'Foreign secret' })
    // Any write path that ever loses its ownership check would leave a visit row
    // pointing at another account's note; the title lookup must not follow it.
    await seedVisit(db, { note_id: foreign, slug: 'x-1', visitor_fp: 'fp-x' })

    const body = await (await request(makeApp(), '/api/share/analytics/global?range=30d')).json()
    expect(body.totalViews).toBe(1)
    expect(body.topNotes.map((n: { noteTitle: string | null }) => n.noteTitle)).toEqual([null])
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

  it('answers a global range=all with SQL aggregation instead of fetching every visit row', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'pd-g' })
    await seedVisit(db, { note_id: n1, slug: 'pd-g', visited_at: Date.now() - 800 * 86_400_000, visitor_fp: 'fp-pd-g1' })
    await seedVisit(db, { note_id: n1, slug: 'pd-g', visited_at: Date.now() - 60_000, visitor_fp: 'fp-pd-g2' })
    const statements = captureSql(db)

    const body = await (await request(makeApp(), '/api/share/analytics/global?range=all')).json()
    expect(body.totalViews).toBe(2)
    expect(body.totalVisitors).toBe(2)
    expect(body.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(2)
    expect(body.topNotes[0].views).toBe(2)
    expect(statements.some((sql) => sql.includes('GROUP BY'))).toBe(true)
    expect(statements.filter((sql) => /^SELECT visited_at, visitor_fp/.test(sql))).toEqual([])
  })

  it('answers a per-note range=all with SQL aggregation instead of fetching every visit row', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, { id: 'pd-note-1' })
    await seedShare(db, { note_id: n1, slug: 'pd-n' })
    await seedVisit(db, { note_id: n1, slug: 'pd-n', visited_at: Date.now() - 800 * 86_400_000, visitor_fp: 'fp-pd-n1' })
    await seedVisit(db, { note_id: n1, slug: 'pd-n', visited_at: Date.now() - 60_000, visitor_fp: 'fp-pd-n2' })
    const statements = captureSql(db)

    const body = await (await request(makeApp(), '/api/share/analytics/note/pd-note-1?range=all')).json()
    expect(body.totalViews).toBe(2)
    expect(body.totalVisitors).toBe(2)
    expect(body.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(2)
    expect(statements.some((sql) => sql.includes('GROUP BY'))).toBe(true)
    expect(statements.filter((sql) => /^SELECT visited_at, visitor_fp/.test(sql))).toEqual([])
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

  it('keeps out-of-range visits out of the global recent visit list', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'rv-g' })
    await seedVisit(db, { note_id: n1, slug: 'rv-g', visited_at: Date.now() - 14 * 86_400_000, visitor_fp: 'fp-rv-old' })
    await seedVisit(db, { note_id: n1, slug: 'rv-g', visited_at: Date.now() - 60_000, visitor_fp: 'fp-rv-new' })

    const body = await (await request(makeApp(), '/api/share/analytics/global?range=7d')).json()
    expect(body.recentVisits.length).toBe(1)
    expect(body.recentVisits[0].visitedAt).toBeGreaterThan(Date.now() - 7 * 86_400_000)
  })

  it('keeps out-of-range visits out of the per-note recent visit list', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'rv-n' })
    await seedVisit(db, { note_id: n1, slug: 'rv-n', visited_at: Date.now() - 14 * 86_400_000, visitor_fp: 'fp-rv2-old' })
    await seedVisit(db, { note_id: n1, slug: 'rv-n', visited_at: Date.now() - 60_000, visitor_fp: 'fp-rv2-new' })

    const body = await (await request(makeApp(), `/api/share/analytics/note/${n1}?range=7d`)).json()
    expect(body.recentVisits.length).toBe(1)
    expect(body.recentVisits[0].visitedAt).toBeGreaterThan(Date.now() - 7 * 86_400_000)
  })

  it('still lists the full history in recent visits when the range is all', async () => {
    const db = await makeDb()
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'rv-a' })
    await seedVisit(db, { note_id: n1, slug: 'rv-a', visited_at: Date.now() - 800 * 86_400_000, visitor_fp: 'fp-rv3-old' })
    await seedVisit(db, { note_id: n1, slug: 'rv-a', visited_at: Date.now() - 60_000, visitor_fp: 'fp-rv3-new' })

    const body = await (await request(makeApp(), '/api/share/analytics/global?range=all')).json()
    expect(body.recentVisits.length).toBe(2)
    expect(body.recentVisits[1].visitedAt).toBeLessThan(Date.now() - 700 * 86_400_000)
  })
})

describe('share list filtered-stats memo (audit #15)', () => {
  it('serves the all-time footnote from the memo and refills it once the window passes', async () => {
    vi.useFakeTimers()
    try {
      const START = Date.now()
      const db = await makeDb()
      await seedUser(db)
      const n1 = await seedNote(db, { title: 'Memo' })
      await seedShare(db, { note_id: n1, slug: 'memo-1' })
      await seedVisit(db, { note_id: n1, slug: 'memo-1', visited_at: START - 60_000, visitor_fp: 'fp-m1' })
      await seedVisit(db, { note_id: n1, slug: 'memo-1', visited_at: START - 50_000, visitor_fp: 'fp-m2' })
      const app = makeApp()

      const first = await (await request(app, '/api/share')).json()
      expect(first.globalStats.totalVisitors).toBe(2)
      expect(first.globalStats.totalViews).toBe(2)

      // A visit that lands after the memo was written must not show up until the window passes.
      await seedVisit(db, { note_id: n1, slug: 'memo-1', visited_at: START - 10_000, visitor_fp: 'fp-m3' })
      vi.setSystemTime(START + 30_000)
      const second = await (await request(app, '/api/share')).json()
      expect(second.globalStats.totalVisitors).toBe(2)

      vi.setSystemTime(START + FILTERED_STATS_TTL_MS + 1_000)
      const third = await (await request(app, '/api/share')).json()
      expect(third.globalStats.totalVisitors).toBe(3)
      expect(third.globalStats.totalViews).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a different traffic filter on its own memo entry', async () => {
    vi.useFakeTimers()
    try {
      const START = Date.now()
      const db = await makeDb()
      await seedUser(db)
      const n1 = await seedNote(db, { title: 'Memo bots' })
      await seedShare(db, { note_id: n1, slug: 'memo-2' })
      await seedVisit(db, { note_id: n1, slug: 'memo-2', visited_at: START - 60_000, visitor_fp: 'fp-m4' })
      await seedVisit(db, { note_id: n1, slug: 'memo-2', visited_at: START - 50_000, visitor_fp: 'fp-m5', is_bot: true })
      const app = makeApp()

      const real = await (await request(app, '/api/share')).json()
      expect(real.globalStats.totalVisitors).toBe(1)

      const withBots = await (await request(app, '/api/share?excludeBots=false')).json()
      expect(withBots.globalStats.totalVisitors).toBe(2)
    } finally {
      vi.useRealTimers()
    }
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

  it('counts no second view from a window read answered at a stale moment (SH-101)', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'stale-window', is_enabled: 1 })
    const app = makeApp()
    DB_ENV.env.VISIT_FP_SECRET = 'stale-window-secret'

    // The visitor's first visit writes their row and counts their view.
    expect((await accessAwaitingVisits(app, 'stale-window')).status).toBe(200)
    expect((await visitRows(db, 'stale-window')).length).toBe(1)
    expect(await viewCount(db, 'stale-window')).toBe(1)

    // The second visit is served a window read that answers "not seen" — what it gets when another
    // request's row lands just after that read. That moment is the whole race, and it is injected
    // rather than raced for, because a single-threaded test cannot schedule it: a path that decides
    // from the read double-counts here, while a path that decides inside the write has no answer to
    // be stale. The wrapper is keyed on the old read's own SQL, so it can only ever fire for a path
    // that still reads the window separately.
    const realPrepare = db.prepare.bind(db)
    DB_ENV.env.DB = {
      prepare: (sql: string) => {
        const statement = realPrepare(sql)
        if (!sql.includes('SELECT 1 AS seen FROM share_visits')) return statement
        const staleAnswer = async () => null
        // The binding happens between the read's prepare and its first(), so the stale answer has to
        // ride the bound statement rather than the prepared one.
        return {
          ...statement,
          bind: (...values: unknown[]) => ({ ...statement.bind(...values), first: staleAnswer }),
          first: staleAnswer,
        } as unknown as D1PreparedStatement
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database

    expect((await accessAwaitingVisits(app, 'stale-window')).status).toBe(200)
    expect((await visitRows(db, 'stale-window')).length).toBe(1)
    expect(await viewCount(db, 'stale-window')).toBe(1)
  })

  it('records every visit when the instance holds no fingerprint secret (SH-101)', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'no-secret', is_enabled: 1 })
    const app = makeApp()

    // Without the secret the rows carry no fingerprint at all — that is the privacy default, and it
    // is also why the window has nothing to match on: on such an instance every visit is its own row
    // and its own view, and there are no unique visitors to count. The dashboard says exactly that
    // instead of reporting a zero it cannot justify.
    await accessAwaitingVisits(app, 'no-secret')
    await accessAwaitingVisits(app, 'no-secret')

    expect((await visitRows(db, 'no-secret')).map((row) => row.visitor_fp)).toEqual([null, null])
    expect(await viewCount(db, 'no-secret')).toBe(2)
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

  it('drops a referrer pointing at the same share path instead of storing it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, {})
    await seedShare(db, { note_id: n1, slug: 'ref-self' })

    const res = await publicVisitAccess(makeApp(), 'ref-self', 'https://app.example/s/ref-self')

    expect(res.status).toBe(200)
    const row = await firstRow(db, 'SELECT referrer, referrer_host FROM share_visits WHERE slug = ?1', 'ref-self')
    expect(row?.referrer).toBeNull()
    expect(row?.referrer_host).toBeNull()
  })
})

/**
 * ADR-0004. The marker is the one field a visitor's URL can put into the visits table, so what it
 * accepts, what it refuses and what it refuses to merge are all load-bearing.
 */
describe('share channel marker collection (ADR-0004)', () => {
  /** A public visit with an arbitrary access body, awaited through the visit queue. */
  async function visit(app: Hono<AppBindings>, slug: string, body: Record<string, unknown>): Promise<Response> {
    const pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) } as unknown as ExecutionContext
    const res = await app.request(`/api/public/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 ChannelProbe/1.0' },
      body: JSON.stringify(body),
    }, DB_ENV.env as AppBindings['Bindings'], ctx)
    await Promise.all(pending)
    return res
  }

  async function seedChannelShare(db: D1Shim, slug: string): Promise<string> {
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug })
    return noteId
  }

  /** One published collection of this account, addressed by the slug its directory links carry. */
  async function seedCollection(db: D1Shim, fields: {
    type: 'folder' | 'tag'
    name: string
    slug: string
    isEnabled?: number
  }): Promise<string> {
    const targetId = `${fields.type === 'folder' ? 'f' : 't'}${'0'.repeat(25)}`
    if (fields.type === 'folder') {
      await runSql(db,
        `INSERT INTO share_folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
         VALUES (?1, ?2, NULL, ?3, NULL, NULL, 0, ?4, ?4)`,
        targetId, USER, fields.name, H.now)
    } else {
      await runSql(db,
        `INSERT INTO share_tags (id, user_id, name, color, is_pinned, created_at) VALUES (?1, ?2, ?3, NULL, 0, ?4)`,
        targetId, USER, fields.name, H.now)
    }
    await runSql(db,
      `INSERT INTO share_collections (id, slug, user_id, target_type, target_value, password_hash, expires_at, is_enabled, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6, ?7, ?7)`,
      `c-${fields.slug}`, fields.slug, USER, fields.type, targetId, fields.isEnabled ?? 1, H.now)
    return targetId
  }

  it('stores a well-formed marker that the visit URL carried', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedChannelShare(db, 'chan-ok')

    const res = await visit(makeApp(), 'chan-ok', { ref: 'newsletter' })

    expect(res.status).toBe(200)
    expect(await visitChannel(db, 'chan-ok')).toBe('newsletter')
  })

  it('logs the visit but stores nothing when the marker could have carried free text', async () => {
    const db = await makeDb()
    await seedUser(db)
    const rejected: Array<[string, string]> = [
      ['uppercase', 'Newsletter'],
      ['spaces', 'mail list'],
      ['period', 'news.letter'],
      ['encoded dot', 'news%2eletter'],
      ['cjk', '\u6e20\u9053'],
      ['too long', 'a'.repeat(33)],
    ]
    const app = makeApp()
    for (const [name, ref] of rejected) {
      const slug = `chan-${name.replace(/[^a-z]/g, '')}`
      await seedChannelShare(db, slug)
      const res = await visit(app, slug, { ref })
      // A visitor must never see an error because the owner mistyped a URL.
      expect(res.status, name).toBe(200)
      // The row is there (the log keeps counting) and the refused value is not in it.
      expect(await visitChannel(db, slug), name).toBe('')
    }
  })

  it('refuses an over-long marker in the body with 400 rather than truncating it', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedChannelShare(db, 'chan-long')

    const res = await visit(makeApp(), 'chan-long', { ref: 'a'.repeat(LIMITS.shareChannelMaxLength + 1) })

    expect(res.status).toBe(400)
  })

  it('does not let a visitor squat the two reserved breakdown names', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    for (const [index, name] of [CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED].entries()) {
      const slug = `chan-squat-${index}`
      await seedChannelShare(db, slug)
      await visit(app, slug, { ref: name })
      // Storing either name would let a real channel be reported as "no marker".
      expect(await visitChannel(db, slug), name).toBe('')
    }
  })

  it('collects nothing at all once the account switches markers off', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedChannelShare(db, 'chan-off')
    await setShareSettings(db, { share: { collectChannel: false } })

    const res = await visit(makeApp(), 'chan-off', { ref: 'newsletter' })

    expect(res.status).toBe(200)
    // Null, not '': the account chose not to collect, so there is no miss to report either.
    expect(await visitChannel(db, 'chan-off')).toBeNull()
    const share = await firstRow(db, 'SELECT views FROM shares WHERE slug = ?1', 'chan-off')
    expect(share?.views).toBe(1)
  })

  it('reports marked, unmarked and refused visits as three separate rows', async () => {
    const db = await makeDb()
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 'br-1' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1', channel: 'newsletter' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1', channel: 'newsletter' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1', channel: '' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1' })
    await seedVisit(db, { note_id: noteId, slug: 'br-1' })
    const app = makeApp()

    const body = await (await request(app, '/api/share/analytics/global?range=30d')).json()
    expect(body.channels.map((row: { name: string; count: number }) => [row.name, row.count])).toEqual([
      [CHANNEL_UNMARKED, 3],
      ['newsletter', 2],
      [CHANNEL_UNRECOGNIZED, 1],
    ])
    // Percentages share the dashboard's denominator, the same view count the KPI row shows.
    expect(body.channels[0].percentage).toBe(50)

    const note = await (await request(app, `/api/share/analytics/note/${noteId}`)).json()
    expect(note.channels.map((row: { name: string; count: number }) => [row.name, row.count])).toEqual([
      [CHANNEL_UNMARKED, 3],
      ['newsletter', 2],
      [CHANNEL_UNRECOGNIZED, 1],
    ])
  })

  it('names a directory visit after the collection whose directory sent it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 'col-visit' })
    await seedCollection(db, { type: 'folder', name: 'Field notes', slug: '0123456789abcdefghjk' })
    const channel = collectionChannelToken('0123456789abcdefghjk')
    await seedVisit(db, { note_id: noteId, slug: 'col-visit', channel })
    const app = makeApp()

    const rows = (await (await request(app, '/api/share/analytics/global?range=30d')).json()).channels
    // The reading is per collection: the marker says which directory, the label says whose — the
    // same row on the dashboard and in the note's own modal, from the one label builder.
    expect(rows.find((item: { name: string }) => item.name === channel))
      .toMatchObject({ count: 1, label: 'Field notes' })

    const noteRows = (await (await request(app, `/api/share/analytics/note/${noteId}`)).json()).channels
    expect(noteRows.find((item: { name: string }) => item.name === channel)?.label).toBe('Field notes')
  })

  it('keeps the title on a paused collection and leaves a lookalike marker unnamed', async () => {
    const db = await makeDb()
    await seedUser(db)
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 'col-paused' })
    await seedCollection(db, { type: 'tag', name: 'Research', slug: '0123456789abcdefghjk', isEnabled: 0 })
    const paused = collectionChannelToken('0123456789abcdefghjk')
    // A token the owner typed themselves that starts the same way: its slug names no collection of
    // this account, so it stays their own text instead of borrowing a directory's name.
    const stranger = collectionChannelToken('0123456789abcdefghjm')
    await seedVisit(db, { note_id: noteId, slug: 'col-paused', channel: paused })
    await seedVisit(db, { note_id: noteId, slug: 'col-paused', channel: stranger })
    const app = makeApp()

    const rows = (await (await request(app, '/api/share/analytics/global?range=30d')).json()).channels

    // Pausing a directory does not erase the visits it already brought in; its record is still how
    // those visits are named, and a lookalike is never named after a collection it is not.
    expect(rows.find((item: { name: string }) => item.name === paused)).toMatchObject({ label: 'Research' })
    expect(rows.find((item: { name: string }) => item.name === stranger)?.label).toBeUndefined()
  })

  it('keeps the marker out of the referrer fields', async () => {
    const db = await makeDb()
    await seedUser(db)
    const noteId = await seedChannelShare(db, 'chan-ref')

    await visit(makeApp(), 'chan-ref', { ref: 'newsletter' })

    // The marker answers "which copy", the referrer answers "where from": letting one stand in
    // for the other would put a token into a field the referrer cleaner owns.
    const row = await firstRow(db, 'SELECT referrer, referrer_host FROM share_visits WHERE slug = ?1', 'chan-ref')
    expect(row?.referrer).toBeNull()
    expect(row?.referrer_host).toBeNull()
    const body = await (await request(makeApp(), '/api/share/analytics/global?range=30d')).json()
    expect(body.topReferrers.map((item: { name: string }) => item.name)).toEqual(['Direct'])
    expect(noteId).toBeTruthy()
  })

  it('reports the stored marker on the visit rows the log lists', async () => {
    const db = await makeDb()
    const noteId = await seedNote(db, {})
    await seedShare(db, { note_id: noteId, slug: 'log-1' })
    await seedVisit(db, { note_id: noteId, slug: 'log-1', channel: 'newsletter', visited_at: H.now - 2000 })
    await seedVisit(db, { note_id: noteId, slug: 'log-1', channel: '', visited_at: H.now - 1000 })

    const body = await (await request(makeApp(), '/api/share/visits')).json()

    expect(body.visits.map((row: { channel: string | null }) => row.channel)).toEqual([null, 'newsletter'])
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

  it('clears one link’s whole log with the password, and refuses an empty scope instead of widening it', async () => {
    const db = await makeDb()
    await seedUser(db, USER, await hashPassword('wipe-12345678'))
    const n1 = await seedNote(db, {})
    const n2 = await seedNote(db, {})
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-1' })
    await seedVisit(db, { note_id: n1, slug: 'v-1', visitor_fp: 'fp-2' })
    await seedVisit(db, { note_id: n2, slug: 'v-2', visitor_fp: 'fp-3' })
    const app = makeApp()

    // `noteId=` must never read as "no scope": that would delete every log of the account.
    expect((await deleteJson(app, '/api/share/visits?type=all&noteId=')).status).toBe(400)
    // A narrower delete is still a whole history: same password tier as the full wipe.
    const noPassword = await deleteJson(app, `/api/share/visits?type=all&noteId=${n1}`)
    expect(noPassword.status).toBe(401)
    expect(await allRows(db, 'SELECT id FROM share_visits WHERE user_id = ?1', USER)).toHaveLength(3)
    // A filtered scope wearing a noteId would delete something other than what was asked for.
    expect((await deleteJson(app, `/api/share/visits?type=bots&noteId=${n1}`)).status).toBe(400)

    const cleared = await deleteJson(app, `/api/share/visits?type=all&noteId=${n1}`, { password: 'wipe-12345678' })
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).deleted).toBe(2)
    const left = await allRows(db, 'SELECT note_id FROM share_visits WHERE user_id = ?1', USER)
    expect(left).toEqual([{ note_id: n2 }])
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

describe('share slug consistency (SH-13)', () => {
  it('turns a concurrent slug race into 409 instead of a 500', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { id: 'race-1' })
    const n2 = await seedNote(db, { id: 'race-2' })
    const app = makeApp()

    const [resA, resB] = await Promise.all([
      postJson(app, `/api/share/${n1}`, { customSlug: 'taken-race' }),
      postJson(app, `/api/share/${n2}`, { customSlug: 'taken-race' }),
    ])
    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])
    expect((await allRows(db, 'SELECT slug FROM shares WHERE slug = ?1', 'taken-race')).length).toBe(1)
  })

  it('re-points visit rows when the slug is renamed', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { id: 'rename-1' })
    await seedShare(db, { note_id: n1, slug: 'old-name' })
    await seedVisit(db, { note_id: n1, slug: 'old-name', visitor_fp: 'fp-r' })
    const app = makeApp()

    const res = await postJson(app, `/api/share/${n1}`, { customSlug: 'new-name' })
    expect(res.status).toBe(200)
    expect((await firstRow(db, 'SELECT slug FROM share_visits WHERE note_id = ?1', n1))!.slug).toBe('new-name')

    const body = await (await request(app, '/api/share/visits?search=new-name')).json()
    expect(body.total).toBe(1)
  })

  it('revoking a share also clears its asset sessions', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = await seedNote(db, { id: 'sess-1' })
    await seedShare(db, { note_id: n1, slug: 'sess-slug' })
    await runSql(
      db,
      `INSERT INTO share_asset_sessions (id, slug, password_hash, expires_at, created_at)
       VALUES ('sas-1', 'sess-slug', 'x', ?1, ?1)`,
      H.now + 3_600_000,
    )
    const app = makeApp()

    const res = await request(app, `/api/share/${n1}`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await firstRow(db, 'SELECT id FROM share_asset_sessions WHERE slug = ?1', 'sess-slug')).toBeNull()
    expect(await firstRow(db, 'SELECT slug FROM shares WHERE note_id = ?1', n1)).toBeNull()
  })
})

describe('custom slug rejection copy (SH-84)', () => {
  async function appWithNote() {
    const db = await makeDb()
    await seedUser(db)
    const noteId = await seedNote(db, { title: 'Slug note' })
    return { db, noteId, app: makeApp() }
  }

  it('reports the real 6-64 bound instead of the stale 3-64 copy', async () => {
    const { app, noteId } = await appWithNote()
    const res = await postJson(app, `/api/share/${noteId}`, { customSlug: 'abc' })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toContain(`${LIMITS.shareSlugMinLength}-${LIMITS.shareSlugMaxLength} chars`)
    expect(body.error.message).not.toContain('3-64')
  })

  it('names the reserved list when that is the rule that was broken', async () => {
    const { app, noteId } = await appWithNote()
    const res = await postJson(app, `/api/share/${noteId}`, { customSlug: 'dashboard' })

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toMatch(/reserved/i)
  })

  it('accepts both boundary lengths and rejects one over the ceiling', async () => {
    const { app, noteId } = await appWithNote()
    const shortest = await postJson(app, `/api/share/${noteId}`, { customSlug: 'a'.repeat(LIMITS.shareSlugMinLength) })
    expect(shortest.status).toBe(200)

    const tooLong = await postJson(app, `/api/share/${noteId}`, {
      customSlug: 'b'.repeat(LIMITS.shareSlugMaxLength + 1),
    })
    expect(tooLong.status).toBe(400)

    const longest = await postJson(app, `/api/share/${noteId}`, { customSlug: 'c'.repeat(LIMITS.shareSlugMaxLength) })
    expect(longest.status).toBe(200)
  })
})
