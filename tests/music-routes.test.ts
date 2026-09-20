import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `a${String(++H.counter).padStart(25, 'c')}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { LIMITS } from '../src/shared/constants'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, queryRows, runSql, type D1Prepared, type D1Shim } from './d1-harness'

const USER = 'user-1'
const AUDIO = new TextEncoder().encode('0123456789abcdef')
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

function fakeR2() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: vi.fn(async (key: string, value: Uint8Array) => {
      objects.set(key, new Uint8Array(value))
      return {}
    }),
    head: vi.fn(async () => ({ size: AUDIO.byteLength })),
    get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const stored = objects.get(key) ?? AUDIO
      const range = options?.range
      const slice = range ? stored.slice(range.offset, range.offset + range.length) : stored
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(slice)
            controller.close()
          },
        }),
        size: stored.byteLength,
        arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      }
    }),
    delete: vi.fn(async () => ({})),
  }
}

const KV_CHUNK_BYTES = 64 * 1024

function fakeKv() {
  const values = new Map<string, Uint8Array>()
  const stats = { arrayBufferReads: 0, streamBytesPulled: 0, streamCancelled: false }
  return {
    values,
    stats,
    put: vi.fn(async (key: string, value: Uint8Array) => {
      values.set(key, value.slice())
      return {}
    }),
    delete: vi.fn(async (key: string) => values.delete(key)),
    get: vi.fn(async (key: string, type?: string) => {
      const stored = values.get(key)
      if (!stored) return null
      if (type === 'stream') {
        let position = 0
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (position >= stored.byteLength) {
              controller.close()
              return
            }
            const chunk = stored.subarray(position, position + KV_CHUNK_BYTES)
            position += chunk.byteLength
            stats.streamBytesPulled += chunk.byteLength
            controller.enqueue(chunk.slice())
          },
          cancel() {
            stats.streamCancelled = true
          },
        })
      }
      stats.arrayBufferReads += 1
      return stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength)
    }),
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  for (const statement of MUSIC_PLAYBACK_MIGRATION_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
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

function makeApp(authed = true): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  if (authed) {
    app.use('/api/music', async (c, next) => {
      c.set('userId', USER)
      c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: H.now, settingsRaw: '{}' })
      await next()
    })
    app.use('/api/music/*', async (c, next) => {
      c.set('userId', USER)
      c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: H.now, settingsRaw: '{}' })
      await next()
    })
  }
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function uploadTrack(app: Hono<AppBindings>, name = 'song.mp3', type = 'audio/mpeg'): Promise<Record<string, unknown>> {
  const form = new FormData()
  form.append('file', new File([AUDIO], name, { type }))
  form.append('artist', 'Artist')
  form.append('durationMs', '123000')
  form.append('lyric', '[00:01.000]first line')
  const res = await request(app, '/api/music/tracks', { method: 'POST', body: form })
  expect(res.status).toBe(201)
  return res.json() as Promise<Record<string, unknown>>
}

// Rows straight into the table, no upload round trip: these tests are about the size of the
// id list a batch carries, not about how the rows got there.
async function seedTracks(db: D1Shim, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `bulk-${String(index).padStart(3, '0')}`
    ids.push(id)
    await runSql(
      db,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES (?1, ?2, ?3, '', '', 0, 'webdav', ?4, 'audio/mpeg', 16, NULL, NULL, 0, 0, 0, ?5, ?5)`,
      id, USER, `Bulk ${index}`, `/music/bulk-${index}.mp3`, H.now,
    )
  }
  return ids
}

