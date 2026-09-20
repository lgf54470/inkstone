import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogPublicRoutes } from '../src/worker/routes/blog'
import { musicPageRoutes, musicRoutes } from '../src/worker/routes/music'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const AUDIO = new TextEncoder().encode('0123456789abcdef')
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext
const USER_ROW = { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner' as const, createdAt: 1, settingsRaw: '{}' }
const INDEX_HTML = '<html><head><title>Inkstone</title></head><body></body></html>'

function fakeR2() {
  return {
    put: vi.fn(async () => ({})),
    head: vi.fn(async () => ({ size: AUDIO.byteLength })),
    get: vi.fn(async (key: string) => ({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(AUDIO)
          controller.close()
        },
      }),
      size: AUDIO.byteLength,
      arrayBuffer: async () => AUDIO.buffer.slice(AUDIO.byteOffset, AUDIO.byteOffset + AUDIO.byteLength),
    })),
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
  DB_ENV.env.ASSETS = { fetch: async () => new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html' } }) }
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'owner', 'x', 'login', 'Author', '', 1, 1)`,
    USER,
  )
  return db
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/music', async (c, next) => {
    c.set('userId', USER)
    c.set('user', USER_ROW)
    await next()
  })
  app.use('/api/music/*', async (c, next) => {
    c.set('userId', USER)
    c.set('user', USER_ROW)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  app.route('/playlist', musicPageRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function uploadTrack(app: Hono<AppBindings>, name: string, type = 'audio/mpeg'): Promise<Record<string, string>> {
  const form = new FormData()
  form.append('file', new File([AUDIO], name, { type }))
  form.append('durationMs', '200000')
  const res = await request(app, '/api/music/tracks', { method: 'POST', body: form })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json() as Promise<Record<string, string>>
}

async function createPlaylist(app: Hono<AppBindings>, name: string): Promise<string> {
  const res = await request(app, '/api/music/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: 'late-night drives' }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  return (await res.json() as { id: string }).id
}

async function addItem(app: Hono<AppBindings>, playlistId: string, trackId: string): Promise<void> {
  const res = await request(app, `/api/music/playlists/${playlistId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
}

async function share(app: Hono<AppBindings>, playlistId: string): Promise<Response> {
  return request(app, `/api/music/playlists/${playlistId}/share`, { method: 'POST' })
}

