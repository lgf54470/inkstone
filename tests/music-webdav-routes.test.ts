import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../src/worker/lib/crypto', () => ({
  decryptSecret: async () => ({ password: 'secret' }),
  encryptSecret: async () => 'encrypted',
}))

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const TARGET = 'target-1'
const AUDIO = new TextEncoder().encode('0123456789abcdef')
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

const PROPFIND_BODY = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/dav/music/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
  <D:response><D:href>/dav/music/Live/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
  <D:response><D:href>/dav/music/song.mp3</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>16</D:getcontentlength><D:getcontenttype>audio/mpeg</D:getcontenttype></D:prop></D:propstat></D:response>
  <D:response><D:href>/dav/music/readme.txt</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>4</D:getcontentlength><D:getcontenttype>text/plain</D:getcontenttype></D:prop></D:propstat></D:response>
</D:multistatus>`

function fakeWebdav() {
  const puts: { url: string; body: Uint8Array }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'PROPFIND') {
      const depth = new Headers(init?.headers).get('Depth') ?? '1'
      if (depth === '0') {
        if (url.includes('missing')) return new Response('', { status: 404 })
        const single = '<D:multistatus xmlns:D="DAV:"><D:response><D:href>' + new URL(url).pathname + '</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>16</D:getcontentlength><D:getcontenttype>audio/mpeg</D:getcontenttype></D:prop></D:propstat></D:response></D:multistatus>'
        return new Response(single, { status: 207 })
      }
      return new Response(PROPFIND_BODY, { status: 207 })
    }
    if (method === 'MKCOL') return new Response(null, { status: 201 })
    if (method === 'HEAD') {
      return url.includes('missing') ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { 'Content-Length': '16', 'Content-Type': 'audio/mpeg' } })
    }
    if (method === 'PUT') {
      const body = init?.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array()
      puts.push({ url, body })
      return new Response(null, { status: 201 })
    }
    const range = new Headers(init?.headers).get('Range')
    if (range === 'bytes=2-5') {
      return new Response(AUDIO.slice(2, 6), { status: 206, headers: { 'Content-Range': 'bytes 2-5/16', 'Content-Length': '4', 'Content-Type': 'audio/mpeg' } })
    }
    return new Response(AUDIO, { status: 200, headers: { 'Content-Length': '16', 'Content-Type': 'audio/mpeg' } })
  })
  return { fetchMock, puts }
}

async function makeDb(musicDir = 'music', targetId: string | null = null): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'u', 'x', 'login', 'Author', '', 1, 1)`,
    USER,
  )
  await runSql(
    db,
    `INSERT INTO backup_targets (id, user_id, type, name, enabled, config, secret, created_at, updated_at)
     VALUES (?1, ?2, 'webdav', 'Cloud', 1, ?3, 'stored', 1, 1)`,
    TARGET, USER, JSON.stringify({ url: 'https://dav.example.com/dav/', username: 'me', prefix: '', mode: 'archive' }),
  )
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

function makeApp(settings: { musicDir?: string; musicTargetId?: string | null }): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  const settingsRaw = JSON.stringify({ backup: { musicDir: settings.musicDir ?? 'music', musicTargetId: settings.musicTargetId ?? null } })
  app.use('/api/music', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { settingsRaw } as unknown as AppBindings['Variables']['user'])
    await next()
  })
  app.use('/api/music/*', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { settingsRaw } as unknown as AppBindings['Variables']['user'])
    await next()
  })
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('music webdav routes', () => {
  it('lists audio entries from the configured directory', async () => {
    const { fetchMock } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({})
    const res = await request(app, '/api/music/webdav')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.configured).toBe(true)
    expect(body.dir).toBe('music')
    expect(body.entries.map((entry: { name: string }) => entry.name)).toEqual(['Live', 'song.mp3'])
    expect(body.entries[0].isDirectory).toBe(true)
    expect(body.entries[1]).toMatchObject({ path: 'song.mp3', sizeBytes: 16, mime: 'audio/mpeg' })
    const propfind = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PROPFIND')
    expect(String(propfind?.[0])).toBe('https://dav.example.com/dav/music')
  })

  it('honours the configured subdirectory and target', async () => {
    const { fetchMock } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({ musicDir: 'audio/tracks', musicTargetId: TARGET })
    const res = await request(app, '/api/music/webdav?path=Live')
    expect(res.status).toBe(200)
    const propfind = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PROPFIND')
    expect(String(propfind?.[0])).toBe('https://dav.example.com/dav/audio/tracks/Live')
  })

  it('reports an unconfigured library instead of failing', async () => {
    await makeDb()
    await runSql(DB_ENV.env.DB as unknown as D1Shim, 'DELETE FROM backup_targets')
    const app = makeApp({})
    const res = await request(app, '/api/music/webdav')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.configured).toBe(false)
    expect(body.entries).toEqual([])
    expect(typeof body.reason).toBe('string')
  })

  it('imports a remote file and streams it back with range support', async () => {
    const { fetchMock } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({})

    const imported = await json(app, '/api/music/webdav/import', { path: 'song.mp3', title: 'Song', artist: 'Someone' })
    expect(imported.status).toBe(201)
    const track = await imported.json()
    expect(track.source).toBe('webdav')
    expect(track.objectKey).toBe('song.mp3')
    expect(track.sizeBytes).toBe(16)
    expect(track.mime).toBe('audio/mpeg')

    const full = await request(app, `/api/music/tracks/${track.id}/stream`)
    expect(full.status).toBe(200)
    expect(await full.text()).toBe('0123456789abcdef')

    const ranged = await request(app, `/api/music/tracks/${track.id}/stream`, { headers: { Range: 'bytes=2-5' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 2-5/16')
    expect(await ranged.text()).toBe('2345')

    const download = await request(app, `/api/music/tracks/${track.id}/stream?download=1`)
    expect(download.headers.get('Content-Disposition')).toContain('attachment')
  })

  it('rejects a missing remote file and unsupported formats', async () => {
    const { fetchMock } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({})
    const missing = await json(app, '/api/music/webdav/import', { path: 'missing.mp3' })
    expect(missing.status).toBe(404)

    const traversal = await json(app, '/api/music/webdav/import', { path: '../secret.mp3' })
    expect(traversal.status).toBe(400)
  })

  it('uploads to webdav and records a webdav-sourced track', async () => {
    const { fetchMock, puts } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({})
    const form = new FormData()
    form.append('file', new File([AUDIO], 'local.mp3', { type: 'audio/mpeg' }))
    form.append('title', 'Local song')
    const res = await request(app, '/api/music/webdav/upload', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    const track = await res.json()
    expect(track.source).toBe('webdav')
    expect(track.title).toBe('Local song')
    expect(track.objectKey).toMatch(/^local-.*\.mp3$/)
    expect(puts).toHaveLength(1)
    expect([...puts[0]!.body]).toEqual([...AUDIO])

    const library = await (await request(app, '/api/music/library')).json()
    expect(library.stats.trackCount).toBe(1)
    expect(library.tracks[0].source).toBe('webdav')
  })

  it('deleting a webdav track never touches the remote file', async () => {
    const { fetchMock } = fakeWebdav()
    vi.stubGlobal('fetch', fetchMock)
    await makeDb()
    const app = makeApp({})
    const track = await (await json(app, '/api/music/webdav/import', { path: 'song.mp3' })).json()
    const removed = await request(app, `/api/music/tracks/${track.id}`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit | undefined)?.method ?? 'GET')
    expect(methods).not.toContain('DELETE')
    expect((await (await request(app, '/api/music/library')).json()).tracks).toEqual([])
  })
})