// Records every statement the route prepares, so round-trip redundancy is assertable.
function recordingDb(db: D1Shim): { proxy: D1Shim; statements: string[] } {
  const statements: string[] = []
  const proxy = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'prepare') {
        return (sql: string) => {
          statements.push(sql)
          return target.prepare(sql)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  return { proxy, statements }
}

// Counts round trips, not statements: every execution inside one batch shares a
// single call, while an execution outside a batch costs its own round trip.
function countRoundTrips(db: D1Shim): { proxy: D1Shim; stats: { batches: number; singles: number } } {
  const stats = { batches: 0, singles: 0 }
  let insideBatch = false
  const wrap = (statement: D1Prepared): D1Prepared => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'run' || property === 'first' || property === 'all') {
        const execute = target[property]
        return () => {
          if (!insideBatch) stats.singles += 1
          return Promise.resolve(execute.call(target))
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const proxy = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql))
      if (property === 'batch') {
        return async (statements: D1Prepared[]) => {
          stats.batches += 1
          insideBatch = true
          try {
            return await target.batch(statements)
          } finally {
            insideBatch = false
          }
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  return { proxy, stats }
}

describe('music routes (real D1 + fake R2)', () => {
  it('requires authentication', async () => {
    const db = await makeDb()
    await seedUser(db)
    const res = await request(makeApp(false), '/api/music/library')
    expect(res.status).toBe(401)
  })

  it('starts empty and uploads a track into storage', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const empty = await request(app, '/api/music/library')
    expect(empty.status).toBe(200)
    expect((await empty.json()).tracks).toEqual([])

    const track = await uploadTrack(app)
    expect(track.title).toBe('song')
    expect(track.artist).toBe('Artist')
    expect(track.lyric).toBe('[00:01.000]first line')
    expect(track.mime).toBe('audio/mpeg')
    expect(track.durationMs).toBe(123000)
    expect(track.objectKey).toBeUndefined()
    expect(track.webdavPath).toBeNull()
    expect(track.format).toBe('mp3')
    expect(track.lastPlayedAt).toBeNull()
    expect(DB_ENV.env.FILES.put).toHaveBeenCalledTimes(1)

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks).toHaveLength(1)
    expect(library.stats.trackCount).toBe(1)
    expect(library.stats.totalBytes).toBe(AUDIO.byteLength)
  })

  it('ships the library without lyric text and serves lyrics lazily', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const uploaded = await uploadTrack(app)
    expect(uploaded.hasLyric).toBe(true)

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks[0].lyric).toBeNull()
    expect(library.tracks[0].hasLyric).toBe(true)

    const lyric = await (await request(app, `/api/music/tracks/${uploaded.id}/lyric`)).json()
    expect(lyric.lyric).toBe('[00:01.000]first line')
  })

  it('reports the lyric flag from the stored text after a patch', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const uploaded = await uploadTrack(app)
    const cleared = await (await json(app, `/api/music/tracks/${uploaded.id}`, { lyric: null }, 'PATCH')).json()
    expect(cleared.lyric).toBeNull()
    expect(cleared.hasLyric).toBe(false)
    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks[0].hasLyric).toBe(false)
    const lyric = await (await request(app, `/api/music/tracks/${uploaded.id}/lyric`)).json()
    expect(lyric.lyric).toBeNull()
  })

  it('rejects an unsupported audio format and an empty file', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const form = new FormData()
    form.append('file', new File(['x'], 'notes.txt', { type: 'text/plain' }))
    const unsupported = await request(app, '/api/music/tracks', { method: 'POST', body: form })
    expect(unsupported.status).toBe(400)

    const emptyForm = new FormData()
    emptyForm.append('file', new File([], 'silent.mp3', { type: 'audio/mpeg' }))
    const empty = await request(app, '/api/music/tracks', { method: 'POST', body: emptyForm })
    expect(empty.status).toBe(400)
  })

  it('streams the whole object and honours a byte range', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)

    const full = await request(app, `/api/music/tracks/${id}/stream`)
    expect(full.status).toBe(200)
    expect(full.headers.get('Accept-Ranges')).toBe('bytes')
    expect(full.headers.get('Content-Length')).toBe(String(AUDIO.byteLength))
    expect(await full.text()).toBe('0123456789abcdef')

    const ranged = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=0-4' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe(`bytes 0-4/${AUDIO.byteLength}`)
    expect(await ranged.text()).toBe('01234')

    const suffix = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=-4' } })
    expect(suffix.status).toBe(206)
    expect(await suffix.text()).toBe('cdef')

    const invalid = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=99-200' } })
    expect(invalid.status).toBe(416)

    const download = await request(app, `/api/music/tracks/${id}/stream?download=1`)
    expect(download.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('patches metadata, flags and tag assignment', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)

    const tag = await (await json(app, '/api/music/tags', { name: 'Soundtrack' })).json()
    const patched = await json(app, `/api/music/tracks/${id}`, {
      title: 'Renamed',
      isFavorite: true,
      isPinned: true,
      tagIds: [tag.id],
      lyric: '[00:01.00] line',
    }, 'PATCH')
    expect(patched.status).toBe(200)
    const updated = await patched.json()
    expect(updated.title).toBe('Renamed')
    expect(updated.isFavorite).toBe(true)
    expect(updated.isPinned).toBe(true)
    expect(updated.tagIds).toEqual([tag.id])
    expect(updated.lyric).toBe('[00:01.00] line')

    await json(app, `/api/music/tracks/${id}/play`, {})
    const counted = await (await request(app, '/api/music/library')).json()
    expect(counted.tracks[0].playCount).toBe(1)
    expect(counted.tracks[0].lastPlayedAt).toBeTypeOf('number')
    expect(counted.stats.favoriteCount).toBe(1)
    expect(counted.stats.pinnedCount).toBe(1)

    const missing = await json(app, '/api/music/tracks/nope', { title: 'x' }, 'PATCH')
    expect(missing.status).toBe(404)
  })

  it('PATCH reads the track row once before the write and validates tags inside the batch', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)
    const tag = await (await json(app, '/api/music/tags', { name: 'Soundtrack' })).json()

    const { proxy, statements } = recordingDb(db)
    DB_ENV.env.DB = proxy as unknown as D1Database
    statements.length = 0

    const patched = await json(app, `/api/music/tracks/${id}`, { title: 'Renamed', tagIds: [tag.id, 'not-mine'] }, 'PATCH')
    expect(patched.status).toBe(200)
    const body = await patched.json()
    expect(body.title).toBe('Renamed')
    expect(body.tagIds).toEqual([tag.id])

    const trackRowReads = statements.filter((sql) => /FROM music_tracks WHERE id = \?1 AND user_id = \?2/.test(sql))
    expect(trackRowReads).toHaveLength(2)
    const tagOwnershipProbes = statements.filter((sql) => /SELECT id FROM music_tags/.test(sql))
    expect(tagOwnershipProbes).toHaveLength(0)
  })

  it('batch-updates flags and deletes with object cleanup', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const first = await uploadTrack(app, 'one.mp3')
    const second = await uploadTrack(app, 'two.mp3')

    const starred = await json(app, '/api/music/tracks/batch', { ids: [first.id], action: 'favorite' })
    expect((await starred.json()).updated).toBe(1)

    const removed = await json(app, '/api/music/tracks/batch', { ids: [second.id], action: 'delete' })
    expect(removed.status).toBe(200)
    expect(DB_ENV.env.FILES.delete).toHaveBeenCalled()

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks).toHaveLength(1)
    expect(library.tracks[0].isFavorite).toBe(true)

    const single = await request(app, `/api/music/tracks/${first.id}`, { method: 'DELETE' })
    expect(single.status).toBe(200)
    expect(((await (await request(app, '/api/music/library')).json()).tracks)).toHaveLength(0)
  })

  it('batches a big selection without binding more ids than D1 accepts', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const ids = await seedTracks(db, 150)

    const starred = await json(app, '/api/music/tracks/batch', { ids, action: 'favorite' })
    expect(starred.status).toBe(200)
    expect((await starred.json()).updated).toBe(150)
    const favorites = await queryRows(db, 'SELECT COUNT(*) AS count FROM music_tracks WHERE user_id = ?1 AND is_favorite = 1', USER)
    expect(Number(favorites[0]?.count)).toBe(150)

    const removed = await json(app, '/api/music/tracks/batch', { ids, action: 'delete' })
    expect(removed.status).toBe(200)
    const left = await queryRows(db, 'SELECT COUNT(*) AS count FROM music_tracks WHERE user_id = ?1', USER)
    expect(Number(left[0]?.count)).toBe(0)
  })

  it('deletes only the track object derived from the row itself', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const victimKey = 'music/2024-05-01/victim.mp3'
    await runSql(
      db,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES (?1, ?2, 'Forged', '', '', 0, 'r2', ?3, 'audio/mpeg', 16, NULL, NULL, 0, 0, 0, ?4, ?4)`,
      'forged-1', USER, victimKey, H.now,
    )

    const removed = await request(app, '/api/music/tracks/forged-1', { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const deleted = (DB_ENV.env.FILES as unknown as { delete: ReturnType<typeof vi.fn> }).delete
    const deletedKeys = deleted.mock.calls.flatMap((call) => call[0] as string[])
    expect(deletedKeys).not.toContain(victimKey)

    const mine = await uploadTrack(app, 'mine.mp3')
    await request(app, `/api/music/tracks/${mine.id}`, { method: 'DELETE' })
    expect(deleted.mock.calls.length).toBeGreaterThan(0)
    const ownKey = deleted.mock.calls.at(-1)![0] as string[]
    expect(ownKey).toHaveLength(1)
    expect(ownKey[0]).toMatch(new RegExp(`^music/\\d{4}-\\d{2}-\\d{2}/${mine.id}\\.mp3$`))
  })
})

describe('music content hash for duplicate detection (real D1 + fake R2)', () => {
  it('checksums uploaded bytes so identical files share one hash', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const first = await uploadTrack(app, 'one.mp3')
    const copy = await uploadTrack(app, 'another copy.mp3')
    const expected = createHash('sha256').update(AUDIO).digest('hex')
    expect(first.contentHash).toBe(expected)
    expect(copy.contentHash).toBe(expected)

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks.map((track: { contentHash: string }) => track.contentHash)).toEqual([expected, expected])
  })

  it('links only byte-identical files', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const mine = await uploadTrack(app, 'one.mp3')
    const form = new FormData()
    form.append('file', new File([new TextEncoder().encode('different bytes!!')], 'other.mp3', { type: 'audio/mpeg' }))
    const other = await (await request(app, '/api/music/tracks', { method: 'POST', body: form })).json()
    expect(other.contentHash).not.toBeNull()
    expect(other.contentHash).not.toBe(mine.contentHash)
  })

  it('keeps the hash through a metadata patch so the client merge does not drop it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const uploaded = await uploadTrack(app)
    const patched = await (await json(app, `/api/music/tracks/${uploaded.id}`, { title: 'Renamed' }, 'PATCH')).json()
    expect(patched.title).toBe('Renamed')
    expect(patched.contentHash).toBe(uploaded.contentHash)
  })

  it('leaves rows stored before hashing with a null hash', async () => {
    const db = await makeDb()
    await seedUser(db)
    await runSql(
      db,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES ('legacy-1', ?1, 'Legacy', '', '', 0, 'r2', 'music/2024-05-01/legacy.mp3', 'audio/mpeg', 16, NULL, NULL, 0, 0, 0, ?2, ?2)`,
      USER, H.now,
    )
    const app = makeApp()
    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks[0].contentHash).toBeNull()
  })
})

