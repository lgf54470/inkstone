import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `a${String(++H.counter).padStart(25, 'c')}` }
})

function validId(seed: string): string {
  return `a${seed.padStart(25, 'c')}`
}

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { filesRoutes } from '../src/worker/routes/files'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function fakeR2() {
  return {
    put: vi.fn(async () => ({})),
    get: vi.fn(async () => ({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('attachment-bytes'))
          controller.close()
        },
      }),
      size: 16,
      customMetadata: {},
      httpMetadata: { contentType: 'image/png' },
    })),
    delete: vi.fn(async () => ({})),
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedUser(db: D1Shim, id = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    id, `user-${id}`, H.now,
  )
}

async function seedNote(db: D1Shim, content: string): Promise<string> {
  const id = `n-${++H.counter}`
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, NULL, 'Note', '', ?3, '', 1, 1, 1, 0, 0, 0, 0, ?4, ?5, ?5)`,
    id, USER, content, shaOf(content), H.now,
  )
  return id
}

async function seedAttachment(
  db: D1Shim,
  fields: Record<string, unknown>,
): Promise<string> {
  const id = (fields.id ?? validId(String(++H.counter))) as string
  const content = (fields.content ?? 'x') as string
  await runSql(
    db,
    `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height,
       storage, is_starred, is_pinned, tags, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    id, USER,
    fields.note_id ?? null,
    fields.folder_id ?? null,
    fields.filename ?? 'file.png',
    fields.mime ?? 'image/png',
    (fields.size as number) ?? 1024,
    shaOf(content),
    fields.width ?? null,
    fields.height ?? null,
    fields.storage ?? 'r2',
    fields.is_starred ? 1 : 0,
    fields.is_pinned ? 1 : 0,
    JSON.stringify((fields.tags as string[]) ?? []),
    (fields.created_at as number) ?? H.now,
  )
  return id
}

function makeApp(authed = true): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  if (authed) {
    app.use('/api/files', async (c, next) => {
      c.set('userId', USER)
      await next()
    })
    app.use('/api/files/*', async (c, next) => {
      c.set('userId', USER)
      await next()
    })
  }
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/files', filesRoutes)
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

function patchJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('files library routes (real D1)', () => {
  it('lists attachments with stats, filters, and pagination', async () => {
    const db = await makeDb()
    await seedUser(db)
    const noteId = await seedNote(db, '')
    await seedAttachment(db, { filename: 'photo.png', mime: 'image/png', size: 2048, note_id: noteId })
    await seedAttachment(db, { filename: 'doc.pdf', mime: 'application/pdf', size: 4096, created_at: H.now - 1000 })
    await seedAttachment(db, { filename: 'notes.txt', mime: 'text/plain', size: 512, created_at: H.now - 2000 })

    const app = makeApp()
    const res = await request(app, '/api/files')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files).toHaveLength(3)
    expect(body.stats.totalCount).toBe(3)
    expect(body.stats.totalBytes).toBe(6656)
    expect(body.stats.imageBytes).toBe(2048)
    expect(body.stats.extensionBreakdown.png.count).toBe(1)
    expect(body.stats.largestFiles[0].filename).toBe('doc.pdf')
    expect(body.stats.unreferencedCount).toBe(3)

    const images = await request(app, '/api/files?type=image')
    expect((await images.json()).files).toHaveLength(1)

    const searched = await request(app, '/api/files?search=doc')
    expect((await searched.json()).files[0].filename).toBe('doc.pdf')

    const named = await request(app, '/api/files?sort=name_asc')
    const namedFiles = (await named.json()).files
    expect(namedFiles.map((f: { filename: string }) => f.filename)).toEqual(['doc.pdf', 'notes.txt', 'photo.png'])

    const paged = await request(app, '/api/files?limit=2')
    const pagedBody = await paged.json()
    expect(pagedBody.files).toHaveLength(2)
    expect(pagedBody.nextCursor).toMatch(/^\d+\.[0-9a-hjkmnp-tv-z]{26}$/)
    const page2 = await request(app, `/api/files?limit=2&cursor=${pagedBody.nextCursor}`)
    expect((await page2.json()).files).toHaveLength(1)
  })

  it('serves an owned attachment with inline disposition', async () => {
    const db = await makeDb()
    DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
    await seedUser(db)
    const id = await seedAttachment(db, { filename: 'photo.png', mime: 'image/png' })

    const app = makeApp()
    const res = await request(app, `/api/files/${id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Content-Disposition')).toContain('inline')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await res.text()).toBe('attachment-bytes')

    const missing = await request(app, '/api/files/id-999')
    expect(missing.status).toBe(404)
  })

  it('serves an attachment through an active share link', async () => {
    const db = await makeDb()
    DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
    await seedUser(db)
    const attachmentId = await seedAttachment(db, { filename: 'photo.png' })
    const noteId = await seedNote(db, `See ![pic](/api/files/${attachmentId})`)
    await runSql(
      db,
      `INSERT INTO shares (slug, note_id, user_id, password_hash, is_enabled, created_at)
       VALUES (?1, ?2, ?3, NULL, 1, ?4)`,
      'shared-post', noteId, USER, H.now,
    )

    const app = makeApp(false)
    const res = await request(app, `/api/files/${attachmentId}?share=shared-post`)
    expect(res.status).toBe(200)

    const denied = await request(app, `/api/files/${attachmentId}?share=wrong-slug`)
    expect(denied.status).toBe(401)

    const anonymous = await request(app, `/api/files/${attachmentId}`)
    expect(anonymous.status).toBe(401)
  })
})

describe('files update & maintenance routes (real D1)', () => {
  it('patches filename and rewrites note references', async () => {
    const db = await makeDb()
    await seedUser(db)
    const id = await seedAttachment(db, { filename: 'old.png', tags: ['a'] })
    const noteId = await seedNote(db, `![pic](/api/files/${id})`)

    const app = makeApp()
    const patched = await patchJson(app, `/api/files/${id}`, {
      filename: 'new.png',
      isStarred: true,
      tags: ['b', 'c'],
      updateNoteReferences: true,
    })
    expect(patched.status).toBe(200)
    const attachment = await patched.json()
    expect(attachment.filename).toBe('new.png')
    expect(attachment.isStarred).toBe(true)
    expect(attachment.tags).toEqual(['b', 'c'])

    const row = await db.prepare('SELECT content FROM notes WHERE id = ?1').bind(noteId).first<{ content: string }>()
    expect(row?.content).toBe(`![new.png](/api/files/${id})`)

    const missing = await patchJson(app, '/api/files/id-999', { filename: 'x.png' })
    expect(missing.status).toBe(404)
  })

  it('deletes an attachment and drains its object cleanup', async () => {
    const db = await makeDb()
    const r2 = fakeR2()
    DB_ENV.env.FILES = r2 as unknown as AppBindings['Bindings']['FILES']
    await seedUser(db)
    const id = await seedAttachment(db, { filename: 'gone.png' })

    const app = makeApp()
    const deleted = await request(app, `/api/files/${id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect((await deleted.json()).ok).toBe(true)

    const remaining = await db.prepare('SELECT COUNT(*) as count FROM attachments WHERE id = ?1').bind(id).first<{ count: number }>()
    expect(remaining?.count).toBe(0)
    expect(r2.delete).toHaveBeenCalled()
    const queued = await db.prepare('SELECT COUNT(*) as count FROM attachment_cleanup').first<{ count: number }>()
    expect(queued?.count).toBe(0)

    const again = await request(app, `/api/files/${id}`, { method: 'DELETE' })
    expect(again.status).toBe(404)
  })

  it('applies batch move/star/tag/delete actions', async () => {
    const db = await makeDb()
    await seedUser(db)
    const a1 = await seedAttachment(db, { filename: 'one.png' })
    const a2 = await seedAttachment(db, { filename: 'two.png' })
    const folderId = validId('f')

    const app = makeApp()
    const moved = await postJson(app, '/api/files/batch', {
      action: 'move', ids: [a1, a2], folderId,
    })
    expect((await moved.json()).count).toBe(2)

    const starred = await postJson(app, '/api/files/batch', {
      action: 'star', ids: [a1], isStarred: true,
    })
    expect((await starred.json()).count).toBe(1)

    const tagged = await postJson(app, '/api/files/batch', {
      action: 'tag', ids: [a1, a2], addTags: ['keep'], removeTags: ['drop'],
    })
    expect((await tagged.json()).count).toBe(2)

    const row = await db.prepare('SELECT folder_id, is_starred, tags FROM attachments WHERE id = ?1').bind(a1).first<{ folder_id: string | null; is_starred: number; tags: string }>()
    expect(row?.folder_id).toBe(folderId)
    expect(row?.is_starred).toBe(1)
    expect(JSON.parse(row?.tags ?? '[]')).toEqual(['keep'])

    const deleted = await postJson(app, '/api/files/batch', { action: 'delete', ids: [a2] })
    expect((await deleted.json()).count).toBe(1)

    const invalid = await postJson(app, '/api/files/batch', { action: 'move', ids: ['not-a-real-id'] })
    expect((await invalid.json()).count).toBe(0)
  })

  it('rejects malformed batch bodies instead of silently ignoring them', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const unknownAction = await postJson(app, '/api/files/batch', { action: 'nuke', ids: [validId('1')] })
    expect(unknownAction.status).toBe(400)

    const oversized = await postJson(app, '/api/files/batch', {
      action: 'delete',
      ids: Array.from({ length: 101 }, (_, i) => validId(String(i + 1))),
    })
    expect(oversized.status).toBe(400)

    const notAnArray = await postJson(app, '/api/files/batch', { action: 'delete', ids: 'all' })
    expect(notAnArray.status).toBe(400)
  })

  it('rejects an oversized rename payload', async () => {
    const db = await makeDb()
    await seedUser(db)
    const id = await seedAttachment(db, { filename: 'old.png' })

    const app = makeApp()
    const patched = await patchJson(app, `/api/files/${id}`, { filename: 'x'.repeat(201) })
    expect(patched.status).toBe(400)
  })

  it('lists notes referencing an attachment and prunes unreferenced ones', async () => {
    const db = await makeDb()
    await seedUser(db)
    const keepId = await seedAttachment(db, { filename: 'kept.png' })
    const dropId = await seedAttachment(db, { filename: 'dropped.png' })
    const noteId = await seedNote(db, `![pic](/api/files/${keepId})`)

    const app = makeApp()
    const notes = await request(app, `/api/files/${keepId}/notes`)
    expect((await notes.json()).notes[0].id).toBe(noteId)

    const pruned = await postJson(app, '/api/files/prune', {})
    expect(pruned.status).toBe(200)
    const result = await pruned.json()
    expect(result.removed).toBe(1)
    expect(result.freedBytes).toBe(1024)

    const kept = await db.prepare('SELECT COUNT(*) as count FROM attachments WHERE id = ?1').bind(keepId).first<{ count: number }>()
    const dropped = await db.prepare('SELECT COUNT(*) as count FROM attachments WHERE id = ?1').bind(dropId).first<{ count: number }>()
    expect(kept?.count).toBe(1)
    expect(dropped?.count).toBe(0)
  })
})

