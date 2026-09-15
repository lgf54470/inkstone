import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import type { BoardLibraryList, BoardLibrarySnapshot } from '../src/shared/types'
import { BOARD_LIBRARY_TABLE_STATEMENTS } from '../src/worker/db/schema/board-library'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { boardLibraryRoutes } from '../src/worker/routes/board-library'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

/** A bucket that keeps what it is given, so a test can count the objects it holds. */
function fakeR2() {
  const objects = new Map<string, Uint8Array>()
  const puts: string[] = []
  return {
    objects,
    puts,
    put: async (key: string, value: Uint8Array) => {
      puts.push(key)
      objects.set(key, new Uint8Array(value))
    },
    get: async (key: string) => {
      const value = objects.get(key)
      return value ? { size: value.byteLength, arrayBuffer: async () => value.buffer } : null
    },
    delete: async (keys: string[]) => {
      for (const key of keys) objects.delete(key)
    },
  }
}

type FakeR2 = ReturnType<typeof fakeR2>

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of BOARD_LIBRARY_TABLE_STATEMENTS) await runSql(db, statement)
  return db
}

function makeApp(db: D1Shim, storage: FakeR2 | null) {
  const app = new Hono<AppBindings>()
  app.use('/api/board-library', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.use('/api/board-library/*', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/board-library', boardLibraryRoutes)
  const env = { DB: db as unknown as D1Database, FILES: storage ?? undefined } as unknown as AppBindings['Bindings']
  return (path: string, init?: RequestInit) => app.request(path, init, env, EXECUTION_CTX)
}

type Request = ReturnType<typeof makeApp>

function putLibrary(request: Request, name: string, items: string) {
  return request('/api/board-library', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, items }),
  })
}

async function listLibraries(request: Request): Promise<BoardLibraryList> {
  return (await request('/api/board-library')).json() as Promise<BoardLibraryList>
}

const LIBRARY = JSON.stringify([{ id: 'item-1', status: 'unpublished', elements: [], created: 1 }])

describe('board library route', () => {
  it('answers an account that never saved a library', async () => {
    const db = await makeDb()
    const request = makeApp(db, fakeR2())
    const response = await request('/api/board-library')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ libraries: [] })

    const single = await request('/api/board-library?name=default')
    expect(await single.json()).toEqual({ name: 'default', items: null, updatedAt: 0 })
  })

  it('stores every library as its own object and reads it back', async () => {
    const db = await makeDb()
    const storage = fakeR2()
    const request = makeApp(db, storage)

    await putLibrary(request, 'default', LIBRARY)
    const saved = await putLibrary(request, 'Software Architecture', LIBRARY)
    expect(saved.status).toBe(200)
    expect((await saved.json() as BoardLibrarySnapshot).items).toBe(LIBRARY)

    expect(storage.puts).toEqual([
      'excalidraw_library/user-1/default.json',
      'excalidraw_library/user-1/Software Architecture.json',
    ])

    const read = await request(`/api/board-library?name=${encodeURIComponent('Software Architecture')}`)
    expect((await read.json() as BoardLibrarySnapshot).items).toBe(LIBRARY)
    expect((await listLibraries(request)).libraries.map((library) => library.name))
      .toEqual(['default', 'Software Architecture'])
  })

  it('skips the object write when the same library is saved again', async () => {
    const db = await makeDb()
    const storage = fakeR2()
    const request = makeApp(db, storage)

    await putLibrary(request, 'default', LIBRARY)
    await putLibrary(request, 'default', LIBRARY)

    expect(storage.puts).toHaveLength(1)
  })

  it('rejects a body that is not a JSON array of items', async () => {
    const db = await makeDb()
    const response = await putLibrary(makeApp(db, fakeR2()), 'default', '{"libraryItems":[]}')
    expect(response.status).toBe(400)
  })

  it('rejects a name that would forge a path segment', async () => {
    const db = await makeDb()
    const storage = fakeR2()
    const response = await putLibrary(makeApp(db, storage), '../escape', LIBRARY)
    expect(response.status).toBe(400)
    expect(storage.puts).toHaveLength(0)
  })

  it('reports a missing bucket instead of dropping the library', async () => {
    const db = await makeDb()
    const response = await putLibrary(makeApp(db, null), 'default', LIBRARY)
    expect(response.status).toBe(503)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('storage_unavailable')
  })

  it('deletes a library together with its object', async () => {
    const db = await makeDb()
    const storage = fakeR2()
    const request = makeApp(db, storage)
    await putLibrary(request, 'default', LIBRARY)

    const removed = await request('/api/board-library?name=default', { method: 'DELETE' })
    expect(await removed.json()).toEqual({ removed: true })

    expect(storage.objects.size).toBe(0)
    expect((await listLibraries(request)).libraries).toEqual([])
  })
})