describe('music KV range streaming (real D1 + fake KV)', () => {
  async function uploadToKv(bytes: Uint8Array) {
    const db = await makeDb()
    await seedUser(db)
    const kv = fakeKv()
    DB_ENV.env.FILES = undefined as unknown as AppBindings['Bindings']['FILES']
    DB_ENV.env.FILES_KV = kv as unknown as AppBindings['Bindings']['FILES_KV']
    const app = makeApp()
    const form = new FormData()
    form.append('file', new File([bytes], 'song.mp3', { type: 'audio/mpeg' }))
    const res = await request(app, '/api/music/tracks', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    const track = await res.json()
    return { app, id: String(track.id), kv }
  }

  it('serves a small range from an aligned window without buffering the whole value', async () => {
    const size = 3 * 1024 * 1024
    const { app, id, kv } = await uploadToKv(new Uint8Array(size))

    const ranged = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=1048576-1048675' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 1048576-2097151/3145728')
    expect(ranged.headers.get('Content-Length')).toBe(String(1024 * 1024))
    expect((await ranged.arrayBuffer()).byteLength).toBe(1024 * 1024)

    expect(kv.stats.arrayBufferReads).toBe(0)
    expect(kv.stats.streamBytesPulled).toBeLessThanOrEqual(2 * 1024 * 1024 + KV_CHUNK_BYTES)
    expect(kv.stats.streamCancelled).toBe(true)
  })

  it('clamps the aligned window to the object size for tiny files', async () => {
    const { app, id, kv } = await uploadToKv(AUDIO)

    const ranged = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=2-5' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 0-15/16')
    expect(await ranged.text()).toBe('0123456789abcdef')
    expect(kv.stats.arrayBufferReads).toBe(0)
  })

  it('leaves requests at least one window long unaligned', async () => {
    const size = 3 * 1024 * 1024
    const { app, id } = await uploadToKv(new Uint8Array(size))

    const ranged = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: `bytes=100-${100 + 1024 * 1024 - 1}` } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 100-1048675/3145728')
    expect(ranged.headers.get('Content-Length')).toBe(String(1024 * 1024))
  })

  it('widens a range that straddles a window boundary to the next boundary', async () => {
    const size = 3 * 1024 * 1024
    const { app, id } = await uploadToKv(new Uint8Array(size))

    const ranged = await request(app, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=1000000-1048700' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 0-2097151/3145728')
    expect(ranged.headers.get('Content-Length')).toBe(String(2 * 1024 * 1024))
  })

  it('streams the full object through the arrayBuffer path', async () => {
    const { app, id, kv } = await uploadToKv(AUDIO)

    const full = await request(app, `/api/music/tracks/${id}/stream`)
    expect(full.status).toBe(200)
    expect(full.headers.get('Content-Length')).toBe('16')
    expect(await full.text()).toBe('0123456789abcdef')
    expect(kv.stats.arrayBufferReads).toBe(1)
  })
})