describe('files quota by storage backend (real D1)', () => {
  function fakeKv() {
    return {
      put: vi.fn(async () => ({})),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => ({})),
    }
  }

  async function upload(app: Hono<AppBindings>): Promise<Response> {
    const form = new FormData()
    form.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }))
    return request(app, '/api/files', { method: 'POST', body: form })
  }

  it('enforces the 1 GB quota when attachments live in KV', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedAttachment(db, { filename: 'big.bin', mime: 'application/octet-stream', size: 1024 * 1024 * 1024 + 1 })
    DB_ENV.env.FILES = undefined as unknown as AppBindings['Bindings']['FILES']
    DB_ENV.env.FILES_KV = fakeKv() as unknown as AppBindings['Bindings']['FILES_KV']

    const app = makeApp()
    const res = await upload(app)
    expect(res.status).toBe(413)
  })

  it('keeps the same usage uploadable when attachments live in R2', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedAttachment(db, { filename: 'big.bin', mime: 'application/octet-stream', size: 1024 * 1024 * 1024 + 1 })
    DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
    DB_ENV.env.FILES_KV = undefined as unknown as AppBindings['Bindings']['FILES_KV']

    const app = makeApp()
    const res = await upload(app)
    expect(res.status).toBe(201)

    const listed = await request(app, '/api/files')
    expect((await listed.json()).stats.totalQuotaBytes).toBe(10 * 1024 * 1024 * 1024)
  })

  it('reports the kv quota in library stats when kv is bound', async () => {
    const db = await makeDb()
    await seedUser(db)
    DB_ENV.env.FILES = undefined as unknown as AppBindings['Bindings']['FILES']
    DB_ENV.env.FILES_KV = fakeKv() as unknown as AppBindings['Bindings']['FILES_KV']

    const app = makeApp()
    const res = await request(app, '/api/files')
    expect((await res.json()).stats.totalQuotaBytes).toBe(1024 * 1024 * 1024)
  })
})

