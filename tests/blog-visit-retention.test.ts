import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { purgeExpiredOperationalData } from '../src/worker/lib/maintenance'
import { createD1Database as createDb, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 2_000_000_000_000
const OWNER = 'user-1'
const OTHER = 'user-2'

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

/** `settings` is written verbatim, so a test can store a corrupt document too. */
async function seedUser(db: D1Shim, id: string, settings: unknown): Promise<void> {
  const raw = typeof settings === 'string' ? settings : JSON.stringify(settings)
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, settings, created_at, last_seen_at)
     VALUES (?1, ?1, 'hash', 'login', 'Author', '', ?2, ?3, ?3)`,
    id, raw, NOW,
  )
}

/** A visit needs its post to stay, otherwise the orphan sweep deletes it first. */
async function seedVisit(db: D1Shim, slug: string, visitedAt: number, userId = OWNER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?2, '', ?5, ?5, ?5)`,
    `post-${slug}`, slug, `note-${slug}`, userId, NOW,
  )
  await runSql(
    db,
    `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, country)
     VALUES (?1, ?2, ?3, ?4, ?5, 'US')`,
    userId, `post-${slug}`, slug, visitedAt, `fp-${slug}`,
  )
}

async function survivingSlugs(db: D1Shim): Promise<string[]> {
  const rows = await allRows(db, 'SELECT slug FROM blog_visits ORDER BY visited_at, slug')
  return rows.map((row) => String(row.slug))
}

describe('blog visit log retention sweep (SH-43)', () => {
  it('deletes rows past the retention the account stored and keeps newer ones', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 7 } })
    await seedVisit(db, 'stale', NOW - 8 * DAY_MS)
    await seedVisit(db, 'fresh', NOW - 6 * DAY_MS)

    const result = await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['fresh'])
    expect(result.blogVisitLogs).toBe(1)
  })

  it('keeps every row for an account that chose unlimited retention', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 0 } })
    await seedVisit(db, 'ancient', NOW - 3_650 * DAY_MS)

    const result = await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['ancient'])
    expect(result.blogVisitLogs).toBe(0)
  })

  it('sweeps at the default when the stored settings carry no blog section', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, {})
    await seedVisit(db, 'past-default', NOW - 31 * DAY_MS)
    await seedVisit(db, 'inside-default', NOW - 29 * DAY_MS)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['inside-default'])
  })

  it('judges every account by its own retention', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 7 } })
    await seedUser(db, OTHER, { blog: { visitLogRetentionDays: 365 } })
    await seedVisit(db, 'short-window', NOW - 30 * DAY_MS)
    await seedVisit(db, 'long-window', NOW - 30 * DAY_MS, OTHER)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['long-window'])
  })

  it('sweeps the oldest rows first and finishes the backlog on later ticks', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 7 } })
    await seedVisit(db, 'oldest', NOW - 30 * DAY_MS)
    await seedVisit(db, 'middle', NOW - 20 * DAY_MS)
    await seedVisit(db, 'newest-stale', NOW - 10 * DAY_MS)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW, 2)
    expect(await survivingSlugs(db)).toEqual(['newest-stale'])

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW, 2)
    expect(await survivingSlugs(db)).toEqual([])
  })

  it('sweeps a visit whose account row is gone instead of keeping it forever', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, {})
    await seedVisit(db, 'deleted-owner', NOW - 31 * DAY_MS, 'account-gone')
    await seedVisit(db, 'kept', NOW - DAY_MS)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['kept'])
  })

  it('falls back to the default retention when the stored settings are not JSON', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, 'not json at all')
    await seedVisit(db, 'past-default', NOW - 31 * DAY_MS)
    await seedVisit(db, 'inside-default', NOW - 29 * DAY_MS)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['inside-default'])
  })

  it('leaves a retention value the sweep cannot parse alone rather than deleting everything', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 'last week' } })
    await seedVisit(db, 'old-but-unparsable', NOW - 400 * DAY_MS)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['old-but-unparsable'])
  })

  it('still sweeps visits whose post was deleted regardless of retention', async () => {
    const db = await makeDb()
    await seedUser(db, OWNER, { blog: { visitLogRetentionDays: 0 } })
    await seedVisit(db, 'alive', NOW - 400 * DAY_MS)
    await runSql(db, 'DELETE FROM blog_posts WHERE slug = ?1', 'alive')

    const result = await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual([])
    expect(result.orphanBlogVisits).toBe(1)
  })
})
