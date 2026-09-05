import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ counter: 0, now: 1_750_000_000_000 }))
vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { LIMITS } from '../src/shared/constants'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { importBundle } from '../src/worker/import/bundle'
import { importMarkdown } from '../src/worker/import/markdown'
import { insertNote } from '../src/worker/import/notes'
import type { ImportContext } from '../src/worker/import/types'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const SRC_NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaaaa'
const SRC_NOTE2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbb'

function ctx(conflict: ImportContext['conflict'] = 'newer'): ImportContext {
  return {
    conflict,
    byId: new Map(),
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

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(db, "INSERT INTO app_meta (key, value) VALUES ('ai-search-enabled:user-1', '1')")
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

function freshBundle(): Record<string, unknown> {
  return {
    format: 'inkstone-export',
    version: 1,
    exportedAt: H.now,
    user: { login: 'me', name: 'Me' },
    folders: [
      { id: 'folder-root', name: 'Root', parentId: null },
      { id: 'folder-child', name: 'Child', parentId: 'folder-root' },
    ],
    tags: [
      { name: '#alpha' },
      { name: 'beta' },
    ],
    attachments: [],
    notes: [
      {
        id: SRC_NOTE,
        title: 'Restored note',
        content: 'body with #alpha',
        folderId: 'folder-child',
        createdAt: H.now - 2000,
        updatedAt: H.now - 1000,
      },
    ],
  }
}

describe('bundle restore', () => {
  it('restores folders, tags and a fresh note', async () => {
    const db = await makeDb()
    const c = ctx()
    await importBundle(DB_ENV, USER, freshBundle(), c)
    expect(c.result.createdFolders).toBe(2)
    expect(c.result.createdNotes).toBe(1)
    expect(c.result.createdAttachments).toBe(0)
    expect(c.result.warnings).toEqual([])

    const folders = await allRows(db, 'SELECT name FROM folders ORDER BY id')
    expect(folders.map((r) => r.name)).toEqual(['Root', 'Child'])
    const note = await firstRow(db, 'SELECT title, folder_id, rev FROM notes')
    const folder = await firstRow(db, "SELECT id FROM folders WHERE name = 'Child'")
    expect(note!.title).toBe('Restored note')
    expect(note!.rev).toBe(1)
    expect(note!.folder_id).toBe(folder!.id)

    const tag = await firstRow(db, "SELECT name, is_manual FROM tags WHERE name = 'alpha'")
    expect(tag!.is_manual).toBe(1)
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'tag'")).length).toBe(2)
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'note'")).length).toBe(1)
  })

  it('maps the source id so later lookups resolve to the restored note', async () => {
    const db = await makeDb()
    const c = ctx()
    await importBundle(DB_ENV, USER, freshBundle(), c)
    const mapping = await firstRow(db, "SELECT * FROM import_mappings WHERE source_id = ?1", SRC_NOTE)
    expect(mapping!.target_id).toBe((await firstRow(db, 'SELECT id FROM notes'))!.id)
  })

  it('updates an existing note when conflict is newer', async () => {
    const db = await makeDb()
    await insertNote(DB_ENV, USER, {
      id: SRC_NOTE,
      title: 'Old title',
      content: 'old body',
      folderId: null,
      createdAt: H.now - 5000,
      updatedAt: H.now - 4000,
    }, ctx())
    const c = ctx('newer')
    await importBundle(DB_ENV, USER, freshBundle(), c)
    expect(c.result.updatedNotes).toBe(1)
    const note = await firstRow(db, 'SELECT title, rev FROM notes')
    expect(note!.title).toBe('Restored note')
    expect(note!.rev).toBe(2)
    const versions = await allRows(db, 'SELECT * FROM note_versions')
    expect(versions.length).toBe(1)
    expect(versions[0]!.content).toBe('old body')
  })

  it('skips existing notes under conflict=skip and duplicates under conflict=duplicate', async () => {
    const db = await makeDb()
    await insertNote(DB_ENV, USER, {
      id: SRC_NOTE,
      title: 'Kept',
      content: 'kept body',
      folderId: null,
      createdAt: H.now - 5000,
      updatedAt: H.now - 4000,
    }, ctx())
    const c = ctx('skip')
    await importBundle(DB_ENV, USER, freshBundle(), c)
    expect(c.result.skippedNotes).toBe(1)
    expect((await firstRow(db, 'SELECT title FROM notes'))!.title).toBe('Kept')

    const c2 = ctx('duplicate')
    await importBundle(DB_ENV, USER, freshBundle(), c2)
    expect(c2.result.createdNotes).toBe(1)
    expect((await allRows(db, 'SELECT title FROM notes')).map((r) => r.title).sort())
      .toEqual(['Kept', 'Restored note (imported)'])
  })

  it('handles notes without a content field and unknown title derivation', async () => {
    const db = await makeDb()
    const bundle = freshBundle()
    bundle.notes = [
      { id: SRC_NOTE2, title: '', content: 'first line\nsecond line', folderId: null, createdAt: H.now, updatedAt: H.now },
      { id: null },
    ] as unknown[]
    const c = ctx()
    await importBundle(DB_ENV, USER, bundle, c)
    expect(c.result.createdNotes).toBe(1)
    const note = await firstRow(db, 'SELECT * FROM notes')
    expect(note!.content).toBe('first line\nsecond line')
  })

  it('rejects malformed or oversized bundles', async () => {
    const db = await makeDb()
    await expect(importBundle(DB_ENV, USER, { format: 'other', version: 1, notes: [] }, ctx())).rejects.toThrow('not a valid Inkstone export')
    const many = { format: 'inkstone-export', version: 1, notes: Array.from({ length: LIMITS.importArchiveEntriesMax * 4 + 1 }, (_, i) => ({ id: 'n' + i, content: 'x' })) }
    await expect(importBundle(DB_ENV, USER, many, ctx())).rejects.toThrow('at most')
  })
})

describe('plain markdown import', () => {
  it('imports a file into a folder', async () => {
    const db = await makeDb()
    const c = ctx()
    await importMarkdown(DB_ENV, USER, 'Inbox/hello.md', 'hello **world**', c)
    expect(c.result.createdNotes).toBe(1)
    expect(c.result.createdFolders).toBe(1)
    const note = await firstRow(db, 'SELECT title, content FROM notes')
    expect(note!.title).toBe('hello world')
    expect(note!.content).toBe('hello **world**')
    const folder = await firstRow(db, 'SELECT name FROM folders')
    expect(folder!.name).toBe('Inbox')
  })

  it('strips obsidian comments and reads front matter', async () => {
    const db = await makeDb()
    const c = ctx()
    await importMarkdown(DB_ENV, USER, 'note.md', '---\ntitle: Custom Title\n---\n\n%%hidden%%\n\nvisible', c)
    const note = await firstRow(db, 'SELECT title, content FROM notes')
    expect(note!.title).toBe('Custom Title')
    expect(note!.content).toContain('visible')
    expect(note!.content).toContain('<!--')
    expect(note!.content).not.toContain('%%')
  })

  it('keeps an existing note untouched on plain re-import', async () => {
    const db = await makeDb()
    await importMarkdown(DB_ENV, USER, 'note.md', 'first version', ctx())
    const c = ctx()
    await importMarkdown(DB_ENV, USER, 'note.md', 'second version', c)
    const rows = await allRows(db, 'SELECT content FROM notes ORDER BY created_at')
    expect(rows.length).toBe(2)
  })
})
