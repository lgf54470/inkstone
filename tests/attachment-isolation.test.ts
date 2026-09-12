import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `a${String(++H.counter).padStart(25, 'c')}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { filesRoutes } from '../src/worker/routes/files'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'

const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

interface StoredObject {
  bytes: Uint8Array
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
  metadata?: Record<string, unknown>
}

function mapR2() {
  const objects = new Map<string, StoredObject>()
  return {
    objects,
    put: vi.fn(async (key: string, bytes: Uint8Array, options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    }) => {
      objects.set(key, {
        bytes,
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      })
      return {}
    }),
    get: vi.fn(async (key: string) => {
      const stored = objects.get(key)
      if (!stored) return null
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(stored.bytes)
            controller.close()
          },
        }),
        size: stored.bytes.byteLength,
        customMetadata: stored.customMetadata ?? {},
        httpMetadata: stored.httpMetadata,
      }
    }),
    delete: vi.fn(async (keys: string[]) => {
      for (const key of keys) objects.delete(key)
      return {}
    }),
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  return db
}

async function seedUser(db: D1Shim, id: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    id, `user-${id}`, H.now,
  )
}

function makeApp(db: D1Shim, authedUser: string | null): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  if (authedUser) {
    app.use('/api/files', async (c, next) => {
      c.set('userId', authedUser)
      await next()
    })
    app.use('/api/files/*', async (c, next) => {
      c.set('userId', authedUser)
      await next()
    })
  }
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/files', filesRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, { DB: dbBinding, FILES: r2Binding } as unknown as AppBindings['Bindings'], EXECUTION_CTX)
}

let dbBinding: D1Database
let r2Binding: ReturnType<typeof mapR2>

async function upload(app: Hono<AppBindings>, filename: string, content: string): Promise<{ id: string; status: number }> {
  const form = new FormData()
  form.set('file', new File([content], filename, { type: 'text/plain' }))
  const res = await request(app, '/api/files', { method: 'POST', body: form })
  const data = await res.json().catch(() => null) as { id?: string } | null
  return { id: data?.id ?? '', status: res.status }
}

async function readAttachment(app: Hono<AppBindings>, id: string): Promise<{ status: number; text: string }> {
  const res = await request(app, `/api/files/${id}`)
  return { status: res.status, text: await res.text() }
}

describe('attachment object storage isolation (real D1)', () => {
  it("a second user uploading the same filename must not overwrite the first user's object", async () => {
    const db = await makeDb()
    dbBinding = db as unknown as D1Database
    r2Binding = mapR2()
    await seedUser(db, 'user-A')
    await seedUser(db, 'user-B')

    const appA = makeApp(db, 'user-A')
    const appB = makeApp(db, 'user-B')
    const a = await upload(appA, 'same-day-report.txt', 'A-confidential-bytes')
    const b = await upload(appB, 'same-day-report.txt', 'B-innocent-bytes')
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)

    const readA = await readAttachment(appA, a.id)
    expect(readA.status).toBe(200)
    expect(readA.text).toBe('A-confidential-bytes')

    const readB = await readAttachment(appB, b.id)
    expect(readB.status).toBe(200)
    expect(readB.text).toBe('B-innocent-bytes')
  })

  it('renaming an attachment must not redirect reads onto another user’s object key', async () => {
    const db = await makeDb()
    dbBinding = db as unknown as D1Database
    r2Binding = mapR2()
    await seedUser(db, 'user-A')
    await seedUser(db, 'user-B')

    const appA = makeApp(db, 'user-A')
    const appB = makeApp(db, 'user-B')
    const a = await upload(appA, 'secret.pdf', 'A-secret-pdf-bytes')
    const b = await upload(appB, 'decoy.pdf', 'B-decoy-pdf-bytes')
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)

    const renamed = await request(appB, `/api/files/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'secret.pdf' }),
    })
    expect(renamed.status).toBe(200)

    const readB = await readAttachment(appB, b.id)
    expect(readB.status).toBe(200)
    expect(readB.text).toBe('B-decoy-pdf-bytes')

    const readA = await readAttachment(appA, a.id)
    expect(readA.text).toBe('A-secret-pdf-bytes')
  })

  it('renaming an attachment keeps its object readable', async () => {
    const db = await makeDb()
    dbBinding = db as unknown as D1Database
    r2Binding = mapR2()
    await seedUser(db, 'user-A')

    const appA = makeApp(db, 'user-A')
    const a = await upload(appA, 'original-name.txt', 'stable-bytes')
    expect(a.status).toBe(201)

    const renamed = await request(appA, `/api/files/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'renamed.txt' }),
    })
    expect(renamed.status).toBe(200)

    const read = await readAttachment(appA, a.id)
    expect(read.status).toBe(200)
    expect(read.text).toBe('stable-bytes')
  })
})
