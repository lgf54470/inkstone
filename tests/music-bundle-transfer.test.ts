import { describe, expect, it, vi } from 'vitest'
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
import type { MusicLibrary, MusicTag, MusicTrack } from '../src/shared/types'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicObjectKey } from '../src/worker/routes/music/keys'
import { musicRoutes } from '../src/worker/routes/music'
import { transferRoutes } from '../src/worker/routes/transfer'
import { createD1Database as createDb, queryFirst, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const AUDIO = new TextEncoder().encode('0123456789abcdef')
const ENCODER = new TextEncoder()
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn(), passThroughOnException: () => {} } as unknown as ExecutionContext

interface ImportResult {
  warnings: string[]
}

function fakeR2() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put: vi.fn(async (key: string, value: Uint8Array) => {
      objects.set(key, new Uint8Array(value))
      return {}
    }),
    head: vi.fn(async () => ({ size: AUDIO.byteLength })),
    get: vi.fn(async () => null),
    delete: vi.fn(async () => ({})),
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  for (const statement of MUSIC_PLAYBACK_MIGRATION_STATEMENTS) await runSql(db, statement)
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    USER, `user-${USER}`, H.now,
  )
  DB_ENV.env.DB = db as unknown as D1Database
  DB_ENV.env.FILES = fakeR2() as unknown as AppBindings['Bindings']['FILES']
  return db
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('*', async (c, next) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: H.now, settingsRaw: '{}' })
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  app.route('/api', transferRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function json(app: Hono<AppBindings>, path: string, body: unknown, method = 'POST'): Promise<Response> {
  return request(app, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function uploadTrack(app: Hono<AppBindings>, title: string, extra: Record<string, string> = {}): Promise<MusicTrack> {
  const form = new FormData()
  form.append('file', new File([AUDIO], `${title}.mp3`, { type: 'audio/mpeg' }))
  form.append('title', title)
  for (const [key, value] of Object.entries(extra)) form.append(key, value)
  const response = await request(app, '/api/music/tracks', { method: 'POST', body: form })
  expect(response.status).toBe(201)
  return await response.json() as MusicTrack
}

async function exportBundle(app: Hono<AppBindings>): Promise<Record<string, unknown>> {
  const response = await request(app, '/api/export?format=json')
  expect(response.status).toBe(200)
  return JSON.parse(await response.text()) as Record<string, unknown>
}

async function importBundleFile(app: Hono<AppBindings>, bundle: unknown): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', new File([ENCODER.encode(JSON.stringify(bundle))], 'inkstone-export.json'))
  const response = await request(app, '/api/import', { method: 'POST', body: form })
  expect(response.status).toBe(200)
  return await response.json() as ImportResult
}

async function loadLibrary(app: Hono<AppBindings>): Promise<MusicLibrary> {
  const response = await request(app, '/api/music/library')
  expect(response.status).toBe(200)
  return await response.json() as MusicLibrary
}

async function wipeMusic(db: D1Shim): Promise<void> {
  for (const table of ['music_tracks', 'music_tags', 'music_playlists', 'music_playlist_items', 'music_track_tags']) {
    await runSql(db, `DELETE FROM ${table}`)
  }
}

function freshExportBundle(music: unknown): Record<string, unknown> {
  return {
    format: 'inkstone-export',
    version: 1,
    exportedAt: H.now,
    user: { login: 'me', name: 'Me' },
    folders: [],
    tags: [],
    attachments: [],
    notes: [],
    music,
  }
}

interface MusicSection {
  tracks: Record<string, unknown>[]
  tags: Record<string, unknown>[]
  playlists: Record<string, unknown>[]
  playlistItems: Record<string, unknown>[]
}

function craftedTrack(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = `t${String(index).padStart(25, 'c')}`
  const createdAt = 1_700_000_000_000 + index
  return {
    id,
    title: `Crafted ${index}`,
    artist: '',
    album: '',
    durationMs: 1000,
    source: 'r2',
    objectKey: musicObjectKey('mp3', id, createdAt),
    mime: 'audio/mpeg',
    sizeBytes: 10,
    coverUrl: null,
    lyric: null,
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    contentHash: null,
    tagIds: [],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

function craftedTag(index: number): Record<string, unknown> {
  return {
    id: `g${String(index).padStart(25, 'c')}`,
    name: `Crafted tag ${index}`,
    color: null,
    parentId: null,
    isPinned: false,
    sortOrder: 0,
    createdAt: 1_700_000_000_000 + index,
  }
}

function craftedPlaylist(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `p${String(index).padStart(25, 'c')}`,
    name: `Crafted playlist ${index}`,
    description: '',
    isPinned: false,
    isFavorite: false,
    shareSlug: null,
    sortOrder: 0,
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index,
    ...overrides,
  }
}

function craftedItem(index: number, playlistId: string, trackId: string): Record<string, unknown> {
  return {
    id: `k${String(index).padStart(25, 'c')}`,
    playlistId,
    trackId,
    sortOrder: index,
    createdAt: 1_700_000_000_000 + index,
  }
}

function section(overrides: Partial<MusicSection>): MusicSection {
  return { tracks: [], tags: [], playlists: [], playlistItems: [], ...overrides }
}

describe('music section of the JSON export bundle', () => {
  it('exports the library and restores every piece of metadata after a wipe', async () => {
    const db = await makeDb()
    const app = makeApp()
    const tag = await (await json(app, '/api/music/tags', { name: 'rock', color: '#ff0000' })).json() as MusicTag
    const track = await uploadTrack(app, 'First Song', {
      artist: 'Aria',
      album: 'Solo',
      durationMs: '1234',
      lyric: '[00:01.00] la la',
      tagIds: JSON.stringify([tag.id]),
    })
    const playlist = await (await json(app, '/api/music/playlists', { name: 'Mix', description: 'road trip' })).json() as { id: string }
    expect((await json(app, `/api/music/playlists/${playlist.id}/items`, { trackId: track.id })).status).toBeLessThan(300)

    const bundle = await exportBundle(app)
    const music = (bundle as { music: MusicSection }).music
    expect(music.tracks).toHaveLength(1)
    expect(music.tracks[0]).toMatchObject({
      id: track.id,
      title: 'First Song',
      artist: 'Aria',
      album: 'Solo',
      durationMs: 1234,
      lyric: '[00:01.00] la la',
      source: 'r2',
      objectKey: musicObjectKey('mp3', track.id, track.createdAt),
      sizeBytes: AUDIO.byteLength,
      tagIds: [tag.id],
    })
    expect(music.tracks[0].contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(music.tags.map((entry) => entry.name)).toContain('rock')
    expect(music.playlistItems).toHaveLength(1)
    expect(music.playlistItems[0]).toMatchObject({ playlistId: playlist.id, trackId: track.id })

    await wipeMusic(db)
    expect((await loadLibrary(app)).tracks).toHaveLength(0)

    const result = await importBundleFile(app, bundle)
    expect(result.warnings).toEqual([])

    const library = await loadLibrary(app)
    expect(library.tracks).toHaveLength(1)
    expect(library.tracks[0]).toMatchObject({
      id: track.id,
      title: 'First Song',
      artist: 'Aria',
      album: 'Solo',
      durationMs: 1234,
      hasLyric: true,
      contentHash: track.contentHash,
    })
    expect(library.tracks[0].tagIds).toEqual([tag.id])
    expect(library.tags.map((entry) => entry.name)).toContain('rock')
    expect(library.playlists[0].name).toBe('Mix')
    expect(library.playlists[0].items.map((item) => item.trackId)).toEqual([track.id])
  })

  it('drops a track whose R2 key is not derived from its own id', async () => {
    const db = await makeDb()
    const app = makeApp()
    const own = craftedTrack(900)
    const stolenKey = craftedTrack(901, { objectKey: musicObjectKey('mp3', 'z'.repeat(26), 1_700_000_000_000) })
    const foreignPrefix = craftedTrack(902, { objectKey: 'files/elsewhere.mp3' })
    const fakeHash = craftedTrack(903, { contentHash: 'deadbeef' })
    const result = await importBundleFile(app, freshExportBundle(section({
      tracks: [own, { ...own }, stolenKey, foreignPrefix, fakeHash],
    })))
    expect(result.warnings).toEqual([
      'Skipped 3 invalid track rows in the export',
      'Skipped 1 duplicated track IDs in the export',
    ])
    const library = await loadLibrary(app)
    expect(library.tracks.map((entry) => entry.id)).toEqual([own.id as string])
    const stored = await queryFirst(db, 'SELECT object_key FROM music_tracks WHERE user_id = ?1', USER)
    expect(stored).toMatchObject({ object_key: own.objectKey })
  })

  it('keeps WebDAV rows only when the path stays relative and outside the app namespace', async () => {
    await makeDb()
    const app = makeApp()
    const relative = craftedTrack(910, { source: 'webdav', objectKey: 'albums/live.mp3' })
    const traversal = craftedTrack(911, { source: 'webdav', objectKey: '../secret.mp3' })
    const absolute = craftedTrack(912, { source: 'webdav', objectKey: '/etc/passwd.mp3' })
    const namespaced = craftedTrack(913, { source: 'webdav', objectKey: 'music/2024-01-01/ghost.mp3' })
    const result = await importBundleFile(app, freshExportBundle(section({
      tracks: [relative, traversal, absolute, namespaced],
    })))
    expect(result.warnings).toEqual(['Skipped 3 invalid track rows in the export'])
    const library = await loadLibrary(app)
    expect(library.tracks.map((entry) => entry.id)).toEqual([relative.id as string])
    expect(library.tracks[0].source).toBe('webdav')
  })

  it('never rewrites rows the account already has', async () => {
    await makeDb()
    const app = makeApp()
    const track = await uploadTrack(app, 'Original Title')
    const bundle = await exportBundle(app)
    expect((bundle as { music: MusicSection }).music.tracks).toHaveLength(1)

    const patched = await json(app, `/api/music/tracks/${track.id}`, { title: 'Renamed After Export' }, 'PATCH')
    expect(patched.status).toBe(200)

    const result = await importBundleFile(app, bundle)
    expect(result.warnings).toEqual([])
    const library = await loadLibrary(app)
    expect(library.tracks).toHaveLength(1)
    expect(library.tracks[0].title).toBe('Renamed After Export')
  })

  it('aggregates dangling tag links and playlist items into counted warnings', async () => {
    await makeDb()
    const app = makeApp()
    const tag = craftedTag(921)
    const track = craftedTrack(920, { tagIds: ['g'.repeat(26), tag.id as string] })
    const playlist = craftedPlaylist(922)
    const unknownTrackId = `v${'1'.repeat(25)}`
    const badSlug = craftedPlaylist(925, { shareSlug: 'not a slug!' })
    const result = await importBundleFile(app, freshExportBundle(section({
      tracks: [track],
      tags: [tag],
      playlists: [playlist, badSlug],
      playlistItems: [
        craftedItem(923, playlist.id as string, track.id as string),
        craftedItem(924, playlist.id as string, unknownTrackId),
      ],
    })))
    expect(result.warnings).toEqual([
      'Skipped 1 invalid playlist rows in the export',
      'Skipped 1 tag links that point at rows outside the restored library',
      'Skipped 1 playlist items that point at rows outside the restored library',
    ])
    const library = await loadLibrary(app)
    expect(library.tracks[0].tagIds).toEqual([tag.id])
    expect(library.playlists[0].items.map((item) => item.trackId)).toEqual([track.id])
  })

  it('skips tracks that would overflow the music quota and reports the count', async () => {
    await makeDb()
    const app = makeApp()
    const perTrack = LIMITS.musicTrackMaxBytes
    const fits = Math.floor(LIMITS.musicQuotaBytes / perTrack)
    const tracks = Array.from({ length: fits + 2 }, (_, index) => craftedTrack(index + 1, { sizeBytes: perTrack }))
    const result = await importBundleFile(app, freshExportBundle(section({ tracks })))
    expect(result.warnings).toEqual(['Skipped 2 tracks that would exceed the music storage quota'])
    const library = await loadLibrary(app)
    expect(library.tracks).toHaveLength(fits)
    expect(library.stats.totalBytes).toBe(fits * perTrack)

    // Rows the account already has must not count against the quota twice.
    const again = await importBundleFile(app, freshExportBundle(section({ tracks })))
    expect(again.warnings).toEqual(['Skipped 2 tracks that would exceed the music storage quota'])
    expect((await loadLibrary(app)).tracks).toHaveLength(fits)
  })

  // A WebDAV row points at bytes on somebody else's server; its size is only what
  // that server answered, so it must not eat the quota the restore measures.
  it('does not charge WebDAV-referenced bytes against the restore quota', async () => {
    const db = await makeDb()
    const app = makeApp()
    await runSql(
      db,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes,
         cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
       VALUES ('remote-1', ?1, 'Remote', '', '', 0, 'webdav', 'albums/remote.mp3', 'audio/mpeg', ?2, NULL, NULL, 0, 0, 0, ?3, ?3)`,
      USER, LIMITS.musicQuotaBytes, H.now,
    )
    const result = await importBundleFile(app, freshExportBundle(section({
      tracks: [craftedTrack(930), craftedTrack(931, { source: 'webdav', objectKey: 'albums/live.mp3' })],
    })))
    expect(result.warnings).toEqual([])
    expect((await loadLibrary(app)).tracks).toHaveLength(3)
  })

  it('leaves bundles without a music section alone and warns on a corrupt one', async () => {
    await makeDb()
    const app = makeApp()
    const clean = await exportBundle(app)
    expect(clean.music).toBeUndefined()
    expect((await importBundleFile(app, clean)).warnings).toEqual([])

    const corrupt = await importBundleFile(app, freshExportBundle('nonsense'))
    expect(corrupt.warnings).toEqual(['Skipped the music section of the export: it is not a valid library snapshot'])
    expect((await loadLibrary(app)).tracks).toHaveLength(0)
  })
})
