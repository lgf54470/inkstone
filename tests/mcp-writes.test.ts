import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => String.fromCharCode(97 + (H.counter++ % 26)).repeat(26) }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { purgeExpiredMcpOperations, runIdempotent } from '../src/worker/mcp/operations'
import { buildOutline } from '../src/worker/mcp/retrieval'
import { noteUrl } from '../src/worker/mcp/retrieval/search'
import {
  createMcpNote,
  editMcpNote,
  organizeMcpNote,
  restoreMcpNote,
  trashMcpNote,
  type McpWriteContext,
} from '../src/worker/mcp/writes'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

const idOf = (letter: string) => letter.repeat(26)
const NOTE_1 = idOf('a')
const NOTE_2 = idOf('b')
const FOLDER_1 = idOf('c')

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function context(ftsEnabled = false): McpWriteContext {
  return {
    env: DB_ENV.env,
    userId: USER,
    ftsEnabled,
    executionCtx: EXECUTION_CTX,
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedNote(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  const content = (fields.content ?? '') as string
  const base = {
    id: NOTE_1,
    user_id: USER,
    folder_id: null,
    title: 'Seed note',
    title_key: '',
    content,
    excerpt: '',
    rev: 1,
    word_count: 1,
    char_count: 1,
    is_pinned: 0,
    is_starred: 0,
    is_archived: 0,
    position: 0,
    content_hash: shaOf(content),
    created_at: H.now - 2000,
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

async function seedFolder(db: D1Shim): Promise<void> {
  await runSql(
    db,
    `INSERT INTO folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, NULL, 'Folder', NULL, NULL, 0, ?3, ?3)`,
    FOLDER_1,
    USER,
    H.now - 1000,
  )
}

describe('mcp create_note (real D1)', () => {
  it('creates a note with derived fields, tag, and an upsert change', async () => {
    const db = await makeDb()

    const note = await createMcpNote(context(), {
      operationId: 'op-create-1',
      title: 'Created',
      content: 'hello #world',
    })

    expect(note.title).toBe('Created')
    expect(note.content).toBe('hello #world')
    expect(note.rev).toBe(1)
    const row = await firstRow(db, 'SELECT content_hash, excerpt FROM notes WHERE id = ?1', note.id)
    expect(row!.content_hash).toBe(shaOf('hello #world'))
    expect((await allRows(db, `SELECT * FROM changes WHERE entity_id = ?1 AND op = 'upsert'`, note.id)).length).toBe(1)
    const tag = await firstRow(db, "SELECT id FROM tags WHERE user_id = ?1 AND name = 'world'", USER)
    expect(tag).not.toBeNull()
  })

  it('returns the same note when retried with the same operation_id', async () => {
    const db = await makeDb()

    const first = await createMcpNote(context(), { operationId: 'op-create-2', content: 'retry me' })
    const second = await createMcpNote(context(), { operationId: 'op-create-2', content: 'retry me' })

    expect(second.id).toBe(first.id)
    expect(second.rev).toBe(first.rev)
    expect((await allRows(db, "SELECT * FROM mcp_operations WHERE operation_id = 'op-create-2'")).length).toBe(1)
  })

  it('rejects an explicitly requested id that is already in use', async () => {
    const db = await makeDb()
    await seedNote(db, { id: NOTE_2, content: 'existing' })

    await expect(createMcpNote(context(), {
      operationId: 'op-create-3',
      noteId: NOTE_2,
      content: 'mine',
    })).rejects.toMatchObject({ status: 409 })
  })

  it('conflicts when the same operation_id is reused with different arguments', async () => {
    await makeDb()
    await createMcpNote(context(), { operationId: 'op-create-4', title: 'A', content: 'body' })

    await expect(createMcpNote(context(), { operationId: 'op-create-4', title: 'B', content: 'body' }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('resolves an operation that failed before committing on retry', async () => {
    const db = await makeDb()

    const boom = await runIdempotent({
      db: db as unknown as D1Database,
      userId: USER,
      operationId: 'op-create-5',
      tool: 'create_note',
      request: { noteId: NOTE_1 },
      execute: async () => {
        throw new Error('mutation failed')
      },
    }).catch((error: Error) => error)
    expect(boom.message).toBe('mutation failed')
    expect((await allRows(db, "SELECT * FROM mcp_operations WHERE operation_id = 'op-create-5'")).length).toBe(0)

    const note = await createMcpNote(context(), { operationId: 'op-create-5', noteId: NOTE_1, content: 'now works' })
    expect(note.id).toBe(NOTE_1)
    expect(note.rev).toBe(1)
  })
})

describe('mcp edit_note / organize_note (real D1)', () => {
  it('appends content with a version snapshot, rev bump and updated hash', async () => {
    const db = await makeDb()
    await seedNote(db, { title: 'Alpha note', content: 'has #alpha inside' })

    const note = await editMcpNote(context(), {
      operationId: 'op-edit-1',
      noteId: NOTE_1,
      expectedRev: 1,
      operation: 'append',
      text: 'more text',
    })

    expect(note.content).toBe('has #alpha inside\n\nmore text')
    expect(note.rev).toBe(2)
    const row = await firstRow(db, 'SELECT content_hash, rev FROM notes WHERE id = ?1', NOTE_1)
    expect(row!.rev).toBe(2)
    expect(row!.content_hash).toBe(shaOf('has #alpha inside\n\nmore text'))
    const snapshot = await firstRow(db, 'SELECT content, title FROM note_versions WHERE note_id = ?1', NOTE_1)
    expect(snapshot!.content).toBe('has #alpha inside')
    expect(snapshot!.title).toBe('Alpha note')
  })

  it('replaces exact text when old_text matches', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'hello world' })

    const note = await editMcpNote(context(), {
      operationId: 'op-edit-2',
      noteId: NOTE_1,
      expectedRev: 1,
      operation: 'replace',
      oldText: 'world',
      text: 'mcp',
    })

    expect(note.content).toBe('hello mcp')
    expect(note.rev).toBe(2)
  })

  it('rejects a stale expectedRev with a conflict', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'body' })

    await expect(editMcpNote(context(), {
      operationId: 'op-edit-3',
      noteId: NOTE_1,
      expectedRev: 7,
      operation: 'append',
      text: 'x',
    })).rejects.toMatchObject({ status: 409 })
  })

  it('moves a note into a folder and stars it', async () => {
    const db = await makeDb()
    await seedFolder(db)
    await seedNote(db, { content: 'body' })

    const note = await organizeMcpNote(context(), {
      operationId: 'op-organize-1',
      noteId: NOTE_1,
      expectedRev: 1,
      folderId: FOLDER_1,
      starred: true,
    })

    expect(note.folderId).toBe(FOLDER_1)
    expect(note.isStarred).toBe(true)
    expect(note.rev).toBe(2)
    const row = await firstRow(db, 'SELECT folder_id, is_starred FROM notes WHERE id = ?1', NOTE_1)
    expect(row!.folder_id).toBe(FOLDER_1)
    expect(row!.is_starred).toBe(1)
  })

  it('rejects organizing into a folder the user does not own', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'body' })

    await expect(organizeMcpNote(context(), {
      operationId: 'op-organize-2',
      noteId: NOTE_1,
      expectedRev: 1,
      folderId: idOf('z'),
    })).rejects.toMatchObject({ status: 400 })
  })
})

