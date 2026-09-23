import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { Env } from '../src/worker/env'
import {
  KANBAN_ORPHAN_GRACE_MS,
  reclaimOrphanKanbanFiles,
} from '../src/worker/attachments/kanban-reclaim'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const NOW = 2_000_000_000_000
const OLD = NOW - KANBAN_ORPHAN_GRACE_MS - 60_000
const FRESH = NOW - 60_000
const OWNER = 'user-1'
const OTHER = 'user-2'

interface FakeObject {
  key: string
  userId?: string
  objectId?: string
  kind?: string
  uploadedAt?: number
}

function fakeR2(objects: FakeObject[], pageSize = 1000) {
  const remaining = [...objects]
  const deleted: string[] = []

  return {
    deleted,
    list: vi.fn(async ({ prefix, cursor, limit }: { prefix?: string; cursor?: string; limit?: number } = {}) => {
      const keys = remaining
        .filter((object) => !prefix || object.key.startsWith(prefix))
        .sort((a, b) => (a.key < b.key ? -1 : 1))
      const start = cursor ? Number(cursor) : 0
      const size = Math.min(limit ?? pageSize, pageSize)
      const page = keys.slice(start, start + size)
      return {
        objects: page.map((object) => ({
          key: object.key,
          size: 10,
          uploaded: new Date(object.uploadedAt ?? OLD),
          ...(object.userId
            ? { customMetadata: { userId: object.userId, objectId: object.objectId ?? '', kind: object.kind ?? '' } }
            : {}),
        })),
        truncated: start + page.length < keys.length,
        cursor: start + page.length < keys.length ? String(start + page.length) : undefined,
      }
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        const index = remaining.findIndex((object) => object.key === key)
        if (index >= 0) remaining.splice(index, 1)
        deleted.push(key)
      }
    }),
  }
}

async function makeEnv(objects: FakeObject[], pageSize?: number) {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  const r2 = fakeR2(objects, pageSize)
  return { env: { DB: db as unknown as D1Database, FILES: r2 as never }, r2, db }
}