describe('music tag routes (real D1)', () => {
  it('allows the same tag name under different parents', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const left = await (await json(app, '/api/music/tags', { name: 'Left' })).json()
    const right = await (await json(app, '/api/music/tags', { name: 'Right' })).json()

    const leftChild = await json(app, '/api/music/tags', { name: 'Shared', parentId: left.id })
    const rightChild = await json(app, '/api/music/tags', { name: 'Shared', parentId: right.id })
    expect(leftChild.status).toBe(201)
    expect(rightChild.status).toBe(201)

    const siblingDuplicate = await json(app, '/api/music/tags', { name: 'Shared', parentId: left.id })
    expect(siblingDuplicate.status).toBe(409)
    const rootDuplicate = await json(app, '/api/music/tags', { name: 'Left' })
    expect(rootDuplicate.status).toBe(409)
  })

  it('promotes children on delete without breaking scoped uniqueness', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const parent = await (await json(app, '/api/music/tags', { name: 'Parent' })).json()
    const root = await (await json(app, '/api/music/tags', { name: 'Twin' })).json()
    const child = await (await json(app, '/api/music/tags', { name: 'Twin', parentId: parent.id })).json()
    expect(child.parentId).toBe(parent.id)
    expect(root.id).not.toBe(child.id)

    const removed = await request(app, `/api/music/tags/${parent.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const remaining = await (await request(app, '/api/music/tags')).json()
    const survivor = remaining.tags.find((tag: { name: string }) => tag.name === 'Twin' && tag.id === child.id)
    expect(survivor).toBeDefined()
  })

  it('creates, renames, re-parents and deletes tags', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const parent = await (await json(app, '/api/music/tags', { name: 'Parent', color: 'indigo' })).json()
    const child = await (await json(app, '/api/music/tags', { name: 'Child', parentId: parent.id })).json()
    expect(child.parentId).toBe(parent.id)

    const duplicate = await json(app, '/api/music/tags', { name: 'Parent' })
    expect(duplicate.status).toBe(409)

    const renamed = await json(app, `/api/music/tags/${child.id}`, { name: 'Renamed' }, 'PATCH')
    expect((await renamed.json()).name).toBe('Renamed')

    const cycle = await json(app, `/api/music/tags/${parent.id}`, { parentId: child.id }, 'PATCH')
    expect(cycle.status).toBe(400)

    const removed = await request(app, `/api/music/tags/${parent.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const remaining = await (await request(app, '/api/music/tags')).json()
    expect(remaining.tags).toHaveLength(1)
    expect(remaining.tags[0].parentId).toBeNull()
  })
})

