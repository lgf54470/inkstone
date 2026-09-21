import { describe, expect, it } from 'vitest'
import {
  SHARE_VISIT_SOURCE,
  aggregateFromRows,
  visitAggregateFromResults,
  visitAggregateStatements,
  type VisitAggregate,
  type VisitAggregateQuery,
  type VisitFactRow,
  type VisitScope,
} from '../src/worker/lib/visit-aggregates'
import { captureSql, createD1Database, runSql, type D1Shim } from './d1-harness'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.now()
const QUERY: VisitAggregateQuery = {
  range: 'all',
  startTs: NOW - 30 * DAY_MS,
  duration: 30 * DAY_MS,
  clause: ' AND is_bot = 0',
}

interface VisitSeed {
  user_id?: string
  note_id: string
  slug: string
  visited_at: number
  visitor_fp?: string | null
  country?: string | null
  referrer_host?: string | null
  device_type?: string | null
  os?: string | null
  browser?: string | null
  is_bot?: number
}

const VISITS: VisitSeed[] = [
  // In scope: two visitors on note-a (one of them twice), one empty-fp visit on
  // note-b, and a visit the clock put past the window, which the totals still count.
  { note_id: 'note-a', slug: 'note-a-v2', visited_at: NOW - DAY_MS, visitor_fp: 'f1', country: 'us', referrer_host: 'github.com', device_type: 'mobile', os: 'iOS', browser: 'Safari' },
  { note_id: 'note-a', slug: 'note-a-v1', visited_at: NOW - DAY_MS + 3_000, visitor_fp: 'f1' },
  { note_id: 'note-b', slug: 'b', visited_at: NOW - 10 * DAY_MS, country: 'CN', device_type: 'tablet', os: 'Windows' },
  { note_id: 'note-b', slug: 'b2', visited_at: NOW - 10 * DAY_MS + 4_000, visitor_fp: '', country: 'cn' },
  { note_id: 'note-a', slug: 'note-a-v2', visited_at: NOW + 5 * DAY_MS, visitor_fp: 'ffuture', country: 'fr' },
  // Out of scope: a bot, another owner, and a visit before the window opens.
  { note_id: 'note-a', slug: 'note-a-v2', visited_at: NOW - 2 * DAY_MS, visitor_fp: 'fbot', country: 'de', is_bot: 1 },
  { note_id: 'note-c', slug: 'c', visited_at: NOW - 3 * DAY_MS, visitor_fp: 'fx', user_id: 'u2' },
  { note_id: 'note-a', slug: 'note-a-v1', visited_at: QUERY.startTs - 1_000, visitor_fp: 'fold' },
]

