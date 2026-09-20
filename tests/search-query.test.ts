import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Database, runSql } from './d1-harness'
import { rebuildFtsIndex } from '../src/worker/db/fts'
import { FTS_STATEMENT, SCHEMA_STATEMENTS } from '../src/worker/db/schema/statements'
import { searchUserNotes } from '../src/worker/routes/search/helpers'

function makeDb(): D1Database {
  return createD1Database([...SCHEMA_STATEMENTS, FTS_STATEMENT].join(';\n')) as unknown as D1Database
}

async function insertNote(db: D1Database, id: string, title: string, content: string): Promise<void> {
  await runSql(
    db as never,
    `INSERT INTO notes (id, user_id, title, content, rev, content_hash, created_at, updated_at)
      VALUES (?1, 'u', ?2, ?3, 1, 'hash', 1000, 1000)`,
    id,
    title,
    content,
  )
}

async function searchedIds(db: D1Database, query: string): Promise<string[]> {
  const result = await searchUserNotes(db, 'u', query, 10, true)
  return result.results.map((hit) => hit.note.id)
}

describe('full text search queries', () => {
  it('answers a term that only a note id holds with nothing', async () => {
    const db = makeDb()
    await insertNote(db, 'floorneedle', 'Plain title', 'plain body without the search term')
    await insertNote(db, 'note-2', 'Other', 'nothing to see here')
    await rebuildFtsIndex(db, 'u')

    expect(await searchedIds(db, 'floorneedle')).toEqual([])
  })

  it('still finds the note whose title or body holds the term', async () => {
    const db = makeDb()
    await insertNote(db, 'floorneedle', 'Plain title', 'plain body without the search term')
    await insertNote(db, 'note-2', 'A title', 'the floorneedle lives in this body')
    await rebuildFtsIndex(db, 'u')

    expect(await searchedIds(db, 'floorneedle')).toEqual(['note-2'])
  })
})
