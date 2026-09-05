import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const H = vi.hoisted(() => ({ counter: 0, now: 1_750_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { ensureFolderPath } from '../src/worker/import/folders'
import {
  insertNote,
  loadExistingNoteIndex,
  updateImportedNote,
} from '../src/worker/import/notes'
import type { ExistingNoteIndex, ImportContext } from '../src/worker/import/types'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const DB_ENV = { env: { DB: null as unknown as D1Database } }
const USER = 'user-1'
const USER2 = 'user-2'

function makeContext(): ImportContext {
  return {
    folderCache: new Map(),
    result: {
      createdNotes: 0,
      updatedNotes: 0,
      skippedNotes: 0,
      createdFolders: 0,
      createdAttachments: 0,
      skippedAttachments: 0,
      warnings: [],
    },
    ftsEnabled: true,
  }
}

async function makeDb(): Promise<{ db: D1Shim; ctx: ImportContext }> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(db, "INSERT INTO app_meta (key, value) VALUES ('ai-search-enabled:user-1', '1'), ('ai-search-enabled:user-2', '1')")
  DB_ENV.env.DB = db as unknown as D1Database
  return { db, ctx: makeContext() }
}

async function seedNote(db: D1Shim, userId: string, fields: Record<string, unknown>): Promise<void> {
  const base = {
    id: 'seed-' + ++H.counter,
    user_id: userId,
    folder_id: null,
    title: 'Seed',
    title_key: '',
    content: 'seed body',
    excerpt: '',
    rev: 1,
    word_count: 1,
    char_count: 9,
    is_pinned: 0,
    is_starred: 0,
    is_archived: 0,
    position: 0,
    content_hash: 'h',
    created_at: H.now - 1000,
    updated_at: H.now - 1000,
    deleted_at: null,
  }
  const merged = { ...base, ...fields }
  const cols = Object.keys(merged) as Array<keyof typeof merged>
  await runSql(
    db,
    `INSERT INTO notes (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
    ...cols.map((col) => merged[col]),
  )
}

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

describe('import note-level DB writes', () => {
  it('ensures nested folder paths once and reuses cached ids', async () => {
    const { db } = await makeDb()
    const ctx1 = makeContext()
    const cache1 = ctx1.folderCache

    const first = await ensureFolderPath(db, USER, 'Projects/Alpha', ctx1)
    expect(first).toBeTruthy()
    expect(ctx1.result.createdFolders).toBe(2)
    expect((await allRows(db, 'SELECT name FROM folders ORDER BY id')).map((r) => r.name)).toEqual(['Projects', 'Alpha'])
    expect(cache1.size).toBe(2)

    const second = await ensureFolderPath(db, USER, 'Projects/Alpha', ctx1)
    expect(second).toBe(first)
    expect(ctx1.result.createdFolders).toBe(2)

    const ctx2 = makeContext()
    const third = await ensureFolderPath(db, USER2, 'Projects/Alpha', ctx2)
    expect(third).not.toBe(first)
    expect((await allRows(db, 'SELECT user_id FROM folders')).length).toBe(4)
    expect(ctx2.folderCache.size).toBe(2)
  })

  it('truncates folder paths beyond the depth limit', async () => {
    const { db, ctx } = await makeDb()
    const deep = Array.from({ length: 40 }, (_, i) => `seg${i}`).join('/')
    const id = await ensureFolderPath(db, USER, deep, ctx)
    expect(id).toBeTruthy()
    expect(ctx.result.createdFolders).toBeLessThanOrEqual(16)
    expect(ctx.result.warnings.length).toBe(1)
  })

  it('inserts a note with derived tags, links, changes and ai queue', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      title: '  Hello  ',
      content: 'body #alpha and [[Target Note]]',
      folderId: null,
    }, ctx)
    const row = await firstRow(db, 'SELECT * FROM notes WHERE id = ?1', id)
    expect(row!.title).toBe('Hello')
    expect(row!.rev).toBe(1)
    expect(row!.content_hash).toBe(shaOf('body #alpha and [[Target Note]]'))
    expect(ctx.result.createdNotes).toBe(0)
    expect((await allRows(db, 'SELECT * FROM changes WHERE entity_id = ?1', id)).length).toBe(1)
    expect((await allRows(db, 'SELECT * FROM ai_index_queue WHERE note_id = ?1', id)).length).toBe(1)
    expect((await allRows(db, 'SELECT name FROM tags')).map((r) => r.name)).toEqual(['alpha'])
    expect((await allRows(db, 'SELECT target_key FROM links')).length).toBe(1)
  })

  it('records an import_mapping when the source note already has an id', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      id: 'source-note-1',
      title: 'Mapped',
      content: 'mapped body',
      folderId: null,
    }, ctx)
    const mapping = await firstRow(db, "SELECT * FROM import_mappings WHERE source_id = 'source-note-1'")
    expect(mapping!.target_id).toBe(id)
    const index = await loadExistingNoteIndex(db, USER, 'source-note-1', makeContext())
    expect(index!.id).toBe(id)
  })

  it('retries with a fresh id when the requested id already exists', async () => {
    const { db, ctx } = await makeDb()
    await seedNote(db, USER, { id: 'clash-id', title: 'Occupied' })
    const id = await insertNote(DB_ENV, USER, {
      id: 'clash-id',
      title: 'Imported',
      content: 'fresh content',
      folderId: null,
    }, ctx)
    expect(id).not.toBe('clash-id')
    expect((await allRows(db, 'SELECT id FROM notes')).length).toBe(2)
    expect((await allRows(db, 'SELECT * FROM note_versions')).length).toBe(0)
  })

  it('does not enqueue a deleted note for indexing', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      title: 'Trashed',
      content: 'trash body',
      folderId: null,
      deletedAt: H.now,
    }, ctx)
    const row = await firstRow(db, 'SELECT * FROM notes WHERE id = ?1', id)
    expect(row!.deleted_at).not.toBeNull()
    expect((await allRows(db, 'SELECT * FROM ai_index_queue WHERE note_id = ?1', id)).length).toBe(0)
  })

  it('updates an older note and snapshots the previous version', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      title: 'Before',
      content: 'old content',
      folderId: null,
      createdAt: H.now - 5000,
      updatedAt: H.now - 4000,
    }, ctx)
    const existing: ExistingNoteIndex = { id, title: 'Before', rev: 1, updated_at: H.now - 4000 }
    const outcome = await updateImportedNote(DB_ENV, USER, existing, {
      title: 'After',
      content: 'new content',
      folderId: null,
      createdAt: H.now - 3000,
      updatedAt: H.now - 2000,
    }, H.now - 2000, ctx)
    expect(outcome).toBe('updated')
    expect(existing.title).toBe('After')
    expect(existing.rev).toBe(2)
    const row = await firstRow(db, 'SELECT * FROM notes WHERE id = ?1', id)
    expect(row!.rev).toBe(2)
    expect(row!.title).toBe('After')
    const versions = await allRows(db, 'SELECT * FROM note_versions WHERE note_id = ?1', id)
    expect(versions.length).toBe(1)
    expect(versions[0]!.content).toBe('old content')
    expect(versions[0]!.title).toBe('Before')
    expect((await allRows(db, 'SELECT * FROM ai_index_queue WHERE note_id = ?1', id)).length).toBe(1)
  })

  it('skips updates older than the current version', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      title: 'Current',
      content: 'current body',
      folderId: null,
      createdAt: H.now - 5000,
      updatedAt: H.now - 1000,
    }, ctx)
    const existing: ExistingNoteIndex = { id, title: 'Current', rev: 1, updated_at: H.now - 1000 }
    const outcome = await updateImportedNote(DB_ENV, USER, existing, {
      title: 'Old',
      content: 'older body',
      folderId: null,
      createdAt: H.now - 9000,
      updatedAt: H.now - 8000,
    }, H.now - 8000, ctx)
    expect(outcome).toBe('skipped')
    const row = await firstRow(db, 'SELECT * FROM notes WHERE id = ?1', id)
    expect(row!.rev).toBe(1)
  })

  it('bumps the rev without snapshotting when content and title are unchanged', async () => {
    const { db, ctx } = await makeDb()
    const id = await insertNote(DB_ENV, USER, {
      title: 'Stable',
      content: 'same body',
      folderId: null,
      createdAt: H.now - 5000,
      updatedAt: H.now - 4000,
    }, ctx)
    const existing: ExistingNoteIndex = { id, title: 'Stable', rev: 1, updated_at: H.now - 4000 }
    const outcome = await updateImportedNote(DB_ENV, USER, existing, {
      title: 'Stable',
      content: 'same body',
      folderId: null,
      createdAt: H.now - 3000,
      updatedAt: H.now - 2000,
    }, H.now - 2000, ctx)
    expect(outcome).toBe('updated')
    const row = await firstRow(db, 'SELECT * FROM notes WHERE id = ?1', id)
    expect(row!.rev).toBe(2)
    expect((await allRows(db, 'SELECT * FROM note_versions WHERE note_id = ?1', id)).length).toBe(0)
    expect((await allRows(db, 'SELECT * FROM changes WHERE entity_id = ?1', id)).length).toBe(2)
  })

  it('returns missing when the note row is gone', async () => {
    const { db, ctx } = await makeDb()
    const existing: ExistingNoteIndex = { id: 'ghost', title: 'Gone', rev: 1, updated_at: H.now }
    const outcome = await updateImportedNote(DB_ENV, USER, existing, {
      title: 'Any',
      content: 'body',
      folderId: null,
    }, H.now, ctx)
    expect(outcome).toBe('missing')
  })
})