async function makeDb(): Promise<D1Shim> {
  const db = createD1Database(`
    CREATE TABLE IF NOT EXISTS share_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      visited_at INTEGER NOT NULL,
      visitor_fp TEXT,
      country TEXT,
      region TEXT,
      city TEXT,
      referrer TEXT,
      referrer_host TEXT,
      device_type TEXT,
      os TEXT,
      browser TEXT,
      language TEXT,
      user_agent TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      is_self_referrer INTEGER NOT NULL DEFAULT 0,
      is_owner INTEGER NOT NULL DEFAULT 0
    )
  `)
  for (const visit of VISITS) {
    await runSql(
      db,
      `INSERT INTO share_visits (user_id, note_id, slug, visited_at, visitor_fp, country, referrer_host, device_type, os, browser, is_bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      visit.user_id ?? 'u1',
      visit.note_id,
      visit.slug,
      visit.visited_at,
      visit.visitor_fp ?? null,
      visit.country ?? null,
      visit.referrer_host ?? null,
      visit.device_type ?? null,
      visit.os ?? null,
      visit.browser ?? null,
      visit.is_bot ?? 0,
    )
  }
  return db
}

// The row path is what a bounded range answers with, so asking the same builder
// for a bounded range yields exactly the rows the SQL path has to summarize.
async function rowPathAggregate(db: D1Shim, scope: VisitScope): Promise<VisitAggregate> {
  const [statement] = visitAggregateStatements(db, SHARE_VISIT_SOURCE, scope, { ...QUERY, range: '7d' })
  const result = await statement.run()
  return aggregateFromRows((result.results ?? []) as VisitFactRow[], QUERY, SHARE_VISIT_SOURCE)
}

async function sqlPathAggregate(db: D1Shim, scope: VisitScope): Promise<VisitAggregate> {
  const results = await db.batch(visitAggregateStatements(db, SHARE_VISIT_SOURCE, scope, QUERY))
  return visitAggregateFromResults(results, QUERY, SHARE_VISIT_SOURCE)
}

describe('visit aggregates: SQL path matches the row path', () => {
  it('answers the same totals, buckets, distributions and targets for a global scope', async () => {
    const db = await makeDb()
    expect(await sqlPathAggregate(db, { userId: 'u1' })).toEqual(await rowPathAggregate(db, { userId: 'u1' }))
  })

  it('answers the same aggregates for a per-note scope', async () => {
    const db = await makeDb()
    expect(await sqlPathAggregate(db, { userId: 'u1', targetId: 'note-a' }))
      .toEqual(await rowPathAggregate(db, { userId: 'u1', targetId: 'note-a' }))
  })

  it('counts the seeded visits the way the dashboards show them', async () => {
    const db = await makeDb()
    const aggregate = await sqlPathAggregate(db, { userId: 'u1' })
    const totals = (map: Map<string, number>): Record<string, number> => Object.fromEntries(map)

    expect(aggregate.views).toBe(5)
    expect(aggregate.visitors).toBe(2)
    expect(totals(aggregate.countries)).toEqual({ US: 1, UNKNOWN: 1, CN: 2, FR: 1 })
    expect(totals(aggregate.referrers)).toEqual({ 'github.com': 1, Direct: 4 })
    expect(totals(aggregate.devices)).toEqual({ mobile: 1, desktop: 3, tablet: 1 })
    expect(totals(aggregate.osList)).toEqual({ iOS: 1, other: 3, Windows: 1 })
    expect(totals(aggregate.browsers)).toEqual({ Safari: 1, Other: 4 })
    expect(aggregate.targets).toEqual(new Map([
      ['note-a', { views: 3, visitors: 2, slug: 'note-a-v2' }],
      ['note-b', { views: 2, visitors: 0, slug: 'b2' }],
    ]))
  })

  it('leaves the out-of-window visit in the totals but out of every bucket', async () => {
    const db = await makeDb()
    const aggregate = await sqlPathAggregate(db, { userId: 'u1' })
    // 12 monthly-ish buckets over the whole window; the out-of-window visit is
    // counted in the totals only, so the buckets sum to one less than `views`.
    expect(aggregate.buckets.length).toBe(12)
    expect(aggregate.buckets.reduce((sum, b) => sum + b.views, 0)).toBe(4)
    expect(aggregate.buckets[8]).toEqual({ views: 2, visitors: 0 })
    expect(aggregate.buckets[11]).toEqual({ views: 2, visitors: 1 })
    expect(aggregate.buckets.filter((_, i) => i !== 8 && i !== 11).every((b) => b.views === 0)).toBe(true)
  })

  it('answers zero rows with zero-filled buckets on both paths', async () => {
    const db = await makeDb()
    const empty = { userId: 'nobody' }
    const aggregate = await sqlPathAggregate(db, empty)
    expect(aggregate).toEqual(await rowPathAggregate(db, empty))
    expect(aggregate.views).toBe(0)
    expect(aggregate.visitors).toBe(0)
    expect(aggregate.buckets.every((b) => b.views === 0 && b.visitors === 0)).toBe(true)
    expect(aggregate.countries.size).toBe(0)
    expect(aggregate.targets.size).toBe(0)
  })
})

/**
 * SH-74: an unbounded range is summarized in SQL rather than by fetching rows, and that
 * budget is what makes the request expensive rather than free. Measured on node:sqlite over
 * 200,000 visit rows for one account, the eight statements cost ~1.25 s of CPU and the cost
 * grows linearly with the account's history (the heaviest single pass is the per-target
 * GROUP BY at ~246 ms). A cache needs state the worker is not allowed to keep in-process
 * (check-module-state forbids module-scope mutable bindings), so the cost is currently held
 * still rather than amortized: this pins the budget so a ninth pass has to be a deliberate act.
 */
describe('all-range aggregate statement budget (SH-74)', () => {
  it('summarizes an unbounded range in eight statements and never fetches visit rows', () => {
    const db = createD1Database()
    const seen = captureSql(db)

    const statements = visitAggregateStatements(db, SHARE_VISIT_SOURCE, { userId: 'u1' }, QUERY)

    expect(statements).toHaveLength(8)
    expect(seen).toHaveLength(8)
    expect(seen.filter((sql) => sql.startsWith('SELECT visited_at, visitor_fp'))).toEqual([])
    expect(seen.filter((sql) => sql.includes('GROUP BY'))).toHaveLength(7)
  })

  it('answers a bounded range by fetching rows, in exactly one statement', () => {
    const db = createD1Database()
    const seen = captureSql(db)

    const statements = visitAggregateStatements(db, SHARE_VISIT_SOURCE, { userId: 'u1' }, { ...QUERY, range: '7d' })

    expect(statements).toHaveLength(1)
    expect(seen[0]).toMatch(/^SELECT visited_at, visitor_fp/)
  })
})
