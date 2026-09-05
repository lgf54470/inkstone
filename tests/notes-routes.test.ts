import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { notesRoutes } from '../src/worker/routes/notes'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const OTHER = 'other-user'
const VALID_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaa'
const DB_ENV = { env: { DB: null as unknown as D1Database } }

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(db, "INSERT INTO app_meta (key, value) VALUES ('ai-search-enabled:user-1', '1')")
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedNote(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  const content = (fields.content ?? '') as string
  const base = {
    id: 'n-' + ++H.counter,
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

async function seedVersion(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  const content = (fields.content ?? '') as string
  const base = {
    id: 'v-' + ++H.counter,
    note_id: 'n-1',
    user_id: USER,
    title: 'Old title',
    content,
    size: content.length,
    created_at: H.now - 3000,
  }
  const merged = { ...base, ...fields }
  const cols = Object.keys(merged) as Array<keyof typeof merged>
  await runSql(
    db,
    `INSERT INTO note_versions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
    ...cols.map((col) => merged[col]),
  )
}

const EXECUTION_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('*', async (c, next) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/notes', notesRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('notes create routes (real D1)', () => {
  it('creates a note with derived fields and an upsert change', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'a note' })
    const app = makeApp()

    const res = await postJson(app, '/api/notes', {
      title: 'Created',
      content: 'hello #world',
    })
    expect(res.status).toBe(201)
    const note = await res.json()
    expect(note.title).toBe('Created')
    expect(note.content).toBe('hello #world')
    expect(note.rev).toBe(1)

    const row = await firstRow(db, 'SELECT content_hash, excerpt, word_count, char_count FROM notes WHERE id = ?1', note.id)
    expect(row!.content_hash).toBe(shaOf('hello #world'))
    expect((await allRows(db, `SELECT * FROM changes WHERE entity_id = '${note.id}' AND op = 'upsert'`)).length).toBe(1)
    const tag = await firstRow(db, "SELECT id FROM tags WHERE user_id = ?1 AND name = 'world'", USER)
    expect(tag).not.toBeNull()
  })

  it('returns the existing note with 200 when the requested id already belongs to the user', async () => {
    const db = await makeDb()
    await seedNote(db, { id: VALID_ID, content: 'existing' })
    const app = makeApp()

    const res = await postJson(app, '/api/notes', { id: VALID_ID, content: 'trying to overwrite' })
    expect(res.status).toBe(200)
    const note = await res.json()
    expect(note.content).toBe('existing')
    expect((await allRows(db, 'SELECT id FROM notes WHERE id = ?1', VALID_ID)).length).toBe(1)
  })

  it('rejects an id that collides with another user note', async () => {
    const db = await makeDb()
    await runSql(
      db,
      `INSERT INTO notes (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
         is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
       VALUES (?1, ?2, NULL, 'theirs', 'x', '', 1, 1, 1, 0, 0, 0, 0, ?3, ?4, ?4)`,
      VALID_ID, OTHER, shaOf('x'), H.now,
    )
    const app = makeApp()

    const res = await postJson(app, '/api/notes', { id: VALID_ID, content: 'mine' })
    expect(res.status).toBe(409)
  })
})

describe('notes edit route (real D1)', () => {
  it('applies a content patch with a version snapshot, derived tags and a rev bump', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Alpha note', content: 'has #alpha inside' })
    const app = makeApp()

    const res = await request(app, '/api/notes/n-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: 1, content: 'now #beta inside' }),
    })
    expect(res.status).toBe(200)
    const note = await res.json()
    expect(note.content).toBe('now #beta inside')
    expect(note.rev).toBe(2)
    expect(note.updatedAt).toBeGreaterThan(H.now - 1000)

    const row = await firstRow(db, 'SELECT content_hash, rev FROM notes WHERE id = ?1', 'n-1')
    expect(row!.rev).toBe(2)
    expect(row!.content_hash).toBe(shaOf('now #beta inside'))
    const snapshot = await firstRow(db, 'SELECT content, title FROM note_versions WHERE note_id = ?1', 'n-1')
    expect(snapshot!.content).toBe('has #alpha inside')
    expect(snapshot!.title).toBe('Alpha note')
    expect((await allRows(db, "SELECT * FROM changes WHERE entity_id = 'n-1' AND op = 'upsert'")).length).toBe(1)
    expect(await firstRow(db, "SELECT id FROM tags WHERE name = 'beta'")).not.toBeNull()
  })

  it('rejects a patch whose rev is stale with the server note attached', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'body' })
    const app = makeApp()

    const res = await request(app, '/api/notes/n-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: 7, content: 'edited' }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.details.server.rev).toBe(1)
  })

  it('returns 404 with a deletionCursor when patching a purged note', async () => {
    const db = await makeDb()
    await runSql(db, "INSERT INTO changes (user_id, entity, entity_id, op, at) VALUES (?1, 'note', 'n-1', 'delete', ?2)", USER, H.now)
    const app = makeApp()

    const res = await request(app, '/api/notes/n-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: 1, content: 'retry edit' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(typeof body.error.details.deletionCursor).toBe('number')
  })
})

describe('notes lifecycle routes (real D1)', () => {
  it('trashes, restores and purges a note end to end', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'hello' })
    await seedVersion(db, { note_id: 'n-1' })
    const app = makeApp()

    const trashed = await request(app, '/api/notes/n-1', { method: 'DELETE' })
    expect(trashed.status).toBe(200)
    const trashedNote = await trashed.json()
    expect(trashedNote.deletedAt).not.toBeNull()
    expect(trashedNote.rev).toBe(2)

    const restored = await postJson(app, '/api/notes/n-1/restore', {})
    expect(restored.status).toBe(200)
    const restoredNote = await restored.json()
    expect(restoredNote.deletedAt).toBeNull()
    expect(restoredNote.rev).toBe(3)

    await request(app, '/api/notes/n-1', { method: 'DELETE' })
    const purgeRes = await request(app, '/api/notes/n-1/purge', { method: 'DELETE' })
    expect(purgeRes.status).toBe(200)
    expect((await purgeRes.json()).ok).toBe(true)
    expect(await firstRow(db, 'SELECT id FROM notes WHERE id = ?1', 'n-1')).toBeNull()
    expect((await allRows(db, 'SELECT id FROM note_versions WHERE note_id = ?1', 'n-1')).length).toBe(0)
  })

  it('purge removes the note_tags and orphaned auto tags', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'has #alpha', deleted_at: H.now, rev: 2 })
    await runSql(db, `INSERT INTO tags (id, user_id, name, color, is_pinned, is_manual, created_at)
      VALUES ('t-1', ?1, 'alpha', NULL, 0, 0, ?2)`, USER, H.now)
    await runSql(db, 'INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)', 'n-1', 't-1')
    const app = makeApp()

    const res = await request(app, '/api/notes/n-1/purge', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await firstRow(db, 'SELECT id FROM tags WHERE id = ?1', 't-1')).toBeNull()
    expect(await firstRow(db, 'SELECT id FROM notes WHERE id = ?1', 'n-1')).toBeNull()
    expect((await allRows(db, "SELECT * FROM changes WHERE entity_id = 'n-1' AND op = 'delete'")).length).toBe(1)
  })

  it('trash refuses to trash a note that is already in the trash', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'x', deleted_at: H.now, rev: 2 })
    const app = makeApp()

    const res = await request(app, '/api/notes/n-1', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('duplicates a note with a copy title and identical content', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Original', content: 'same body' })
    const app = makeApp()

    const res = await postJson(app, '/api/notes/n-1/duplicate', {})
    expect(res.status).toBe(201)
    const note = await res.json()
    expect(note.title).toBe('Original copy')
    expect(note.content).toBe('same body')
    expect(note.rev).toBe(1)
    const copy = await firstRow(db, 'SELECT content_hash FROM notes WHERE id = ?1', note.id)
    expect(copy!.content_hash).toBe(shaOf('same body'))
  })

  it('duplicate returns the existing note when the requested id is already owned', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Source', content: 'body' })
    await seedNote(db, { id: VALID_ID, title: 'Target', content: 'other body' })
    const app = makeApp()

    const res = await postJson(app, '/api/notes/n-1/duplicate', { id: VALID_ID })
    expect(res.status).toBe(200)
    const note = await res.json()
    expect(note.id).toBe(VALID_ID)
    expect(note.content).toBe('other body')
    expect((await allRows(db, 'SELECT id FROM notes WHERE id = ?1', VALID_ID)).length).toBe(1)
  })
})

describe('notes versions routes (real D1)', () => {
  it('restores a version and snapshots the pre-restore state', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Current title', content: 'current body', rev: 2, updated_at: H.now - 900, created_at: H.now - 5000 })
    await seedVersion(db, { id: 'v-1', content: 'old body', created_at: H.now - 3000 })
    const app = makeApp()

    const res = await postJson(app, '/api/notes/n-1/versions/v-1/restore', {})
    expect(res.status).toBe(200)
    const note = await res.json()
    expect(note.content).toBe('old body')
    expect(note.rev).toBe(3)
    expect(note.title).toBe('Old title')

    const versions = await allRows(db, 'SELECT content FROM note_versions WHERE note_id = ?1 ORDER BY created_at', 'n-1')
    expect(versions.map((v) => v.content)).toEqual(['old body', 'current body'])
  })

  it('returns 404 when restoring a version that does not exist', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', content: 'body' })
    const app = makeApp()

    const res = await postJson(app, '/api/notes/n-1/versions/v-missing/restore', {})
    expect(res.status).toBe(404)
  })
})

describe('notes list route (real D1)', () => {
  it('paginates with a keyset cursor and reports total only on the first page', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'B note', content: 'b', updated_at: H.now - 3000 })
    await seedNote(db, { id: 'n-2', title: 'A note', content: 'a', updated_at: H.now - 2000 })
    await seedNote(db, { id: 'n-3', title: 'C note', content: 'c', updated_at: H.now - 1000 })
    const app = makeApp()

    const first = await request(app, '/api/notes?limit=2')
    expect(first.status).toBe(200)
    const page1 = await first.json()
    expect(page1.notes.map((n: { id: string }) => n.id)).toEqual(['n-3', 'n-2'])
    expect(page1.total).toBe(3)
    expect(page1.nextCursor).not.toBeNull()

    const second = await request(app, `/api/notes?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)
    const page2 = await second.json()
    expect(page2.notes.map((n: { id: string }) => n.id)).toEqual(['n-1'])
    expect(page2.total).toBeNull()
    expect(page2.nextCursor).toBeNull()
  })

  it('filters by view and derived flags', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'n-1', title: 'Plain', content: 'x' })
    await seedNote(db, { id: 'n-2', title: 'Starred', content: 'y', is_starred: 1 })
    await seedNote(db, { id: 'n-3', title: 'Trashed', content: 'z', deleted_at: H.now, rev: 2 })
    const app = makeApp()

    const starred = await request(app, '/api/notes?view=starred')
    const starredBody = await starred.json()
    expect(starredBody.notes.map((n: { id: string }) => n.id)).toEqual(['n-2'])

    const trash = await request(app, '/api/notes?view=trash')
    const trashBody = await trash.json()
    expect(trashBody.notes.map((n: { id: string }) => n.id)).toEqual(['n-3'])
  })
})