async function seedNote(db: D1Shim, id: string, userId: string, content: string, deletedAt: number | null = null) {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, title, title_key, content, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, 'Board', 'board', ?3, ?4, ?4, ?5)`,
    id, userId, content, NOW, deletedAt,
  )
}

function objectOf(id: string, kanbanName = 'default'): FakeObject {
  return { key: `kanban/${kanbanName}/${id}-photo.png`, userId: OWNER, objectId: id, kind: 'kanban-attachment' }
}

function urlOf(id: string, kanbanName = 'default'): string {
  return `/api/kanban/file/${kanbanName}/${id}-photo.png`
}

function keyOf(id: string, kanbanName = 'default'): string {
  return `kanban/${kanbanName}/${id}-photo.png`
}

describe('kanban R2 orphan reclaim', () => {
  it('reclaims the object no note points at and keeps the two a note still references', async () => {
    const { env, r2, db } = await makeEnv([
      objectOf('a'.repeat(26)),
      objectOf('b'.repeat(26)),
      objectOf('c'.repeat(26)),
    ])
    await seedNote(db, 'n-1', OWNER, `board ${JSON.stringify({ url: urlOf('b'.repeat(26)) })}`)
    await seedNote(db, 'n-2', OWNER, `stored ${JSON.stringify({ r2Key: keyOf('c'.repeat(26)) })}`)

    const result = await reclaimOrphanKanbanFiles(env, { now: NOW })

    expect(r2.deleted).toEqual([keyOf('a'.repeat(26))])
    expect(result).toMatchObject({ scanned: 3, reclaimed: 1, retained: 2, deferred: 0, skipped: 0 })
  })

  it('keeps objects uploaded inside the grace window', async () => {
    const { env, r2, db } = await makeEnv([
      { ...objectOf('a'.repeat(26)), uploadedAt: FRESH },
      objectOf('b'.repeat(26)),
    ])
    await seedNote(db, 'n-1', OWNER, 'no references here')

    const result = await reclaimOrphanKanbanFiles(env, { now: NOW })

    expect(r2.deleted).toEqual([keyOf('b'.repeat(26))])
    expect(result).toMatchObject({ scanned: 2, reclaimed: 1, skipped: 1 })
  })

  it('keeps objects it cannot attribute to an account', async () => {
    const { env, r2, db } = await makeEnv([
      { key: keyOf('a'.repeat(26)) },
      { ...objectOf('b'.repeat(26)), kind: 'something-else' },
    ])
    await seedNote(db, 'n-1', OWNER, 'no references here')

    const result = await reclaimOrphanKanbanFiles(env, { now: NOW })

    expect(r2.deleted).toEqual([])
    expect(result).toMatchObject({ scanned: 2, reclaimed: 0, skipped: 2 })
  })

  it('reclaims on the next pass once the note that referenced the file is gone', async () => {
    const { env, r2, db } = await makeEnv([objectOf('a'.repeat(26))])
    await seedNote(db, 'n-1', OWNER, JSON.stringify({ url: urlOf('a'.repeat(26)) }))

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(0)

    await runSql(db, `DELETE FROM notes WHERE id = 'n-1'`)

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(1)
    expect(r2.deleted).toEqual([keyOf('a'.repeat(26))])
  })

  it('counts a note in the trash as a reference', async () => {
    const { env, r2, db } = await makeEnv([objectOf('a'.repeat(26))])
    await seedNote(db, 'n-1', OWNER, JSON.stringify({ url: urlOf('a'.repeat(26)) }), NOW)

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).retained).toBe(1)
    expect(r2.deleted).toEqual([])
  })

  it('decides by the account that uploaded the object, not by whoever mentions it', async () => {
    const { env, r2, db } = await makeEnv([objectOf('a'.repeat(26))])
    // Another account naming the key cannot read it either: /api/kanban/file checks the
    // stored owner, so honouring that reference would only pile up bytes nobody can serve.
    await seedNote(db, 'n-1', OTHER, JSON.stringify({ url: urlOf('a'.repeat(26)) }))

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(1)
  })

  it('keeps files a published template or blog post of the same account still embeds', async () => {
    const { env, r2, db } = await makeEnv([objectOf('a'.repeat(26)), objectOf('b'.repeat(26))])
    await runSql(
      db,
      `INSERT INTO community_templates (id, author_id, author_name, name, content, created_at)
       VALUES ('t-1', ?1, 'Author', 'Board', ?2, ?3)`,
      OWNER, JSON.stringify({ url: urlOf('a'.repeat(26)) }), NOW,
    )
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
       VALUES ('p-1', 'board', 'n-1', ?1, 'Board', ?2, ?3, ?3, ?3)`,
      OWNER, JSON.stringify({ url: urlOf('b'.repeat(26)) }), NOW,
    )

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(0)
    expect(r2.deleted).toEqual([])
  })

  it('leaves the rest of the pile to the next pass once the per-run budget is spent', async () => {
    const ids = Array.from({ length: 5 }, (_, index) => String(index + 1).repeat(26))
    const { env, r2, db } = await makeEnv(ids.map((id) => objectOf(id)))
    await seedNote(db, 'n-1', OWNER, 'no references here')

    const result = await reclaimOrphanKanbanFiles(env, { now: NOW, limit: 2 })

    expect(result).toMatchObject({ reclaimed: 2, deferred: 3 })
    expect(r2.deleted).toEqual(ids.slice(0, 2).map((id) => keyOf(id)))
  })

  it('never touches objects outside the kanban namespace', async () => {
    const { env, r2, db } = await makeEnv([
      objectOf('a'.repeat(26)),
      { key: `images/2026-09-01/${OWNER}/x.png`, userId: OWNER, objectId: 'b'.repeat(26), kind: 'attachment' },
    ])
    await seedNote(db, 'n-1', OWNER, 'no references here')

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(1)
    expect(r2.deleted).toEqual([keyOf('a'.repeat(26))])
  })

  it('does nothing without an R2 binding instead of throwing', async () => {
    const db = createDb()
    for (const statement of TABLE_STATEMENTS) await runSql(db, statement)

    expect(await reclaimOrphanKanbanFiles({ DB: db as unknown as D1Database }, { now: NOW }))
      .toEqual({ scanned: 0, reclaimed: 0, retained: 0, deferred: 0, skipped: 0 })
  })

  it('walks every page of the namespace instead of stopping at the first', async () => {
    const ids = Array.from({ length: 4 }, (_, index) => String(index + 1).repeat(26))
    const { env, r2, db } = await makeEnv(ids.map((id) => objectOf(id)), 1)
    await seedNote(db, 'n-1', OWNER, JSON.stringify({ url: urlOf(ids[1]!) }))

    expect((await reclaimOrphanKanbanFiles(env, { now: NOW })).reclaimed).toBe(3)
    expect(r2.deleted.sort()).toEqual(ids.filter((id) => id !== ids[1]).map((id) => keyOf(id)).sort())
  })

  it('is wired into the cron so the stored pile actually shrinks', () => {
    expect(readFileSync('src/worker/index.ts', 'utf8')).toContain('runKanbanFileReclaim')
  })
})
