import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `a${String(++H.counter).padStart(25, 'c')}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

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

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
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
  const res = await request(app, '/api/music/tracks', { method: 'POST', body: form })
  expect(res.status).toBe(201)
  return res.json() as Promise<Record<string, unknown>>
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
    expect(track.mime).toBe('audio/mpeg')
    expect(track.durationMs).toBe(123000)
    expect(String(track.objectKey)).toMatch(/^music\/\d{4}-\d{2}-\d{2}\//)
    expect(DB_ENV.env.FILES.put).toHaveBeenCalledTimes(1)

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.tracks).toHaveLength(1)
    expect(library.stats.trackCount).toBe(1)
    expect(library.stats.totalBytes).toBe(AUDIO.byteLength)
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
    expect(counted.stats.favoriteCount).toBe(1)
    expect(counted.stats.pinnedCount).toBe(1)

    const missing = await json(app, '/api/music/tracks/nope', { title: 'x' }, 'PATCH')
    expect(missing.status).toBe(404)
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
})

describe('music cover lookup (real D1)', () => {
  const ARTWORK = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

  function stubCatalogue(results: unknown[], status = 200): string[] {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      if (String(url).includes('itunes.apple.com')) {
        return Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve({ results }) })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
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

  it('rejects a lookup without a title and reports missing matches', async () => {
    await makeDb()
    const app = makeApp()
    stubCatalogue([])
    expect((await request(app, '/api/music/cover-lookup')).status).toBe(400)
    expect((await request(app, '/api/music/cover-lookup?title=Unknown%20Song')).status).toBe(404)
  })
})