describe('mcp trash/restore lifecycle (real D1)', () => {
  it('trashes then restores a note with rev bumps and link cleanup', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'hello' })

    const trashed = await trashMcpNote(context(), {
      operationId: 'op-trash-1',
      noteId: NOTE_1,
      expectedRev: 1,
    })
    expect(trashed.deletedAt).not.toBeNull()
    expect(trashed.rev).toBe(2)
    const row = await firstRow(db, 'SELECT deleted_at, rev FROM notes WHERE id = ?1', NOTE_1)
    expect(row!.deleted_at).not.toBeNull()
    expect(row!.rev).toBe(2)

    const restored = await restoreMcpNote(context(), {
      operationId: 'op-restore-1',
      noteId: NOTE_1,
      expectedRev: 2,
    })
    expect(restored.deletedAt).toBeNull()
    expect(restored.rev).toBe(3)
  })

  it('refuses to trash an already-trashed note', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'x', deleted_at: H.now, rev: 2 })

    await expect(trashMcpNote(context(), {
      operationId: 'op-trash-2',
      noteId: NOTE_1,
      expectedRev: 2,
    })).rejects.toMatchObject({ status: 404 })
  })

  it('restore fails when the note is not in the trash', async () => {
    const db = await makeDb()
    await seedNote(db, { content: 'x' })

    await expect(restoreMcpNote(context(), {
      operationId: 'op-restore-2',
      noteId: NOTE_1,
      expectedRev: 1,
    })).rejects.toMatchObject({ status: 400 })
  })
})

describe('mcp operations store (real D1)', () => {
  it('purges expired operation rows in age order', async () => {
    const db = await makeDb()
    await runSql(
      db,
      `INSERT INTO mcp_operations (user_id, operation_id, tool, request_hash, response_json, created_at)
       VALUES (?1, 'op-old', 'x', 'h1', '{}', ?2)`,
      USER,
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    )
    await runSql(
      db,
      `INSERT INTO mcp_operations (user_id, operation_id, tool, request_hash, response_json, created_at)
       VALUES (?1, 'op-new', 'x', 'h2', '{}', ?2)`,
      USER,
      Date.now(),
    )

    await purgeExpiredMcpOperations(db as unknown as D1Database, 7 * 24 * 60 * 60 * 1000)

    expect(await firstRow(db, "SELECT * FROM mcp_operations WHERE operation_id = 'op-old'")).toBeNull()
    expect(await firstRow(db, "SELECT * FROM mcp_operations WHERE operation_id = 'op-new'")).not.toBeNull()
  })
})

describe('mcp retrieval pure helpers', () => {
  it('builds a heading outline with slug de-duplication and fence skipping', () => {
    const outline = buildOutline([
      '# Title',
      '```md',
      '# Not a heading (fenced)',
      '```',
      '## Title',
      '### Sub section',
      '~~~',
      '# Also fenced',
      '~~~',
    ].join('\n'))

    expect(outline).toEqual([
      { level: 1, title: 'Title', slug: 'title', line: 1 },
      { level: 2, title: 'Title', slug: 'title-1', line: 5 },
      { level: 3, title: 'Sub section', slug: 'subsection', line: 6 },
    ])
  })

  it('caps the outline at 200 entries', () => {
    const lines: string[] = []
    for (let i = 0; i < 250; i++) lines.push(`# Heading ${i}`)
    const outline = buildOutline(lines.join('\n'))
    expect(outline.length).toBe(200)
  })

  it('builds absolute note urls without double slashes', () => {
    expect(noteUrl('https://inkstone.invalid/', 'abc')).toBe('https://inkstone.invalid/n/abc')
    expect(noteUrl('https://inkstone.invalid', 'a b')).toBe('https://inkstone.invalid/n/a%20b')
  })
})