describe('music playlist routes (real D1)', () => {
  it('creates playlists and manages their items', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const other = await uploadTrack(app, 'other.mp3')

    const playlist = await (await json(app, '/api/music/playlists', { name: 'Favourites' })).json()
    expect(playlist.items).toEqual([])

    const added = await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: track.id })
    expect((await added.json()).added).toBe(true)
    const again = await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: track.id })
    expect((await again.json()).added).toBe(false)

    const second = await (await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: other.id })).json()
    const reordered = await json(app, `/api/music/playlists/${playlist.id}/items`, { itemIds: [second.id] }, 'PATCH')
    expect((await reordered.json()).items[0].id).toBe(second.id)

    const missingTrack = await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: 'a' + 'c'.repeat(25) })
    expect(missingTrack.status).toBe(400)

    const removed = await request(app, `/api/music/playlists/${playlist.id}/items/${second.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)

    const renamed = await json(app, `/api/music/playlists/${playlist.id}`, { name: 'Renamed', isPinned: true }, 'PATCH')
    expect((await renamed.json()).name).toBe('Renamed')

    const deleted = await request(app, `/api/music/playlists/${playlist.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const list = await (await request(app, '/api/music/playlists')).json()
    expect(list.playlists).toEqual([])
  })

  it('drops playlist rows when the track is deleted', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const playlist = await (await json(app, '/api/music/playlists', { name: 'Set' })).json()
    await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: track.id })

    await request(app, `/api/music/tracks/${track.id}`, { method: 'DELETE' })
    const list = await (await request(app, '/api/music/playlists')).json()
    expect(list.playlists[0].items).toEqual([])
    expect(list.playlists[0].trackCount).toBe(0)
  })
})

describe('music playlist item round trips (real D1)', () => {
  it('adds a single item with no unbatched statements', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const playlist = await (await json(app, '/api/music/playlists', { name: 'P' })).json()

    const { proxy, stats } = countRoundTrips(db)
    DB_ENV.env.DB = proxy as unknown as D1Database
    const added = await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: track.id })
    expect(added.status).toBe(201)
    expect((await added.json()).added).toBe(true)
    expect(stats.singles).toBe(0)
    expect(stats.batches).toBeLessThanOrEqual(2)
  })

  it('bulk-adds items in one request, skipping existing and foreign ids', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const first = await uploadTrack(app, 'one.mp3')
    const second = await uploadTrack(app, 'two.mp3')
    const third = await uploadTrack(app, 'three.mp3')
    const playlist = await (await json(app, '/api/music/playlists', { name: 'P' })).json()
    await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: first.id })

    const { proxy, stats } = countRoundTrips(db)
    DB_ENV.env.DB = proxy as unknown as D1Database
    const res = await json(app, `/api/music/playlists/${playlist.id}/items/batch`, {
      trackIds: [second.id, first.id, 'not-a-track', third.id, second.id],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items.map((item: { trackId: string }) => item.trackId)).toEqual([second.id, third.id])
    expect(body.added).toBe(2)
    expect(body.skipped).toBe(2)
    expect(stats.singles).toBe(0)
    expect(stats.batches).toBeLessThanOrEqual(2)

    const list = await (await request(app, '/api/music/playlists')).json()
    const stored = list.playlists.find((entry: { id: string }) => entry.id === playlist.id)
    expect(stored.items.map((item: { trackId: string }) => item.trackId)).toEqual([first.id, second.id, third.id])
  })

  it('reorders with no unbatched statements', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const one = await uploadTrack(app, 'one.mp3')
    const two = await uploadTrack(app, 'two.mp3')
    const playlist = await (await json(app, '/api/music/playlists', { name: 'P' })).json()
    const a = await (await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: one.id })).json()
    const b = await (await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: two.id })).json()

    const { proxy, stats } = countRoundTrips(db)
    DB_ENV.env.DB = proxy as unknown as D1Database
    const reordered = await json(app, `/api/music/playlists/${playlist.id}/items`, { itemIds: [b.id, a.id] }, 'PATCH')
    expect(reordered.status).toBe(200)
    expect((await reordered.json()).items.map((item: { trackId: string }) => item.trackId)).toEqual([two.id, one.id])
    expect(stats.singles).toBe(0)
  })
})

