import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { previewMcpTagChange } from '../src/worker/mcp/library/organize/tags'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const OTHER = 'other-user'

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

async function seedNote(db: D1Shim, id: string, userId: string, deletedAt: number | null = null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev,
        word_count, char_count, is_pinned, is_starred, is_archived, position, content_hash,
        created_at, updated_at, deleted_at)
      VALUES (?1, ?2, NULL, 'Note', '', '', '', 1, 0, 0, 0, 0, 0, 0, 'hash', 1000, 1000, ?3)`,
    id,
    userId,
    deletedAt,
  )
}

async function seedTag(db: D1Shim, id: string, userId: string, name: string): Promise<void> {
  await runSql(db, `INSERT INTO tags (id, user_id, name, created_at) VALUES (?1, ?2, ?3, 1000)`, id, userId, name)
}

async function seedNoteTag(db: D1Shim, noteId: string, tagId: string): Promise<void> {
  await runSql(db, 'INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)', noteId, tagId)
}

describe('previewMcpTagChange', () => {
  it('counts the notes that carry the tag for its owner only', async () => {
    const db = await makeDb()
    await seedTag(db, 't-1', USER, 'reading')
    await seedTag(db, 't-2', OTHER, 'reading')
    await seedNote(db, 'n-1', USER)
    await seedNote(db, 'n-2', USER)
    await seedNote(db, 'n-3', OTHER)
    await seedNoteTag(db, 'n-1', 't-1')
    await seedNoteTag(db, 'n-2', 't-1')
    await seedNoteTag(db, 'n-3', 't-2')

    const preview = await previewMcpTagChange(db as unknown as D1Database, USER, 't-1')
    expect(preview.action).toBe('delete')
    expect(preview.affected_notes).toBe(2)
  })

  it('reports the merge target when the tag is renamed onto another name', async () => {
    const db = await makeDb()
    await seedTag(db, 't-1', USER, 'reading')
    await seedTag(db, 't-2', USER, 'writing')
    await seedNote(db, 'n-1', USER)
    await seedNoteTag(db, 'n-1', 't-1')

    const preview = await previewMcpTagChange(db as unknown as D1Database, USER, 't-1', 'writing')
    expect(preview.action).toBe('rename')
    expect(preview.affected_notes).toBe(1)
    expect(preview.merges_into).toMatchObject({ id: 't-2' })
  })
})