describe('files organizer routes (real D1)', () => {
  it('uploads a file and persists it to storage', async () => {
    const db = await makeDb()
    await seedUser(db)
    const r2 = fakeR2()
    DB_ENV.env.FILES = r2 as unknown as AppBindings['Bindings']['FILES']

    const app = makeApp()
    const form = new FormData()
    form.append('file', new File(['hello-world'], 'hello.txt', { type: 'text/plain' }))
    const res = await request(app, '/api/files', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    const attachment = await res.json()
    expect(attachment.filename).toBe('hello.txt')
    expect(attachment.mime).toBe('text/plain')
    expect(attachment.size).toBe(11)
    expect(attachment.url).toMatch(/^\/api\/files\//)
    expect(r2.put).toHaveBeenCalled()

    const row = await db.prepare('SELECT COUNT(*) as count FROM attachments WHERE id = ?1').bind(attachment.id).first<{ count: number }>()
    expect(row?.count).toBe(1)
  })

  it('creates and lists folders, and renames tags across attachments', async () => {
    const db = await makeDb()
    await seedUser(db)
    const id = await seedAttachment(db, { filename: 'tagged.png', tags: ['old-name'] })

    const app = makeApp()
    const folder = await postJson(app, '/api/files/folders', { name: 'Pics' })
    expect(folder.status).toBe(201)

    const folders = await request(app, '/api/files/folders')
    expect(await folders.json()).toHaveLength(1)

    const tag = await postJson(app, '/api/files/tags', { name: 'old-name', id: validId('t') })
    expect(tag.status).toBe(201)
    const tagId = (await tag.json()).id as string

    const renamed = await patchJson(app, `/api/files/tags/${tagId}`, { name: 'new-name' })
    expect(renamed.status).toBe(200)

    const row = await db.prepare('SELECT tags FROM attachments WHERE id = ?1').bind(id).first<{ tags: string }>()
    expect(JSON.parse(row?.tags ?? '[]')).toEqual(['new-name'])

    const removed = await request(app, `/api/files/tags/${tagId}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const after = await db.prepare('SELECT tags FROM attachments WHERE id = ?1').bind(id).first<{ tags: string }>()
    expect(JSON.parse(after?.tags ?? '[]')).toEqual([])
  })
})