describe('music playback queue round trips (real D1)', () => {
  it('loads a large saved queue in one batched read', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const queue: string[] = []
    for (let index = 0; index < 150; index += 1) queue.push(String((await uploadTrack(app, `t${index}.mp3`)).id))
    const saved = await json(app, '/api/music/playback', { queue, currentIndex: 5, positionMs: 12_345 }, 'PUT')
    expect(saved.status).toBe(200)

    const { proxy, stats } = countRoundTrips(db)
    DB_ENV.env.DB = proxy as unknown as D1Database
    const body = await (await request(app, '/api/music/playback')).json()
    expect(body.playback.queue).toEqual(queue)
    expect(body.playback.tracks.map((track: { id: string }) => track.id)).toEqual(queue)
    expect(body.playback.currentIndex).toBe(5)
    expect(body.playback.positionMs).toBe(12_345)
    // Only the playback row itself stays outside the batch that reads the tracks.
    expect(stats.batches).toBe(1)
    expect(stats.singles).toBe(1)
  })
})
describe('music cover storage', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

  it('stores an uploaded data-URL cover as an object and serves it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const form = new FormData()
    form.append('file', new File([AUDIO], 'art.mp3', { type: 'audio/mpeg' }))
    form.append('coverUrl', 'data:image/png;base64,' + PNG.toString('base64'))
    const created = await request(app, '/api/music/tracks', { method: 'POST', body: form })
    expect(created.status).toBe(201)
    const track = await created.json()
    expect(track.coverUrl).toBe('/api/music/tracks/' + track.id + '/cover')

    const cover = await request(app, '/api/music/tracks/' + track.id + '/cover')
    expect(cover.status).toBe(200)
    expect(cover.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await cover.arrayBuffer())).toEqual(new Uint8Array(PNG))

    const stored = await db.prepare('SELECT cover_url FROM music_tracks WHERE id = ?1').bind(track.id).first<{ cover_url: string }>()
    expect(String(stored?.cover_url)).toMatch(/^music\/cover\/\d{4}-\d{2}-\d{2}\//)
  })

  it('ignores cover payloads that are not image data URLs', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const form = new FormData()
    form.append('file', new File([AUDIO], 'noart.mp3', { type: 'audio/mpeg' }))
    form.append('coverUrl', 'javascript:alert(1)')
    const created = await request(app, '/api/music/tracks', { method: 'POST', body: form })
    const track = await created.json()
    expect(track.coverUrl).toBeNull()
    const missing = await request(app, '/api/music/tracks/' + track.id + '/cover')
    expect(missing.status).toBe(404)
  })

  it('refuses a PATCH coverUrl pointing at an internal cover object', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)

    const patched = await json(app, `/api/music/tracks/${id}`, {
      coverUrl: 'music/cover/2024-05-01/someone-else.jpg',
    }, 'PATCH')
    expect(patched.status).toBe(200)
    expect((await patched.json()).coverUrl).toBeNull()
    const stored = await db.prepare('SELECT cover_url FROM music_tracks WHERE id = ?1').bind(id).first<{ cover_url: string | null }>()
    expect(stored?.cover_url).toBeNull()
    const missing = await request(app, `/api/music/tracks/${id}/cover`)
    expect(missing.status).toBe(404)
  })

  it('keeps a https cover and preserves it across PATCHes that omit coverUrl', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)

    const linked = await json(app, `/api/music/tracks/${id}`, { coverUrl: 'https://covers.example.com/a.png' }, 'PATCH')
    expect((await linked.json()).coverUrl).toBe('https://covers.example.com/a.png')

    const renamed = await json(app, `/api/music/tracks/${id}`, { title: 'Again' }, 'PATCH')
    expect((await renamed.json()).coverUrl).toBe('https://covers.example.com/a.png')
  })

  it('upgrades an http cover link when serving the track', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    const id = String(track.id)
    await json(app, `/api/music/tracks/${id}`, { coverUrl: 'http://covers.example.com/a.png' }, 'PATCH')
    const served = await (await request(app, '/api/music/library')).json()
    expect(served.tracks[0].coverUrl).toBe('https://covers.example.com/a.png')
  })
})

