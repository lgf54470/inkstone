import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { settingsRoutes } from '../src/worker/routes/settings'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const OTHER = 'other-user'
const DB_ENV = { env: { DB: null as unknown as D1Database } }

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedNote(db: D1Shim, id: string, userId: string, fields: Record<string, unknown> = {}): Promise<void> {
  const merged = {
    id,
    user_id: userId,
    folder_id: null,
    title: 'Seed note',
    title_key: '',
    content: '',
    excerpt: '',
    rev: 1,
    word_count: 2,
    char_count: 5,
    is_pinned: 0,
    is_starred: 0,
    is_archived: 0,
    position: 0,
    content_hash: 'hash',
    created_at: 1000,
    updated_at: 1000,
    deleted_at: null,
    ...fields,
  }
  const cols = Object.keys(merged)
  await runSql(
    db,
    `INSERT INTO notes (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
    ...cols.map((col) => merged[col as keyof typeof merged]),
  )
}

async function seedAttachment(db: D1Shim, id: string, userId: string, size: number): Promise<void> {
  await runSql(
    db,
    `INSERT INTO attachments (id, user_id, note_id, filename, mime, size, sha256, storage, created_at)
      VALUES (?1, ?2, NULL, 'a.png', 'image/png', ?3, 'sha', 'r2', 1000)`,
    id,
    userId,
    size,
  )
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('*', async (c, next) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/settings', settingsRoutes)
  return app
}

describe('settings stats', () => {
  it('counts one user\'s notes, words, and attachments in a single pass', async () => {
    const db = await makeDb()
    await seedNote(db, 'n-1', USER)
    await seedNote(db, 'n-2', USER, { word_count: 4, char_count: 9 })
    await seedNote(db, 'n-3', USER, { deleted_at: 2000, word_count: 100, char_count: 900 })
    await seedNote(db, 'n-4', OTHER)
    await seedAttachment(db, 'a-1', USER, 120)
    await seedAttachment(db, 'a-2', USER, 80)
    await seedAttachment(db, 'a-3', OTHER, 500)
    await runSql(db, `INSERT INTO folders (id, user_id, name, position, created_at, updated_at)
      VALUES ('f-1', ?1, 'Folder', 0, 1000, 1000)`, USER)
    await runSql(db, `INSERT INTO tags (id, user_id, name, created_at) VALUES ('t-1', ?1, 'Tag', 1000)`, USER)

    const response = await makeApp().request('/api/settings/stats', {}, DB_ENV.env as AppBindings['Bindings'])
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      notes: 2,
      trashed: 1,
      words: 6,
      chars: 14,
      folders: 1,
      tags: 1,
      attachments: 2,
      attachmentBytes: 200,
      versions: 0,
      links: 0,
    })
  })
})
