import { describe, expect, it } from 'vitest'
import { createD1Database, queryFirst, type D1Shim } from './d1-harness'
import { createScopedTag } from '../src/worker/lib/scoped-organizer'

const TAG_TABLE = `
  CREATE TABLE IF NOT EXISTS blog_tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, name)
  );
  CREATE TABLE IF NOT EXISTS share_tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, name)
  );
`

const FIXED_ID = 'a'.repeat(26)
const USER = 'user-1'

async function tagCount(db: D1Shim, table = 'blog_tags'): Promise<number> {
  const row = await queryFirst(db, `SELECT COUNT(*) AS n FROM ${table}`)
  return Number(row?.n ?? 0)
}

describe('createScopedTag', () => {
  it('inserts a new tag with keep-existing mode', async () => {
    const db = createD1Database(TAG_TABLE)
    const result = await createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: FIXED_ID, name: 'Alpha', color: '#ff0000' })
    expect(result.status).toBe(201)
    expect(result.tag).toMatchObject({ id: FIXED_ID, userId: USER, name: 'Alpha', color: '#ff0000', isPinned: false })
    expect(await tagCount(db)).toBe(1)
  })

  it('returns the existing tag when keep-existing hits a duplicate', async () => {
    const db = createD1Database(TAG_TABLE)
    await createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: FIXED_ID, name: 'Alpha', color: '#ff0000' })
    const second = await createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: 'b'.repeat(26), name: 'Alpha', color: '#00ff00' })
    expect(second.status).toBe(200)
    expect(second.tag.id).toBe(FIXED_ID)
    expect(second.tag.color).toBe('#ff0000')
    expect(await tagCount(db)).toBe(1)
  })

  it('keeps the same name isolated per user', async () => {
    const db = createD1Database(TAG_TABLE)
    await createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: FIXED_ID, name: 'Alpha' })
    const other = await createScopedTag(db as never, 'blog_tags', 'keep-existing', 'user-2', { id: 'c'.repeat(26), name: 'Alpha' })
    expect(other.status).toBe(201)
    expect(await tagCount(db)).toBe(2)
  })

  it('upsert updates the color of an existing tag and keeps its id', async () => {
    const db = createD1Database(TAG_TABLE)
    await createScopedTag(db as never, 'blog_tags', 'upsert', USER, { id: FIXED_ID, name: 'Beta', color: '#111111' })
    const second = await createScopedTag(db as never, 'blog_tags', 'upsert', USER, { id: 'd'.repeat(26), name: 'Beta', color: '#222222' })
    expect(second.status).toBe(201)
    expect(second.tag.id).toBe(FIXED_ID)
    expect(second.tag.color).toBe('#222222')
    expect(await tagCount(db)).toBe(1)
  })

  it('applies to other hub tables', async () => {
    const db = createD1Database(TAG_TABLE)
    const result = await createScopedTag(db as never, 'share_tags', 'keep-existing', USER, { id: FIXED_ID, name: 'Shared' })
    expect(result.status).toBe(201)
    expect(await tagCount(db, 'share_tags')).toBe(1)
  })

  it('truncates over-long names to the 50-char limit', async () => {
    const db = createD1Database(TAG_TABLE)
    const result = await createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: FIXED_ID, name: 'x'.repeat(80) })
    expect(result.tag.name).toHaveLength(50)
  })

  it('rejects an empty name', async () => {
    const db = createD1Database(TAG_TABLE)
    await expect(
      createScopedTag(db as never, 'blog_tags', 'keep-existing', USER, { id: FIXED_ID, name: '   ' }),
    ).rejects.toThrow(/required/i)
    expect(await tagCount(db)).toBe(0)
  })
})
