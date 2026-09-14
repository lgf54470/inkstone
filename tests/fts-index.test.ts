import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Database, queryRows, runSql } from './d1-harness'
import { drainFtsQueue, rebuildFtsIndex } from '../src/worker/db/fts'

const SCHEMA = `
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    rev INTEGER NOT NULL DEFAULT 1,
    content_hash TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id,
    user_id UNINDEXED,
    title,
    body,
    tokenize = "unicode61 remove_diacritics 2"
  );
  CREATE TABLE fts_index_queue (
    user_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`

function makeDb(): D1Database {
  return createD1Database(SCHEMA) as unknown as D1Database
}

async function insertNote(db: D1Database, id: string, title: string, content: string): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO notes (id, user_id, title, content, rev, content_hash, updated_at)
      VALUES (?1, 'u', ?2, ?3, 1, ?4, 1000)`,
    id,
    title,
    content,
    `hash-${id}`,
  )
}

async function enqueue(db: D1Database, noteId: string, kind: 'upsert' | 'delete'): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at) VALUES ('u', ?1, ?2, 2000)`,
    noteId,
    kind,
  )
}

async function indexedIds(db: D1Database): Promise<string[]> {
  const rows = await queryRows(db as never, 'SELECT note_id FROM notes_fts ORDER BY note_id')
  return rows.map((row) => row.note_id as string)
}

async function queueSize(db: D1Database): Promise<number> {
  const rows = await queryRows(db as never, 'SELECT 1 AS pending FROM fts_index_queue')
  return rows.length
}

describe('full text index maintenance', () => {
  it('replaces each note instead of duplicating rows when the index is rebuilt', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await insertNote(db, 'n2', 'Second', 'beta body')

    expect(await rebuildFtsIndex(db, 'u')).toBe(2)
    expect(await rebuildFtsIndex(db, 'u')).toBe(2)
    expect(await indexedIds(db)).toEqual(['n1', 'n2'])
  })

  it('drops the indexed row when the queue carries a delete', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await insertNote(db, 'n2', 'Second', 'beta body')
    await rebuildFtsIndex(db, 'u')
    await enqueue(db, 'n1', 'delete')

    expect(await drainFtsQueue(db, 'u', 5, true)).toBe(1)
    expect(await indexedIds(db)).toEqual(['n2'])
    expect(await queueSize(db)).toBe(0)
  })

  it('replaces the indexed row when the queue carries an upsert', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await rebuildFtsIndex(db, 'u')
    await enqueue(db, 'n1', 'upsert')

    expect(await drainFtsQueue(db, 'u', 5, true)).toBe(1)
    expect(await indexedIds(db)).toEqual(['n1'])
    expect(await queueSize(db)).toBe(0)
  })
})
