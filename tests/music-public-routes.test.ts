import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { getMeta } from '../src/worker/db/metadata'
import { LIMITS } from '../src/shared/constants'
import { enforceMusicPublicBudget, MUSIC_PUBLIC_BUDGETS } from '../src/worker/routes/music/budget'
import { blogPublicRoutes } from '../src/worker/routes/blog'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const OTHER_USER = 'user-2'
const AUDIO = new TextEncoder().encode('0123456789abcdef')
const COVER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext
const USER_ROW = { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner' as const, createdAt: 1, settingsRaw: '{}' }

function fakeR2() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: vi.fn(async (key: string, value: Uint8Array) => {
      objects.set(key, new Uint8Array(value))
      return {}
    }),
    head: vi.fn(async (key: string) => ({ size: objects.get(key)?.byteLength ?? AUDIO.byteLength })),
    get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const stored = objects.get(key) ?? (key.includes('/cover/') ? COVER : AUDIO)
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
  for (const statement of MUSIC_PLAYBACK_MIGRATION_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'owner', 'x', 'login', 'Author', '', 1, 1)`,
    USER,
  )
  return db
}

function makeApp(userId = USER, row = USER_ROW): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/music', async (c, next) => {
    c.set('userId', userId)
    c.set('user', row)
    await next()
  })
  app.use('/api/music/*', async (c, next) => {
    c.set('userId', userId)
    c.set('user', row)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

// The Worker trusts CF-Connecting-IP only when the edge stamped the request, which it marks
// with a `cf` property; the harness supplies both so a test can play two different visitors.
function requestAs(app: Hono<AppBindings>, path: string, ip: string, init?: RequestInit): Promise<Response> {
  const incoming = new Request(`http://localhost${path}`, {
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), 'CF-Connecting-IP': ip },
  })
  Object.defineProperty(incoming, 'cf', { value: {} })
  return app.request(incoming, undefined, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function uploadTrack(app: Hono<AppBindings>, name = 'song.mp3'): Promise<Record<string, string>> {
  const form = new FormData()
  form.append('file', new File([AUDIO], name, { type: 'audio/mpeg' }))
  form.append('artist', 'Hu Yanbin')
  form.append('durationMs', '200000')
  const res = await request(app, '/api/music/tracks', { method: 'POST', body: form })
  expect(res.status, await res.clone().text()).toBe(201)
  const created = await res.json() as Record<string, string>
  const patched = await request(app, `/api/music/tracks/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coverDataUrl: 'data:image/jpeg;base64,' + Buffer.from(COVER).toString('base64') }),
  })
  expect(patched.status, await patched.clone().text()).toBe(200)
  return patched.json() as Promise<Record<string, string>>
}

function publish(app: Hono<AppBindings>, enabled: boolean): Promise<Response> {
  return request(app, '/api/music/public-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

describe('public music routes (real D1 + fake R2)', () => {
  it('keeps the library private until it is published', async () => {
    await makeDb()
    const app = makeApp()
    const track = await uploadTrack(app)

    const library = await request(app, '/api/blog/public/music/library')
    expect(library.status).toBe(200)
    expect(await library.json()).toEqual({ enabled: false, tracks: [], tags: [], queue: { ids: [], currentId: null } })
    expect((await request(app, `/api/blog/public/music/tracks/${track.id}/stream`)).status).toBe(404)
    expect((await request(app, `/api/blog/public/music/tracks/${track.id}/cover`)).status).toBe(404)
  })

  it('serves a read-only library with cover and range streaming once published', async () => {
    await makeDb()
    const app = makeApp()
    const track = await uploadTrack(app)
    expect((await publish(app, true)).status).toBe(200)

    const saved = await request(app, '/api/music/playback', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue: [track.id, 'deleted-track'], currentIndex: 0, positionMs: 1_000 }),
    })
    expect(saved.status, await saved.clone().text()).toBe(200)

    const library = await request(app, '/api/blog/public/music/library')
    expect(library.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const payload = await library.json() as {
      enabled: boolean
      tracks: Array<Record<string, unknown>>
      tags: unknown[]
      queue: { ids: string[]; currentId: string | null }
    }
    expect(payload.enabled).toBe(true)
    expect(payload.tags).toEqual([])
    expect(payload.tracks).toHaveLength(1)
    const entry = payload.tracks[0]!
    expect(entry.title).toBe('song')
    expect(entry.artist).toBe('Hu Yanbin')
    expect(entry.durationMs).toBe(200_000)
    expect(entry.mime).toBe('audio/mpeg')
    expect(String(entry.coverUrl)).toMatch(/\/api\/blog\/public\/music\/tracks\/.+\/cover$/)
    expect(String(entry.streamUrl)).toMatch(/\/api\/blog\/public\/music\/tracks\/.+\/stream$/)
    expect(entry.objectKey).toBeUndefined()
    expect(entry.sizeBytes).toBeUndefined()
    expect(entry.contentHash).toBeUndefined()
    expect(payload.queue).toEqual({ ids: [track.id], currentId: track.id })

    const full = await request(app, `/api/blog/public/music/tracks/${track.id}/stream`)
    expect(full.status).toBe(200)
    expect(full.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(full.headers.get('Accept-Ranges')).toBe('bytes')
    expect(full.headers.get('Content-Length')).toBe(String(AUDIO.byteLength))
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(AUDIO)

    const partial = await request(app, `/api/blog/public/music/tracks/${track.id}/stream`, { headers: { Range: 'bytes=4-7' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(partial.headers.get('Content-Range')).toBe(`bytes 4-7/${AUDIO.byteLength}`)
    expect(new TextDecoder().decode(await partial.arrayBuffer())).toBe('4567')

    const cover = await request(app, `/api/blog/public/music/tracks/${track.id}/cover`)
    expect(cover.status).toBe(200)
    expect(cover.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(cover.headers.get('Content-Type')).toBe('image/jpeg')
    expect(cover.headers.get('Cache-Control')).toBe('public, max-age=86400')
    expect(new Uint8Array(await cover.arrayBuffer())).toEqual(COVER)
  })

  it('never exposes another account and stops serving after unpublishing', async () => {
    await makeDb()
    const app = makeApp()
    const track = await uploadTrack(app)
    await runSql(
      DB_ENV.env.DB as unknown as D1Shim,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES ('foreign', ?1, 'Foreign', '', '', 0, 'r2', 'music/x.mp3', 'audio/mpeg', 16, NULL, NULL, 0, 0, 0, 1, 1)`,
      OTHER_USER,
    )
    await publish(app, true)
    const payload = await (await request(app, '/api/blog/public/music/library')).json() as { tracks: unknown[] }
    expect(payload.tracks).toHaveLength(1)

    await publish(app, false)
    const hidden = await (await request(app, '/api/blog/public/music/library')).json() as { enabled: boolean; tracks: unknown[] }
    expect(hidden.enabled).toBe(false)
    expect(hidden.tracks).toEqual([])
    expect((await request(app, `/api/blog/public/music/tracks/${track.id}/stream`)).status).toBe(404)
  })

  // A published library is anonymous read traffic, so the only identity left to meter is the
  // client IP. Without this, one caller could drive every listing query and every range request
  // of the deployment as fast as it could open sockets.
  it('meters the public library by visitor IP', async () => {
    await makeDb()
    const app = makeApp()
    await uploadTrack(app)
    await publish(app, true)
    const visitor = '198.51.100.7'

    for (let i = 0; i < LIMITS.musicPublicLibraryPerHour; i += 1) {
      expect((await requestAs(app, '/api/blog/public/music/library', visitor)).status).toBe(200)
    }
    const blocked = await requestAs(app, '/api/blog/public/music/library', visitor)
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toMatchObject({ error: { code: 'too_many_attempts' } })

    // The next visitor is not charged for the first one's traffic.
    expect((await requestAs(app, '/api/blog/public/music/library', '203.0.113.9')).status).toBe(200)
  })

  it('meters each public surface on its own budget', async () => {
    await makeDb()
    const app = makeApp()
    const track = await uploadTrack(app)
    await publish(app, true)
    const visitor = '198.51.100.7'
    const db = DB_ENV.env.DB

    for (let i = 0; i < MUSIC_PUBLIC_BUDGETS.stream.maxAttempts; i += 1) {
      await enforceMusicPublicBudget(db, 'stream', visitor)
    }
    expect((await requestAs(app, `/api/blog/public/music/tracks/${track.id}/stream`, visitor)).status).toBe(429)
    // Spending the playback allowance leaves the artwork allowance intact.
    expect((await requestAs(app, `/api/blog/public/music/tracks/${track.id}/cover`, visitor)).status).toBe(200)
  })

  // A preflight is an invitation: answering one for the music subtree with POST advertised
  // claims a write surface the music routes do not have.
  it('advertises only the methods each public surface answers', async () => {
    await makeDb()
    const app = makeApp()
    const music = await request(app, '/api/blog/public/music/library', { method: 'OPTIONS' })
    expect(music.status).toBe(204)
    expect(music.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(music.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')

    const blog = await request(app, '/api/blog/public/comments', { method: 'OPTIONS' })
    expect(blog.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
  })

  it('restricts the global publish switch to the owner account', async () => {
    const db = await makeDb()
    const app = makeApp()
    await uploadTrack(app)
    expect((await publish(app, true)).status).toBe(200)
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES (?1, 'member', 'x', 'member-login', 'Member', '', 1, 1)`,
      OTHER_USER,
    )
    const memberRow = { id: OTHER_USER, username: 'member', login: 'member-login', name: 'Member', avatarUrl: '', role: 'member' as const, createdAt: 1, settingsRaw: '{}' }
    const memberApp = makeApp(OTHER_USER, memberRow)

    const hijack = await publish(memberApp, true)
    expect(hijack.status).toBe(403)
    const kept = await (await request(app, '/api/blog/public/music/library')).json() as { enabled: boolean; tracks: unknown[] }
    expect(kept.enabled).toBe(true)
    expect(kept.tracks).toHaveLength(1)

    const unpublish = await publish(memberApp, false)
    expect(unpublish.status).toBe(403)
    expect(((await (await request(app, '/api/blog/public/music/library')).json()) as { enabled: boolean }).enabled).toBe(true)

    expect((await publish(app, false)).status).toBe(200)
    expect(await getMeta(db as unknown as D1Database, 'music_public_owner')).toBe('')
    expect((await request(memberApp, '/api/music/public-settings')).status).toBe(200)
    expect(((await (await request(memberApp, '/api/music/public-settings')).json()) as { enabled: boolean }).enabled).toBe(false)
  })
})
