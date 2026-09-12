import { describe, expect, it } from 'vitest'

import { createD1Database, runSql } from './d1-harness'

describe('d1-harness batch atomicity', () => {
  it('rolls back the whole batch when a statement fails mid-way', async () => {
    const db = createD1Database('CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT);')
    await runSql(db, "INSERT INTO items (id, value) VALUES ('existing', 'keep')")

    const batch = [
      db.prepare('INSERT INTO items (id, value) VALUES (?1, ?2)').bind('a', '1'),
      db.prepare('INSERT INTO items (id, value) VALUES (?1, ?2)').bind('existing', 'conflict'),
      db.prepare('INSERT INTO items (id, value) VALUES (?1, ?2)').bind('c', '3'),
    ]
    await expect(db.batch(batch)).rejects.toThrow()

    const rows = (await db.prepare('SELECT id FROM items').all()).results
    expect(rows.map((row) => row.id)).toEqual(['existing'])
  })

  it('commits every statement when the batch succeeds', async () => {
    const db = createD1Database('CREATE TABLE items2 (id TEXT PRIMARY KEY);')
    await db.batch([
      db.prepare('INSERT INTO items2 (id) VALUES (?1)').bind('a'),
      db.prepare('INSERT INTO items2 (id) VALUES (?1)').bind('b'),
    ])
    const row = await db.prepare('SELECT COUNT(*) AS n FROM items2').first() as { n: number }
    expect(row.n).toBe(2)
  })
})
