import { afterEach, describe, expect, it, vi } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Database, queryRows, runSql } from './d1-harness'
import { auditFtsIndex, auditFtsIndexes, drainFtsQueue, rebuildFtsIndex } from '../src/worker/db/fts'
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
  userId = 'u',
): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO notes (id, user_id, title, content, rev, content_hash, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
    id,
    userId,
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

// A delete that matches nothing used to be indistinguishable from a delete that worked: the index
// kept the old body, kept growing a row per rebuild, and every check downstream read the lie back.
// The audit is the question that was missing — does the index still look like the notes?
describe('full text index audit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a rebuilt index as holding one row per live note', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await insertNote(db, 'n2', 'Second', 'beta body')
    await rebuildFtsIndex(db, 'u')

    expect(await auditFtsIndex(db, 'u')).toEqual({
      notes: 2,
      rows: 2,
      indexed: 2,
      duplicateRows: 0,
      orphanRows: 0,
    })
  })

  it('counts the extra rows and the rows whose note is gone', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await insertNote(db, 'n2', 'Second', 'beta body')
    await rebuildFtsIndex(db, 'u')
    await runSql(
      db as never,
      `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('n1', 'u', 'First', 'alpha body')`,
    )
    await runSql(db as never, `UPDATE notes SET deleted_at = 3000 WHERE id = 'n2'`)

    expect(await auditFtsIndex(db, 'u')).toEqual({
      notes: 1,
      rows: 3,
      indexed: 2,
      duplicateRows: 1,
      orphanRows: 1,
    })
  })

  it('holds a note that only the index still knows about to the accounts the audit walks', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await rebuildFtsIndex(db, 'u')

    expect(await auditFtsIndex(db, 'someone-else')).toEqual({
      notes: 0,
      rows: 0,
      indexed: 0,
      duplicateRows: 0,
      orphanRows: 0,
    })
  })

  it('reads the index as healthy again once a rebuild has repaired it', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await rebuildFtsIndex(db, 'u')
    await runSql(
      db as never,
      `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('n1', 'u', 'First', 'alpha body')`,
    )

    await rebuildFtsIndex(db, 'u')
    const audit = await auditFtsIndex(db, 'u')
    expect(audit.duplicateRows).toBe(0)
    expect(audit.rows).toBe(1)
  })

  it('fails a rebuild that could not delete the rows it replaced', async () => {
    const db = makeDb()
    await insertNote(db, 'n1', 'First', 'alpha body')
    await rebuildFtsIndex(db, 'u')
    // The premise the old delete rested on, restored: `note_id` outside the index, so a delete that
    // reaches the row through MATCH matches nothing and an already-indexed note stays behind. The
    // next rebuild must not report success over the row it could not replace.
    await runSql(db as never, 'DROP TABLE notes_fts')
    await runSql(
      db as never,
      `CREATE VIRTUAL TABLE notes_fts USING fts5(
        note_id UNINDEXED, user_id UNINDEXED, title, body,
        tokenize = "unicode61 remove_diacritics 2"
      )`,
    )
    await runSql(
      db as never,
      `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('n1', 'u', 'First', 'alpha body')`,
    )

    await expect(rebuildFtsIndex(db, 'u')).rejects.toThrow(/did not converge.*1 rows beyond the first/)
  })

  it('warns about a drifted account and rotates through the accounts that own notes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = makeDb()
    await insertNote(db, 'a1', 'First', 'alpha body', 1, 1000, 'a')
    await insertNote(db, 'b1', 'Other', 'beta body', 1, 1000, 'b')
    await rebuildFtsIndex(db, 'a')
    await rebuildFtsIndex(db, 'b')
    await runSql(
      db as never,
      `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('b1', 'b', 'Other', 'beta body')`,
    )

    expect(await auditFtsIndexes(db, 1)).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    expect(await auditFtsIndexes(db, 1)).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[1]).toContain('1 rows beyond the first')
  })
})
