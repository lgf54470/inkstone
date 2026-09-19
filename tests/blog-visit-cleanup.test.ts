import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { purgeExpiredOperationalData } from '../src/worker/lib/maintenance'
import { createD1Database as createDb, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const NOW = 2_000_000_000_000
const USER = 'user-1'

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

async function seedPost(db: D1Shim, id: string, slug: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, tags, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?2, 'body', '[]', ?5, ?5, ?5)`,
    id, slug, `note-${id}`, USER, NOW,
  )
}

async function seedVisit(db: D1Shim, postId: string, slug: string, visitedAt: number): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, is_bot, is_self_referrer, is_owner)
     VALUES (?1, ?2, ?3, ?4, ?2, 0, 0, 0)`,
    USER, postId, slug, visitedAt,
  )
}

async function survivingSlugs(db: D1Shim): Promise<string[]> {
  const rows = await allRows(db, 'SELECT slug FROM blog_visits ORDER BY visited_at, slug')
  return rows.map((row) => String(row.slug))
}

describe('blog visit log orphan sweep (SH-05b)', () => {
  it('deletes rows whose post is gone and keeps rows of live posts', async () => {
    const db = await makeDb()
    await seedPost(db, 'p-alive', 'alive')
    await seedVisit(db, 'p-alive', 'alive', NOW - 400 * 24 * 60 * 60 * 1000)
    await seedVisit(db, 'p-gone', 'ghost', NOW - 400 * 24 * 60 * 60 * 1000)

    const result = await purgeExpiredOperationalData(db as unknown as D1Database, NOW)

    expect(await survivingSlugs(db)).toEqual(['alive'])
    expect(result.orphanBlogVisits).toBe(1)
  })

  it('sweeps the oldest orphans first and finishes the backlog on later ticks', async () => {
    const db = await makeDb()
    await seedVisit(db, 'p-gone', 'oldest', NOW - 3 * 24 * 60 * 60 * 1000)
    await seedVisit(db, 'p-gone', 'middle', NOW - 2 * 24 * 60 * 60 * 1000)
    await seedVisit(db, 'p-gone', 'newest', NOW - 24 * 60 * 60 * 1000)

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW, 2)
    expect(await survivingSlugs(db)).toEqual(['newest'])

    await purgeExpiredOperationalData(db as unknown as D1Database, NOW, 2)
    expect(await survivingSlugs(db)).toEqual([])
  })
})
