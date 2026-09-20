import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Database, queryRows, runSql } from './d1-harness'
import { drainFtsQueue, rebuildFtsIndex } from '../src/worker/db/fts'
import { FTS_STATEMENT, SCHEMA_STATEMENTS } from '../src/worker/db/schema/statements'

// The schema under test is the one the Worker creates, not a hand-written copy: a copy here
// once declared note_id as an indexed column while production marked it UNINDEXED, so the
// deletes that reach the index through `MATCH('note_id : …')` matched rows in the test and
// nothing at all in production.
function makeDb(): D1Database {
  return createD1Database([...SCHEMA_STATEMENTS, FTS_STATEMENT].join(';\n')) as unknown as D1Database
}

async function insertNote(
  db: D1Database,
  id: string,
  title: string,
  content: string,
  rev = 1,
  at = 1000,
): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO notes (id, user_id, title, content, rev, content_hash, created_at, updated_at)
      VALUES (?1, 'u', ?2, ?3, ?4, ?5, ?6, ?6)`,
    id,
    title,
    content,
    rev,
    `hash-${rev}`,
    at,
  )
}

async function editNote(db: D1Database, id: string, title: string, content: string, rev: number): Promise<void> {
  await runSql(
    db as never,
    `UPDATE notes SET title = ?2, content = ?3, rev = ?4, content_hash = ?5, updated_at = ?6 WHERE id = ?1`,
    id,
    title,
    content,
    rev,
    `hash-${rev}`,
    1000 + rev,
  )
}

async function enqueue(db: D1Database, noteId: string, kind: 'upsert' | 'delete', at = 2000): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at) VALUES ('u', ?1, ?2, ?3)`,
    noteId,
    kind,
    at,
  )
}

async function indexedIds(db: D1Database): Promise<string[]> {
  const rows = await queryRows(db as never, 'SELECT note_id FROM notes_fts ORDER BY note_id')
  return rows.map((row) => row.note_id as string)
}

async function idsMatching(db: D1Database, token: string): Promise<string[]> {
  const rows = await queryRows(db as never, 'SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?1', `"${token}"`)
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

  it('heals an index that already carries duplicate rows for one note', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await rebuildFtsIndex(db, 'u')
    await runSql(
      db as never,
      `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('n1', 'u', 'First', 'alpha body')`,
    )
    expect(await indexedIds(db)).toEqual(['n1', 'n1'])

    await rebuildFtsIndex(db, 'u')
    expect(await indexedIds(db)).toEqual(['n1'])
  })

  it('drops the previous body when the note changed before the next rebuild reads it', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'oldneedle body')
    await rebuildFtsIndex(db, 'u')
    await editNote(db, 'n1', 'First', 'newneedle body', 2)

    await rebuildFtsIndex(db, 'u')
    expect(await idsMatching(db, 'newneedle')).toEqual(['n1'])
    expect(await idsMatching(db, 'oldneedle')).toEqual([])
  })

  it('replaces the indexed row when the queue carries an upsert', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'oldneedle body')
    await rebuildFtsIndex(db, 'u')
    await editNote(db, 'n1', 'First', 'newneedle body', 2)
    await enqueue(db, 'n1', 'upsert')

    expect(await drainFtsQueue(db, 'u', 5, true)).toBe(1)
    expect(await indexedIds(db)).toEqual(['n1'])
    expect(await idsMatching(db, 'newneedle')).toEqual(['n1'])
    expect(await idsMatching(db, 'oldneedle')).toEqual([])
    expect(await queueSize(db)).toBe(0)
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
})