describe('music cover lookup (real D1)', () => {
  const ARTWORK = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

  function stubCatalogue(results: unknown[], status = 200, artworkContentType = 'image/jpeg'): string[] {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      if (String(url).includes('itunes.apple.com')) {
        return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve({ results }) })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => artworkContentType },
        arrayBuffer: () => Promise.resolve(ARTWORK.buffer.slice(0)),
      })
    })
    return calls
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams the matched artwork back to the page', async () => {
    await makeDb()
    await seedUser(DB_ENV.env.DB as unknown as D1Shim)
    const app = makeApp()
    const calls = stubCatalogue([{ trackName: 'Moonlight', artistName: 'Hu Yanbin', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }])
    const res = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(ARTWORK)
    expect(calls[0]).toContain('term=Moonlight%20Hu%20Yanbin')
    expect(calls[1]).toBe('https://is1-ssl.mzstatic.com/a/600x600bb.jpg')
  })

  it('refuses to relay artwork served with a non-image content type', async () => {
    await makeDb()
    await seedUser(DB_ENV.env.DB as unknown as D1Shim)
    const app = makeApp()
    stubCatalogue([{ trackName: 'Moonlight', artistName: 'Hu Yanbin', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }], 200, 'text/html')
    const res = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).not.toContain('text/html')
  })

  it('refuses to fetch artwork hosted outside the Apple domains', async () => {
    await makeDb()
    await seedUser(DB_ENV.env.DB as unknown as D1Shim)
    const app = makeApp()
    const calls = stubCatalogue([{ trackName: 'Moonlight', artistName: 'Hu Yanbin', artworkUrl100: 'https://evil.example.com/a/100x100bb.jpg' }])
    const res = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(res.status).toBe(500)
    expect(calls).toEqual([expect.stringContaining('itunes.apple.com')])
  })

  it('re-validates every redirect hop of an artwork request', async () => {
    await makeDb()
    await seedUser(DB_ENV.env.DB as unknown as D1Shim)
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string | URL) => {
      calls.push(String(url))
      if (String(url).includes('itunes.apple.com')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          results: [{ trackName: 'Moonlight', artistName: 'Hu Yanbin', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }],
        }) })
      }
      return Promise.resolve({ ok: true, status: 302, headers: { get: (name: string) => (name.toLowerCase() === 'location' ? 'http://169.254.169.254/latest/meta-data/' : name.toLowerCase() === 'content-type' ? 'image/jpeg' : null) }, arrayBuffer: () => Promise.resolve(ARTWORK.buffer.slice(0)) })
    })
    const res = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(res.status).toBe(500)
    expect(calls.some((call) => call.includes('169.254.169.254'))).toBe(false)
  })

  it('rejects a lookup without a title and reports missing matches', async () => {
    await makeDb()
    const app = makeApp()
    stubCatalogue([])
    expect((await request(app, '/api/music/cover-lookup')).status).toBe(400)
    expect((await request(app, '/api/music/cover-lookup?title=Unknown%20Song')).status).toBe(404)
  })
})

describe('music lyric lookup (real D1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubLyrics(payload: unknown, status = 200): string[] {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(payload) })
    })
    return calls
  }

  async function appWithTrack(): Promise<{ app: Hono<AppBindings>; track: Record<string, unknown> }> {
    await makeDb()
    await seedUser(DB_ENV.env.DB as unknown as D1Shim)
    const app = makeApp()
    const track = await uploadTrack(app)
    await json(app, `/api/music/tracks/${track.id}`, { title: 'Moonlight', artist: 'Hu Yanbin' }, 'PATCH')
    return { app, track }
  }

  it('answers with the synced lyrics and asks upstream by title, artist and seconds', async () => {
    const { app, track } = await appWithTrack()
    const calls = stubLyrics({ syncedLyrics: '[00:12.00]written line', plainLyrics: 'written line' })
    const res = await request(app, `/api/music/tracks/${track.id}/lyric-lookup`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lyric: '[00:12.00]written line' })
    expect(calls[0]).toContain('https://lrclib.net/api/get?')
    expect(calls[0]).toContain('track_name=Moonlight')
    expect(calls[0]).toContain('artist_name=Hu+Yanbin')
    expect(calls[0]).toContain('duration=123')
  })

  it('falls back to the plain text when no timed version exists', async () => {
    const { app, track } = await appWithTrack()
    stubLyrics({ syncedLyrics: null, plainLyrics: 'written line' })
    const res = await request(app, `/api/music/tracks/${track.id}/lyric-lookup`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lyric: 'written line' })
  })

  it('reports no match and leaves the stored lyric untouched', async () => {
    const { app, track } = await appWithTrack()
    stubLyrics({}, 404)
    const res = await request(app, `/api/music/tracks/${track.id}/lyric-lookup`)
    expect(res.status).toBe(404)
    const served = await (await request(app, `/api/music/tracks/${track.id}/lyric`)).json()
    expect((served as { lyric: string | null }).lyric).toBe('[00:01.000]first line')
  })

  it('refuses to relay a lyric beyond the stored-size ceiling', async () => {
    const { app, track } = await appWithTrack()
    stubLyrics({ plainLyrics: 'x'.repeat(LIMITS.musicLyricMaxBytes + 1) })
    const res = await request(app, `/api/music/tracks/${track.id}/lyric-lookup`)
    expect(res.status).toBe(404)
  })

  it('refuses to follow a lyrics redirect off the allowed domain', async () => {
    const { app, track } = await appWithTrack()
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: { get: (name: string) => (name.toLowerCase() === 'location' ? 'http://169.254.169.254/latest/meta-data/' : null) },
        json: () => Promise.resolve({}),
      })
    })
    const res = await request(app, `/api/music/tracks/${track.id}/lyric-lookup`)
    expect(res.status).toBe(404)
    expect(calls.some((call) => call.includes('169.254.169.254'))).toBe(false)
  })

  it('never reaches upstream for a track the caller does not own', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedUser(db, 'user-2')
    const app = makeApp()
    const created = await uploadTrack(app)
    await runSql(db, 'UPDATE music_tracks SET user_id = ?1 WHERE id = ?2', 'user-2', String(created.id))
    const calls = stubLyrics({ plainLyrics: 'written line' })
    const res = await request(app, `/api/music/tracks/${created.id}/lyric-lookup`)
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })
})

