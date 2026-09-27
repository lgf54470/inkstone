import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { MUSIC_PLAYBACK_MIGRATION_STATEMENTS } from '../src/worker/db/schema/music'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { musicRoutes } from '../src/worker/routes/music'
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
  const seed = async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', USER)
    c.set('user', { id: USER, username: 'owner', login: 'login', name: 'Author', avatarUrl: '', role: 'owner', createdAt: 1, settingsRaw: '{}' })
    await next()
  }
  app.use('/api/music', seed)
  app.use('/api/music/*', seed)
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/music', musicRoutes)
  return app
}

function batch(app: Hono<AppBindings>, ids: string[], action: string): Promise<Response> {
  return app.request('/api/music/tracks/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action }),
  }, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

// One stored object per row: the table's unique key is (user_id, object_key), so a shared
// placeholder key would make the second insert fail rather than describe anything real.
async function insertRow(db: D1Shim, id: string, playedAt: number | null, plays: number): Promise<void> {
  await runSql(
    db,
    `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, play_count, last_played_at, created_at, updated_at)
     VALUES (?1, ?2, 'Song A', 'Ann', '', 1000, 'r2', ?3, 'audio/mpeg', 0, ?4, ?5, 1, 1)`,
    id, USER, `objects/${id}.mp3`, plays, playedAt,
  )
}

async function readRow(db: D1Shim, id: string): Promise<{ play_count: number; last_played_at: number | null }> {
  return await db.prepare('SELECT play_count, last_played_at FROM music_tracks WHERE id = ?1').bind(id).first() as { play_count: number; last_played_at: number | null }
}

// FB-F12: forgetting is about the recent list only. A row that is still in the library must
// keep everything else it carries, and a row that is not the caller's is not touched.
describe('play history removal (FB-F12)', () => {
  it('clears the played stamp of the asked-for rows and keeps their play count', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-1', 111, 7)
    await insertRow(db, 't-2', 222, 3)

    const res = await batch(app, ['t-1'], 'forget')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, updated: 1 })
    expect(await readRow(db, 't-1')).toEqual({ play_count: 7, last_played_at: null })
    expect(await readRow(db, 't-2')).toEqual({ play_count: 3, last_played_at: 222 })
  })

  it('clears many rows in one request', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await insertRow(db, 't-1', 111, 1)
    await insertRow(db, 't-2', 222, 1)
    await insertRow(db, 't-3', 333, 1)

    await batch(app, ['t-1', 't-2', 't-3'], 'forget')
    expect((await readRow(db, 't-1')).last_played_at).toBeNull()
    expect((await readRow(db, 't-2')).last_played_at).toBeNull()
    expect((await readRow(db, 't-3')).last_played_at).toBeNull()
  })

  it('leaves another account\'s rows alone', async () => {
    await makeDb()
    const app = makeApp()
    const db = DB_ENV.env.DB as unknown as D1Shim
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES ('user-2', 'other', 'x', 'other', 'Other', '', 1, 1)`,
    )
    await insertRow(db, 't-1', 111, 1)
    await runSql(
      db,
      `INSERT INTO music_tracks (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, play_count, last_played_at, created_at, updated_at)
       VALUES ('t-9', 'user-2', 'Theirs', '', '', 1000, 'r2', 'objects/t-9.mp3', 'audio/mpeg', 0, 5, 999, 1, 1)`,
    )

    await batch(app, ['t-1', 't-9'], 'forget')
    expect((await readRow(db, 't-1')).last_played_at).toBeNull()
    expect((await readRow(db, 't-9')).last_played_at).toBe(999)
  })

  it('rejects an action it does not know', async () => {
    await makeDb()
    const app = makeApp()
    expect((await batch(app, ['t-1'], 'forget-all')).status).toBe(400)
  })
})