describe('playlist share routes (real D1 + fake R2)', () => {
  it('shares a playlist privately-by-default and answers with the slug', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Night Drive')
    const shared = await share(app, playlistId)
    expect(shared.status, await shared.clone().text()).toBe(200)
    const payload = await shared.json() as { shareSlug: string; id: string }
    expect(payload.id).toBe(playlistId)
    expect(payload.shareSlug).toMatch(/^[0-9a-hjkmnp-tv-z]{20}$/)

    const listed = await (await request(app, '/api/music/playlists')).json() as { playlists: Array<{ id: string; shareSlug: string | null }> }
    expect(listed.playlists.find((entry) => entry.id === playlistId)?.shareSlug).toBe(payload.shareSlug)
  })

  it('keeps the handed-out link stable when sharing again', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Road')
    const first = await (await share(app, playlistId)).json() as { shareSlug: string }
    const second = await (await share(app, playlistId)).json() as { shareSlug: string }
    expect(second.shareSlug).toBe(first.shareSlug)
  })

  it('serves track data through the playlist link without the library-wide publish', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Night Drive')
    const t1 = await uploadTrack(app, 'first.mp3')
    const t2 = await uploadTrack(app, 'second.mp3')
    // Manual order: second was added first, so the public page must show it first.
    await addItem(app, playlistId, t2.id!)
    await addItem(app, playlistId, t1.id!)
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug

    const before = await request(app, '/api/blog/public/music/library')
    expect(((await before.json()) as { enabled: boolean }).enabled).toBe(false)

    const res = await request(app, `/api/blog/public/music/playlists/${slug}`)
    expect(res.status, await res.clone().text()).toBe(200)
    const page = await res.json() as { name: string; description: string; tracks: Array<Record<string, unknown>> }
    expect(page.name).toBe('Night Drive')
    expect(page.description).toBe('late-night drives')
    expect(page.tracks.map((track) => track.title)).toEqual(['second', 'first'])
    expect(page.tracks[0]!.streamUrl).toBe(`http://localhost/api/blog/public/music/playlists/${slug}/tracks/${t2.id}/stream`)
    expect(page.tracks[0]!.coverUrl).toBeNull()
    expect(page.tracks[0]!.tagIds).toEqual([])
    expect(page.tracks[0]!.objectKey).toBeUndefined()

    const stream = await request(app, `/api/blog/public/music/playlists/${slug}/tracks/${t1.id}/stream`)
    expect(stream.status).toBe(200)
    expect(stream.headers.get('Cache-Control')).toBe('public, max-age=600')
    expect(new Uint8Array(await stream.arrayBuffer())).toEqual(AUDIO)
  })

  it('hands the stored mime to the shared page so a video reads as video', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Clips')
    const song = await uploadTrack(app, 'song.mp3')
    const clip = await uploadTrack(app, 'clip.mp4', 'video/mp4')
    await addItem(app, playlistId, song.id!)
    await addItem(app, playlistId, clip.id!)
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug

    const page = await (await request(app, `/api/blog/public/music/playlists/${slug}`)).json() as {
      tracks: Array<Record<string, unknown>>
    }
    // The container extension is not the kind: a shared page that cannot read the mime has
    // to guess, and guessing wrong gives a reader a silent box instead of a picture.
    expect(page.tracks.map((entry) => [entry.title, entry.mime])).toEqual([['song', 'audio/mpeg'], ['clip', 'video/mp4']])
  })

  it('rejects streaming a track that is not inside the shared playlist', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Gated')
    const inside = await uploadTrack(app, 'inside.mp3')
    const outside = await uploadTrack(app, 'outside.mp3')
    await addItem(app, playlistId, inside.id!)
    // The outside track sits in another playlist that was never shared: only
    // the share_slug condition may keep it out of this link's reach.
    await addItem(app, await createPlaylist(app, 'Private'), outside.id!)
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug

    expect((await request(app, `/api/blog/public/music/playlists/${slug}/tracks/${outside.id}/stream`)).status).toBe(404)
    expect((await request(app, `/api/blog/public/music/playlists/${slug}/tracks/${outside.id}/cover`)).status).toBe(404)
    expect((await request(app, `/api/blog/public/music/playlists/${slug}/tracks/${inside.id}/stream`)).status).toBe(200)
  })

  it('kills the public link the moment sharing is turned off', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Temporary')
    const track = await uploadTrack(app, 'temp.mp3')
    await addItem(app, playlistId, track.id!)
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug

    const revoked = await request(app, `/api/music/playlists/${playlistId}/share`, { method: 'DELETE' })
    expect(revoked.status, await revoked.clone().text()).toBe(200)
    expect(((await revoked.json()) as { shareSlug: string | null }).shareSlug).toBeNull()

    expect((await request(app, `/api/blog/public/music/playlists/${slug}`)).status).toBe(404)
    expect((await request(app, `/api/blog/public/music/playlists/${slug}/tracks/${track.id}/stream`)).status).toBe(404)
  })

  it('lets an unknown slug find nothing and reports a missing playlist as 404', async () => {
    await makeDb()
    const app = makeApp()
    expect((await request(app, '/api/blog/public/music/playlists/zzzzzzzzzzzzzzzzzzzzzz')).status).toBe(404)
    expect((await share(app, 'missing-playlist')).status).toBe(404)
  })
})

describe('anonymous playlist page shell', () => {
  it('titles the shell after the shared playlist and keeps it out of indexes', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Night Drive')
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug

    const page = await request(app, `/playlist/${slug}`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('<title>Night Drive · Inkstone</title>')
    expect(html).toContain('noindex, nofollow')
    expect(page.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('renders the unavailable shell for revoked or malformed slugs', async () => {
    await makeDb()
    const app = makeApp()
    const playlistId = await createPlaylist(app, 'Gone')
    const slug = (await (await share(app, playlistId)).json() as { shareSlug: string }).shareSlug
    await request(app, `/api/music/playlists/${playlistId}/share`, { method: 'DELETE' })

    const revoked = await request(app, `/playlist/${slug}`)
    expect(revoked.status).toBe(200)
    expect(await revoked.text()).toContain('Content unavailable')
    expect(await (await request(app, `/playlist/${encodeURIComponent('bad slug!')}`)).text()).toContain('Content unavailable')
  })
})

describe('deployment routing for the anonymous page', () => {
  // The SPA asset fallback would otherwise swallow /playlist/:slug before the
  // worker ever renders its shell (title and noindex), so both deployments must
  // keep the path worker-first.
  it('keeps /playlist ahead of the asset fallback in both wrangler configs', () => {
    for (const file of ['wrangler.toml', 'wrangler.kv.toml']) {
      const toml = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      expect(toml, file).toContain('"/playlist",')
      expect(toml, file).toContain('"/playlist/*",')
    }
  })
})