describe('music hourly budgets (real D1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubArtwork(): void {
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [{ trackName: 'Moonlight', artistName: 'Hu Yanbin', artworkUrl100: 'https://is1-ssl.mzstatic.com/a/100x100bb.jpg' }] }),
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer),
    }))
  }

  it('blocks cover lookups once the hourly budget is spent', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    stubArtwork()
    for (let i = 0; i < LIMITS.musicCoverLookupsPerHour; i++) {
      const res = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
      expect(res.status).toBe(200)
      await res.arrayBuffer()
    }
    const blocked = await request(app, '/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(blocked.status).toBe(429)
    const payload = (await blocked.json()) as { error: { code: string; message: string; details?: { retryAfter?: number } } }
    expect(payload.error.code).toBe('too_many_attempts')
    expect(payload.error.details?.retryAfter).toBeGreaterThan(0)
    const otherFamily = await request(app, '/api/music/tracks/missing/play', { method: 'POST' })
    expect(otherFamily.status).toBe(200)
  })

  it('spends write and play budgets on their own hourly keys', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app)
    await json(app, `/api/music/tracks/${track.id}`, { title: 'Renamed' }, 'PATCH')
    await request(app, `/api/music/tracks/${track.id}/play`, { method: 'POST' })
    const { results } = await db.prepare('SELECT key, fails FROM login_attempts ORDER BY key').all<{ key: string; fails: number }>()
    expect(results).toEqual(
      expect.arrayContaining([
        { key: 'music-play:user-1', fails: 1 },
        { key: 'music-write:user-1', fails: 1 },
      ]),
    )
  })
})

async function postTrackFile(app: Hono<AppBindings>, name: string, type: string): Promise<Response> {
  const form = new FormData()
  form.append('file', new File([AUDIO], name, { type }))
  form.append('title', 'Clip')
  return request(app, '/api/music/tracks', { method: 'POST', body: form })
}

function storageSpy(): { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } {
  return DB_ENV.env.FILES as unknown as { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
}

function storedKeyAt(index: number): string {
  const calls = storageSpy().put.mock.calls
  return String(calls[index < 0 ? calls.length + index : index]![0])
}

describe('video containers in the music library (real D1 + fake R2)', () => {
  it('stores a declared video container as video and streams it inline', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app, 'concert.mp4', 'video/mp4')
    expect(track.mime).toBe('video/mp4')
    expect(track.format).toBe('mp4')
    expect(storedKeyAt(-1)).toMatch(/\.mp4$/)

    const streamed = await request(app, `/api/music/tracks/${track.id}/stream`)
    expect(streamed.headers.get('Content-Type')).toBe('video/mp4')
    expect(streamed.headers.get('Content-Disposition')).toBeNull()
  })

  it('keeps reading an audio mp4 as the audio container it was always stored as', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app, 'song.mp4', 'audio/mp4')
    expect(track.mime).toBe('audio/mp4')
    expect(track.format).toBe('m4a')
    expect(storedKeyAt(-1)).toMatch(/\.m4a$/)
  })

  it('separates a video webm from an audio webm by the declared mime, not the key', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const clip = await uploadTrack(app, 'clip.webm', 'video/webm')
    expect(clip.mime).toBe('video/webm')
    expect(clip.format).toBe('webm')
    const song = await uploadTrack(app, 'track.webm', 'audio/webm')
    expect(song.mime).toBe('audio/webm')
    expect(song.format).toBe('webm')
    expect(storedKeyAt(-2)).not.toBe(storedKeyAt(-1))

    for (const track of [clip, song]) {
      const streamed = await request(app, `/api/music/tracks/${track.id}/stream`)
      expect(streamed.headers.get('Content-Type')).toBe(track.mime)
    }
  })

  it('canonicalizes a m4v to the mp4 mime and rejects containers no browser decodes', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app, 'clip.m4v', 'video/x-m4v')
    expect(track.mime).toBe('video/mp4')
    expect(track.format).toBe('mp4')

    const rejected = await postTrackFile(app, 'clip.avi', 'video/x-msvideo')
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error.code).toBe('bad_request')
  })

  it('deletes the video object the row derived and nothing else', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const track = await uploadTrack(app, 'concert.mp4', 'video/mp4')
    const key = storedKeyAt(-1)

    const removed = await request(app, `/api/music/tracks/${track.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const deletedKeys = storageSpy().delete.mock.calls.flatMap((call) => call[0] as string[])
    expect(deletedKeys).toContain(key)
  })
})
