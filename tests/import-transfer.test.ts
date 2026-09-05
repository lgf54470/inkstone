import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { backupCompleteBody, type MarkdownBackupManifest } from '../src/shared/backup-format'
import { createZip } from '../src/shared/zip'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { acquireLease } from '../src/worker/lib/lease'
import { transferRoutes } from '../src/worker/routes/transfer'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const SRC_NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaaaa'
const STAMP = '20260906-120000-000'
const ENCODER = new TextEncoder()

function shaOfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(db, "INSERT INTO app_meta (key, value) VALUES ('ai-search-enabled:user-1', '1')")
  DB_ENV.env.DB = db as unknown as D1Database
  return db
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
  app.route('/api', transferRoutes)
  return app
}

function request(app: Hono<AppBindings>, init: RequestInit): Promise<Response> {
  return app.request('/api/import', init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function postForm(app: Hono<AppBindings>, files: Array<{ name: string; bytes: Uint8Array }>): Promise<Response> {
  const form = new FormData()
  for (const file of files) {
    form.append('file', new File([file.bytes], file.name))
  }
  return request(app, { method: 'POST', body: form })
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
    tags: [{ name: '#alpha' }],
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

function backupManifest(): MarkdownBackupManifest {
  const content = 'hello **world**'
  return {
    format: 'inkstone-markdown-backup',
    version: 3,
    appVersion: 'test',
    createdAt: new Date(H.now).toISOString(),
    snapshot: STAMP,
    notes: [
      {
        id: SRC_NOTE,
        path: 'notes/hello.md',
        title: 'Hello',
        folder: ['Inbox'],
        attachmentHashes: [],
        state: 'notes',
        archived: false,
        bytes: ENCODER.encode(content).byteLength,
        sha256: shaOfBytes(ENCODER.encode(content)),
        createdAt: H.now - 2000,
        updatedAt: H.now - 1000,
        deletedAt: null,
      },
    ],
    attachments: [],
  }
}

function backupZip(): Uint8Array {
  const manifest = backupManifest()
  const manifestBytes = ENCODER.encode(JSON.stringify(manifest))
  return createZip([
    { path: 'manifest.json', data: manifestBytes },
    { path: 'COMPLETE', data: ENCODER.encode(backupCompleteBody(shaOfBytes(manifestBytes))) },
    { path: 'notes/hello.md', data: ENCODER.encode('hello **world**') },
  ])
}

describe('POST /api/import (real D1)', () => {
  it('imports a plain markdown file into a note', async () => {
    const db = await makeDb()
    const app = makeApp()
    const res = await postForm(app, [{ name: 'note.md', bytes: ENCODER.encode('# Title\n\nbody') }])
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.createdNotes).toBe(1)
    expect(result.createdFolders).toBe(0)
    const note = await firstRow(db, 'SELECT title, content FROM notes')
    expect(note!.title).toBe('Title')
    expect(note!.content).toBe('# Title\n\nbody')
  })

  it('restores an inkstone-export.json bundle', async () => {
    const db = await makeDb()
    const app = makeApp()
    const res = await postForm(app, [{ name: 'inkstone-export.json', bytes: ENCODER.encode(JSON.stringify(freshBundle())) }])
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.createdNotes).toBe(1)
    expect(result.createdFolders).toBe(2)

    const note = await firstRow(db, 'SELECT title, content FROM notes')
    expect(note!.title).toBe('Restored note')
    expect(note!.content).toBe('body with #alpha')
    const folderNames = (await allRows(db, 'SELECT name FROM folders ORDER BY id')).map((r) => r.name)
    expect(folderNames).toEqual(['Root', 'Child'])
    const tag = await firstRow(db, "SELECT name FROM tags WHERE name = 'alpha'")
    expect(tag).not.toBeNull()
  })

  it('imports markdown notes from a plain zip', async () => {
    const db = await makeDb()
    const app = makeApp()
    const zip = createZip([
      { path: 'Inbox/a.md', data: ENCODER.encode('# From zip\n\nzipped body') },
      { path: 'Inbox/b.md', data: ENCODER.encode('# Second\n\nother body') },
    ])
    const res = await postForm(app, [{ name: 'notes.zip', bytes: zip }])
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.createdNotes).toBe(2)
    expect(result.createdFolders).toBe(1)
    const folder = await firstRow(db, "SELECT name FROM folders WHERE name = 'Inbox'")
    expect(folder).not.toBeNull()
    expect((await allRows(db, 'SELECT title FROM notes ORDER BY title')).map((r) => r.title))
      .toEqual(['From zip', 'Second'])
  })

  it('restores a bundle export inside a zip', async () => {
    const db = await makeDb()
    const app = makeApp()
    const zip = createZip([
      { path: 'inkstone-export.json', data: ENCODER.encode(JSON.stringify(freshBundle())) },
    ])
    const res = await postForm(app, [{ name: 'export.zip', bytes: zip }])
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.createdNotes).toBe(1)
    expect(result.createdFolders).toBe(2)
    expect(await firstRow(db, 'SELECT id FROM notes WHERE title = ?1', 'Restored note')).not.toBeNull()
  })

  it('restores a complete markdown backup zip', async () => {
    const db = await makeDb()
    const app = makeApp()
    const res = await postForm(app, [{ name: 'backup.zip', bytes: backupZip() }])
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result.createdNotes).toBe(1)
    expect(result.createdFolders).toBe(1)

    const note = await firstRow(db, 'SELECT title, content, rev FROM notes')
    expect(note!.title).toBe('Hello')
    expect(note!.content).toBe('hello **world**')
    expect(note!.rev).toBe(1)
    expect(await firstRow(db, "SELECT name FROM folders WHERE name = 'Inbox'")).not.toBeNull()
  })

  it('rejects a backup zip without a valid COMPLETE marker', async () => {
    const db = await makeDb()
    const app = makeApp()
    const manifest = backupManifest()
    const zip = createZip([
      { path: 'manifest.json', data: ENCODER.encode(JSON.stringify(manifest)) },
      { path: 'notes/hello.md', data: ENCODER.encode('hello **world**') },
    ])
    const res = await postForm(app, [{ name: 'backup.zip', bytes: zip }])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.message).toMatch(/COMPLETE marker/)
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
  })

  it('releases the import lease after the request and blocks concurrent imports', async () => {
    const db = await makeDb()
    const app = makeApp()
    const form = new FormData()
    form.append('file', new File([ENCODER.encode('first')], 'note.md'))

    const res = await request(app, { method: 'POST', body: form })
    expect(res.status).toBe(200)
    expect(await firstRow(db, "SELECT * FROM app_meta WHERE key = 'import_lock:user-1'")).toBeNull()

    const release = await acquireLease(
      db as unknown as D1Database,
      'import_lock:user-1',
      15 * 60 * 1000,
      'An import is already running. Try again later',
    )
    const blocked = await request(app, { method: 'POST', body: form })
    expect(blocked.status).toBe(409)
    await release()

    const after = await request(app, { method: 'POST', body: form })
    expect(after.status).toBe(200)
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(2)
  })
})