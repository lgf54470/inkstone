import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000, bumpRev: false, deleteNote: false }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

vi.mock('../src/worker/lib/encoding', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sha256Hex: async (input: string | Uint8Array) => {
      if (H.bumpRev) {
        H.bumpRev = false
        await DB_ENV.env.DB.prepare(
          `UPDATE notes SET rev = rev + 1, updated_at = updated_at + 1 WHERE user_id = ?1`,
        ).bind(USER).run()
      }
      if (H.deleteNote) {
        H.deleteNote = false
        await DB_ENV.env.DB.prepare(`DELETE FROM notes WHERE user_id = ?1`).bind(USER).run()
      }
      return actual.sha256Hex(input)
    },
  }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { tagsRoutes } from '../src/worker/routes/tags'
import { rewriteTagInNotes } from '../src/worker/routes/tags/helpers'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
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

async function seedNote(
  db: D1Shim,
  fields: Record<string, unknown>,
): Promise<void> {
  const content = (fields.content ?? '') as string
  const base = {
    id: 'note-' + ++H.counter,
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

async function seedTag(db: D1Shim, id: string, name: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO tags (id, user_id, name, color, is_pinned, is_manual, created_at)
     VALUES (?1, ?2, ?3, NULL, 0, 1, ?4)`,
    id,
    USER,
    name,
    H.now - 1000,
  )
}

async function seedNoteTag(db: D1Shim, noteId: string, tagId: string): Promise<void> {
  await runSql(db, `INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)`, noteId, tagId)
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
  app.route('/api/tags', tagsRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

describe('rewriteTagInNotes', () => {
  it('retries with fresh state after a concurrent edit bumps the revision', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    H.bumpRev = true

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', 'beta')
    expect(result.rewritten).toBe(1)
    const note = await firstRow(db, 'SELECT content, rev, updated_at FROM notes WHERE id = ?1', 'note-1')
    expect(note!.content).toBe('body with #beta')
    expect(note!.rev).toBe(3)
    expect(note!.updated_at).toBe(H.now - 998)
  })

  it('stops cleanly when the note disappears between preload and apply', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    H.deleteNote = true

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', 'beta')
    expect(result.rewritten).toBe(0)
    expect(await firstRow(db, 'SELECT id FROM notes WHERE id = ?1', 'note-1')).toBeNull()
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'note'")).length).toBe(0)
  })

  it('renames the tag in content and rewrites derived state with a version snapshot', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha and more' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', 'beta')
    expect(result.rewritten).toBe(1)

    const note = await firstRow(db, 'SELECT content, rev, updated_at, content_hash, excerpt FROM notes WHERE id = ?1', 'note-1')
    expect(note!.content).toBe('body with #beta and more')
    expect(note!.rev).toBe(2)
    expect(note!.updated_at).toBe(H.now - 999)
    expect(note!.content_hash).toBe(shaOf('body with #beta and more'))

    const snapshot = await firstRow(db, 'SELECT content FROM note_versions WHERE note_id = ?1', 'note-1')
    expect(snapshot!.content).toBe('body with #alpha and more')
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'note'")).length).toBe(1)
    const fts = await firstRow(db, 'SELECT kind FROM fts_index_queue WHERE note_id = ?1', 'note-1')
    expect(fts!.kind).toBe('upsert')
    expect(await firstRow(db, 'SELECT name FROM tags WHERE id = ?1', 'tag-1')).not.toBeNull()
  })

  it('deletes the tag text when the destination is null', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'see #alpha here' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', null)
    expect(result.rewritten).toBe(1)
    const note = await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-1')
    expect(note!.content).toBe('see  here')
  })

  it('counts only candidates whose content actually contains the tag', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'no tags inside' })
    await seedNote(db, { id: 'note-2', content: 'has #alpha inside' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    await seedNoteTag(db, 'note-2', 'tag-1')

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', 'beta')
    expect(result.rewritten).toBe(1)
    expect((await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-1'))!.content).toBe('no tags inside')
    expect((await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-2'))!.content).toBe('has #beta inside')
  })

  it('rolls back every rewritten note on demand', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha' })
    await seedNote(db, { id: 'note-2', content: 'second #alpha note' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    await seedNoteTag(db, 'note-2', 'tag-1')

    const result = await rewriteTagInNotes(DB_ENV.env, true, USER, 'tag-1', 'alpha', 'beta')
    expect(result.rewritten).toBe(2)
    await result.rollback()

    const note1 = await firstRow(db, 'SELECT content, rev, updated_at FROM notes WHERE id = ?1', 'note-1')
    expect(note1!.content).toBe('body with #alpha')
    expect(note1!.rev).toBe(1)
    expect(note1!.updated_at).toBe(H.now - 1000)
    const note2 = await firstRow(db, 'SELECT content, rev FROM notes WHERE id = ?1', 'note-2')
    expect(note2!.content).toBe('second #alpha note')
    expect(note2!.rev).toBe(1)
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'note'")).length).toBe(4)
  })
})

describe('tag crud routes (real D1)', () => {
  it('renames a tag and merges into the auto-created destination tag', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    const app = makeApp()

    const res = await request(app, '/api/tags/tag-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'beta' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, renamed: 1 })

    expect(await firstRow(db, 'SELECT id FROM tags WHERE id = ?1', 'tag-1')).toBeNull()
    const tags = await allRows(db, 'SELECT name, is_manual FROM tags')
    expect(tags).toEqual([{ name: 'beta', is_manual: 1 }])
    const beta = await firstRow(db, 'SELECT id FROM tags WHERE name = ?1', 'beta')
    const note = await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-1')
    expect(note!.content).toBe('body with #beta')
    expect(await allRows(db, 'SELECT * FROM note_tags WHERE note_id = ?1 AND tag_id = ?2', 'note-1', beta!.id as string)).toHaveLength(1)
  })

  it('renames a tag in place when no note content references it', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'no tags inside' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedNoteTag(db, 'note-1', 'tag-1')
    const app = makeApp()

    const res = await request(app, '/api/tags/tag-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'beta' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, renamed: 0 })

    const tag = await firstRow(db, 'SELECT name FROM tags WHERE id = ?1', 'tag-1')
    expect(tag!.name).toBe('beta')
  })

  it('merges into an existing destination tag', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #alpha' })
    await seedNote(db, { id: 'note-2', content: 'body with #beta' })
    await seedTag(db, 'tag-1', 'alpha')
    await seedTag(db, 'tag-2', 'beta')
    await seedNoteTag(db, 'note-1', 'tag-1')
    await seedNoteTag(db, 'note-2', 'tag-2')
    const app = makeApp()

    const res = await request(app, '/api/tags/tag-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'beta' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, renamed: 1 })

    expect(await firstRow(db, 'SELECT id FROM tags WHERE id = ?1', 'tag-1')).toBeNull()
    const links = await allRows(db, 'SELECT note_id, tag_id FROM note_tags ORDER BY note_id')
    expect(links).toEqual([
      { note_id: 'note-1', tag_id: 'tag-2' },
      { note_id: 'note-2', tag_id: 'tag-2' },
    ])
    expect((await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-1'))!.content).toBe('body with #beta')
  })

  it('deletes the tag and strips it from note content', async () => {
    const db = await makeDb()
    await seedNote(db, { id: 'note-1', content: 'body with #gamma' })
    await seedTag(db, 'tag-1', 'gamma')
    await seedNoteTag(db, 'note-1', 'tag-1')
    const app = makeApp()

    const res = await request(app, '/api/tags/tag-1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, affected: 1 })

    expect(await firstRow(db, 'SELECT id FROM tags WHERE id = ?1', 'tag-1')).toBeNull()
    expect((await allRows(db, 'SELECT * FROM note_tags')).length).toBe(0)
    const note = await firstRow(db, 'SELECT content FROM notes WHERE id = ?1', 'note-1')
    expect(note!.content).toBe('body with ')
  })

  it('returns 404 for a tag owned by another user', async () => {
    await makeDb()
    await runSql(
      DB_ENV.env.DB as unknown as D1Shim,
      `INSERT INTO tags (id, user_id, name, color, is_pinned, is_manual, created_at)
       VALUES ('tag-9', 'user-2', 'alpha', NULL, 0, 1, ?1)`,
      H.now,
    )
    const app = makeApp()
    const res = await request(app, '/api/tags/tag-9', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})