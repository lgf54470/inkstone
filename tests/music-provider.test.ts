import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { JSON_BODY_LIMITS } from '../src/worker/lib/request'
import { LIMITS } from '@shared/constants'
import { musicRoutes } from '../src/worker/routes/music'
import { importProviderTrackSchema } from '../src/worker/routes/music/schemas'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  for (const statement of MUSIC_PLAYBACK_MIGRATION_STATEMENTS) await runSql(db, statement)
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'owner', 'x', 'login', 'Author', '', 1, 1)`,
    USER,
  )
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/music', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  })
  app.use('/api/music/*', async (c, next) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  return app
}

// The init has to reach `app.request`: this helper dropped it, which turned every json() call
// below into a GET and a 404 that looked like a missing route.
function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

// FB2-F1 (red): the import stores artwork on the server side, so the harness needs somewhere for
// it to land. Only the two calls `putMusicObject` makes are needed.
function bindKv() {
  const values = new Map<string, Uint8Array>()
  const kv = {
    put: vi.fn(async (key: string, value: Uint8Array) => { values.set(key, value) }),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    delete: vi.fn(async (key: string) => { values.delete(key) }),
  }
  DB_ENV.env.FILES_KV = kv as unknown as AppBindings['Bindings']['FILES_KV']
  return kv
}

afterEach(() => {
  vi.unstubAllGlobals()
  DB_ENV.env.FILES_KV = undefined as unknown as AppBindings['Bindings']['FILES_KV']
})

describe('provider proxy (FEA-A1-2)', () => {
  it('searches the whitelisted upstream and normalizes the hits', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify([
        { id: 'a1', name: 'Song A', artist: ['Ann', 'Ben'], album: 'Album One', duration: 210000, pic_id: 'p1', lyric_id: 'l1' },
        { id: 'b2', name: 'Song B', artist: 'Cat', album: '', duration: 0 },
      ]), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/search?keywords=song&source=netease')
    expect(res.status).toBe(200)
    const body = await res.json() as { results: Array<{ source: string; sourceId: string; title: string; artist: string; album: string; durationMs: number | null; coverId: string | null; lyricId: string | null }> }
    // FB-F5: the cover and lyric ids the upstream hands out are the only way to ask for that
    // song's artwork and words later, so they survive the normalization instead of being dropped.
    expect(body.results).toEqual([
      { source: 'netease', sourceId: 'a1', title: 'Song A', artist: 'Ann, Ben', album: 'Album One', durationMs: 210000, coverId: 'p1', lyricId: 'l1' },
      { source: 'netease', sourceId: 'b2', title: 'Song B', artist: 'Cat', album: '', durationMs: null, coverId: null, lyricId: null },
    ])
    expect(calls[0]).toContain('music-api.gdstudio.xyz')
    expect(calls[0]).toContain('types=search')
  })

  it('rejects an unknown upstream source and an empty keywords query', async () => {
    await makeDb()
    const app = makeApp()
    expect((await request(app, '/api/music/provider/search?keywords=x&source=spotify')).status).toBe(400)
    expect((await request(app, '/api/music/provider/search?keywords=%20')).status).toBe(400)
  })

  it('answers 502 when the upstream fails or overshoots the byte cap', async () => {
    await makeDb()
    const app = makeApp()
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }))
    expect((await request(app, '/api/music/provider/search?keywords=x&source=kuwo')).status).toBe(502)
    vi.stubGlobal('fetch', async () => new Response('{"data":"', { status: 200 }))
    expect((await request(app, '/api/music/provider/search?keywords=x&source=kuwo')).status).toBe(502)
  })

  it('fetches a lyric through the proxy and hands back its text', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ lyric: '[00:06.220]Hello, it\'s me' }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/lyric?source=netease&id=l1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ lyric: "[00:06.220]Hello, it's me" })
    expect(calls[0]).toContain('types=lyric')
    expect((await request(app, '/api/music/provider/lyric?source=netease&id=')).status).toBe(400)
    expect((await request(app, '/api/music/provider/lyric?source=spotify&id=l1')).status).toBe(400)
  })

  // FB2-PF1: browsing for pictures and resolving a playable URL are two different costs, and the
  // families are read straight off the metering table so a route that quietly went back to the
  // shared one fails here rather than in production.
  it('charges the artwork against its own hourly family', async () => {
    const db = await makeDb()
    const app = makeApp()
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const target = String(url)
      if (target.includes('p2.music.126.net')) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      return new Response(JSON.stringify({ url: 'https://p2.music.126.net/cover.jpg' }), { status: 200 })
    })
    expect((await request(app, '/api/music/provider/cover?source=netease&id=p1')).status).toBe(200)
    const { results } = await db.prepare('SELECT key, fails FROM login_attempts ORDER BY key').all<{ key: string; fails: number }>()
    expect(results).toEqual(expect.arrayContaining([{ key: 'music-providerArtwork:user-1', fails: 1 }]))
    expect(results.some((row) => row.key === 'music-provider:user-1')).toBe(false)
  })

  it('proxies the artwork bytes and refuses a private address', async () => {
    await makeDb()
    const app = makeApp()
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const target = String(url)
      if (target.includes('p2.music.126.net')) return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      return new Response(JSON.stringify({ url: 'https://p2.music.126.net/cover.jpg' }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/cover?source=netease&id=p1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('image/jpeg')
    expect((await res.arrayBuffer()).byteLength).toBe(3)

    // An upstream that answers with an address on this network must not be followed: the
    // picture is fetched from wherever the catalogue says, so that answer has to be a public one.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ url: 'http://127.0.0.1:8080/cover.jpg' }), { status: 200 }))
    expect((await request(app, '/api/music/provider/cover?source=netease&id=p1')).status).toBe(502)
  })

  // FB2-F1: the request carries metadata and the two catalogue ids, and the worker resolves the
  // artwork and the words itself. Posting them back is what made every add of a hit with artwork
  // fail: the body's ceiling is 8 KiB and a cover's base64 alone is several times that.
  it('resolves the lyric from the catalogue instead of accepting it in the body', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ lyric: '[00:01.000]la' }), { status: 200 })
    })
    const res = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease',
      sourceId: 'a1',
      title: 'Song A',
      artist: 'Ann',
      lyricId: 'l1',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { lyric: string | null; hasLyric: boolean; coverUrl: string | null }
    expect(body.lyric).toBe('[00:01.000]la')
    expect(body.hasLyric).toBe(true)
    expect(calls[0]).toContain('types=lyric')
    expect(calls[0]).toContain('id=l1')
    // No object storage in this harness, so a cover is dropped rather than failing the add.
    expect(body.coverUrl).toBeNull()

    // Most catalogues keep the words under the song id itself, which is the fallback.
    const fallback = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease', sourceId: 'a2', title: 'Song B',
    })
    expect(fallback.status).toBe(201)
    expect(calls[1]).toContain('id=a2')
  })

  // The retired fields are refused rather than ignored: a stale client that still posts the cover
  // and the words must not look like it worked while both are dropped on the floor.
  it('refuses a body that still carries the artwork or the words', async () => {
    await makeDb()
    const app = makeApp()
    const withCover = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease', sourceId: 'a1', title: 'Song A', coverDataUrl: 'data:image/jpeg;base64,AAAA',
    })
    expect(withCover.status).toBe(400)
    const withLyric = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease', sourceId: 'a2', title: 'Song B', lyric: '[00:01.000]la',
    })
    expect(withLyric.status).toBe(400)
  })

  // FB2-F1: the picture is fetched here too, from the catalogue's own picture id, and stored
  // through the same derived-key path an uploaded cover takes — so `cover_url` stays a key and
  // every read surface keeps working without a special case for online rows.
  it('fetches and stores the artwork itself, asking the catalogue for its small size', async () => {
    await makeDb()
    const app = makeApp()
    const kv = bindKv()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const target = String(url)
      calls.push(target)
      if (target.includes('p2.music.126.net')) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      }
      if (target.includes('types=pic')) {
        return new Response(JSON.stringify({ url: 'https://p2.music.126.net/cover.jpg' }), { status: 200 })
      }
      return new Response(JSON.stringify({ lyric: '' }), { status: 200 })
    })
    const res = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease', sourceId: 'a1', title: 'Song A', coverId: 'p1', lyricId: 'l1',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { coverUrl: string | null; hasLyric: boolean }
    // The row answers with the cover route, and the bytes behind it sit under the same derived key
    // an uploaded cover uses — that key is what every read surface already resolves.
    expect(body.coverUrl).toMatch(/^\/api\/music\/tracks\/[^/]+\/cover$/)
    expect(kv.put.mock.calls[0]?.[0]).toMatch(/^music\/cover\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/)
    // A 300px square is what the list and card surfaces draw; anything larger is bytes nobody sees.
    expect(calls.find((target) => target.includes('types=pic'))).toContain('size=300')
    // An empty answer is "nothing to store", not a lyric.
    expect(body.hasLyric).toBe(false)
  })

  // Best effort by design: a catalogue that will not answer about its own artwork or words must
  // not stop the song from being added.
  it('still adds the row when the artwork or the lyric lookup fails', async () => {
    await makeDb()
    const app = makeApp()
    bindKv()
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }))
    const res = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease', sourceId: 'a1', title: 'Song A', coverId: 'p1', lyricId: 'l1',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ coverUrl: null, hasLyric: false })
  })

  // FB-F8: the row carries the catalogue it came from, so the client can ask for "the same song
  // elsewhere" without offering the entry that just failed. Another source's row has no catalogue.
  it('names the catalogue identity a provider row was written with', async () => {
    await makeDb()
    const app = makeApp()
    const imported = await json(app, '/api/music/tracks/import-provider', {
      source: 'netease',
      sourceId: 'a1',
      title: 'Song A',
    })
    expect(imported.status).toBe(201)
    expect(await imported.json()).toMatchObject({ providerSource: 'netease', providerSongId: 'a1' })

    // The same identity has to survive the library listing, which is where a reader's rows come from.
    const listed = await request(app, '/api/music/library')
    const body = await listed.json() as { tracks: { providerSource?: string | null; providerSongId?: string | null }[] }
    const row = body.tracks.find((entry) => entry.providerSource === 'netease')
    expect(row?.providerSongId).toBe('a1')
  })

  it('resolves one playable url per play through the url endpoint', async () => {
    await makeDb()
    const app = makeApp()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ url: 'https://cdn.example.com/stream.mp3', br: 320000 }), { status: 200 })
    })
    const res = await request(app, '/api/music/provider/url?source=netease&id=a1&quality=320')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ url: 'https://cdn.example.com/stream.mp3' })
    expect(calls[0]).toContain('types=url')
    expect((await request(app, '/api/music/provider/url?source=netease&id=')).status).toBe(400)
  })

  // FB2-C2: the two ends of one body, asked together. This route allows 8 KiB and the schema says
  // which fields may fill it, so the largest body that schema accepts has to arrive — otherwise the
  // request is refused as "too large" before the validator ever runs, which is the FB2-F1
  // regression: the page used to send the catalogue's artwork and words, and met the ceiling rather
  // than the schema. The margin is asked for at half the allowance, because the payload that broke
  // it was measured in hundreds of kilobytes.
  it('holds the widest body its own schema accepts inside the route allowance', async () => {
    await makeDb()
    const app = makeApp()
    bindKv()
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }))
    const widest = {
      source: 'netease',
      sourceId: 'i'.repeat(128),
      // A snowman encodes to three bytes, the same as a CJK character: the worst case for a
      // character count that is really a byte count.
      title: '☃'.repeat(LIMITS.musicTitleMaxLength),
      artist: '☃'.repeat(LIMITS.musicArtistMaxLength),
      album: '☃'.repeat(LIMITS.musicAlbumMaxLength),
      durationMs: 3_600_000,
      coverId: 'c'.repeat(128),
      lyricId: 'l'.repeat(128),
    }
    expect(importProviderTrackSchema.safeParse(widest).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(widest))).toBeLessThan(JSON_BODY_LIMITS.small / 2)
    expect((await json(app, '/api/music/tracks/import-provider', widest)).status).toBe(201)
  })
})

