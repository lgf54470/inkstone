import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, queryFirst, queryRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-rev-1'
const OTHER = 'user-rev-2'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedUser(db: D1Shim, id = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', 1000, 1000)`,
    id, `user-${id}`,
  )
}

async function seedNote(db: D1Shim, id: string, title: string, content: string, userId = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, '', ?4, '', 1, 1, 1, 0, 0, 0, 0, '', 1000, 1000)`,
    id, userId, title, content,
  )
}

async function seedPost(db: D1Shim, fields: {
  id: string
  slug: string
  noteId: string
  title: string
  content?: string
  userId?: string
  isPinned?: number
  allowComments?: number
  views?: number
}): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, '', NULL, NULL, '[]', 1, ?7, ?8, ?9, 1000, 1000, 1000)`,
    fields.id, fields.slug, fields.noteId, fields.userId ?? USER, fields.title, fields.content ?? 'body',
    fields.allowComments ?? 1, fields.isPinned ?? 0, fields.views ?? 0,
  )
}

function makeApp(actingUserId: string = USER): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/blog', async (c, next) => {
    c.set('userId', actingUserId)
    await next()
  })
  app.use('/api/blog/*', async (c, next) => {
    c.set('userId', actingUserId)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog', blogManageRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function patchJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface RevisionSummary {
  id: string
  postId: string
  title: string
  size: number
  createdAt: number
}

async function listRevisions(app: Hono<AppBindings>, postId: string): Promise<RevisionSummary[]> {
  const res = await request(app, `/api/blog/posts/${postId}/revisions`)
  expect(res.status).toBe(200)
  return (await res.json() as { revisions: RevisionSummary[] }).revisions
}

describe('blog post revision history (FEA-05)', () => {
  it('keeps the state a content patch replaced, body included', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First', content: 'the first body' })
    const app = makeApp()

    expect((await patchJson(app, '/api/blog/posts/p1', { title: 'Second' })).status).toBe(200)

    const revisions = await listRevisions(app, 'p1')
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.title).toBe('First')
    expect(revisions[0]!.size).toBe('the first body'.length)

    const detail = await (await request(app, `/api/blog/posts/p1/revisions/${revisions[0]!.id}`)).json() as {
      revision: { title: string; content: string; slug: string }
    }
    expect(detail.revision).toMatchObject({ title: 'First', content: 'the first body', slug: 'post-one' })
    expect(await queryFirst(db, 'SELECT title FROM blog_posts WHERE id = ?1', 'p1')).toEqual({ title: 'Second' })
  })

  it('records no version for a patch that only moves presentation', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First' })
    const app = makeApp()

    expect((await patchJson(app, '/api/blog/posts/p1', { isPinned: true })).status).toBe(200)
    expect((await patchJson(app, '/api/blog/posts/p1', { isPublished: false })).status).toBe(200)
    expect((await patchJson(app, '/api/blog/posts/p1', { allowComments: false })).status).toBe(200)

    expect(await listRevisions(app, 'p1')).toHaveLength(0)
  })

  it('snapshots before the publish upsert rewrites a post', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedNote(db, 'n1', 'First', 'the first body')
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First' })
    await runSql(db, "UPDATE notes SET title = 'Renamed', content = 'the second body' WHERE id = 'n1'")
    const app = makeApp()

    const res = await postJson(app, '/api/blog/posts', { noteId: 'n1' })
    expect(res.status).toBe(200)

    const revisions = await listRevisions(app, 'p1')
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.title).toBe('First')
  })

  it('snapshots the text /sync replaces', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedNote(db, 'n1', 'From note', 'note body')
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'Post title', content: 'post body' })
    await runSql(db, "UPDATE notes SET content = 'synced body' WHERE id = 'n1'")
    const app = makeApp()

    expect((await postJson(app, '/api/blog/posts/p1/sync', {})).status).toBe(200)

    const revisions = await listRevisions(app, 'p1')
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.title).toBe('Post title')
    expect(await queryFirst(db, 'SELECT content FROM blog_posts WHERE id = ?1', 'p1')).toEqual({ content: 'synced body' })
  })

  it('restores the text and keeps the state and counters the post has now', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First', content: 'first body', isPinned: 1, allowComments: 0, views: 7 })
    const app = makeApp()

    await patchJson(app, '/api/blog/posts/p1', { title: 'Second', content: 'second body' })
    await patchJson(app, '/api/blog/posts/p1', { isPinned: false, allowComments: true })
    const revision = (await listRevisions(app, 'p1'))[0]!

    expect((await postJson(app, `/api/blog/posts/p1/revisions/${revision.id}/restore`, {})).status).toBe(200)

    expect(await queryFirst(db, 'SELECT title, content, is_pinned, allow_comments, views, published_at FROM blog_posts WHERE id = ?1', 'p1'))
      .toEqual({ title: 'First', content: 'first body', is_pinned: 0, allow_comments: 1, views: 7, published_at: 1000 })
    // The restore snapshots what it replaced, so it is itself undoable.
    expect((await listRevisions(app, 'p1'))[0]!.title).toBe('Second')
  })

  it('refuses to restore a slug another live post has taken', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'old-slug', noteId: 'n1', title: 'First' })
    const app = makeApp()

    await patchJson(app, '/api/blog/posts/p1', { slug: 'new-slug' })
    const revision = (await listRevisions(app, 'p1'))[0]!
    await seedPost(db, { id: 'p2', slug: 'old-slug', noteId: 'n2', title: 'Other' })

    const res = await postJson(app, `/api/blog/posts/p1/revisions/${revision.id}/restore`, {})
    expect(res.status).toBe(409)
    expect(await queryFirst(db, 'SELECT slug FROM blog_posts WHERE id = ?1', 'p1')).toEqual({ slug: 'new-slug' })
  })

  it('keeps only the newest twenty versions', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'v0' })
    const app = makeApp()

    for (let index = 1; index <= 25; index += 1) {
      expect((await patchJson(app, '/api/blog/posts/p1', { title: `v${index}` })).status).toBe(200)
    }

    const revisions = await listRevisions(app, 'p1')
    expect(revisions).toHaveLength(20)
    expect(revisions[0]!.title).toBe('v24')
    expect(revisions[19]!.title).toBe('v5')
    expect((await queryRows(db, 'SELECT id FROM blog_revisions')).length).toBe(20)
  })

  it('hides the history from another account and from the recycle bin', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First' })
    const app = makeApp()
    await patchJson(app, '/api/blog/posts/p1', { title: 'Second' })
    const revision = (await listRevisions(app, 'p1'))[0]!

    const other = makeApp(OTHER)
    expect((await request(other, '/api/blog/posts/p1/revisions')).status).toBe(404)
    expect((await request(other, `/api/blog/posts/p1/revisions/${revision.id}`)).status).toBe(404)
    expect((await postJson(other, `/api/blog/posts/p1/revisions/${revision.id}/restore`, {})).status).toBe(404)

    // A post in the bin is not offered for editing, so its history is not either.
    expect((await request(app, '/api/blog/posts/p1', { method: 'DELETE' })).status).toBe(200)
    expect((await request(app, '/api/blog/posts/p1/revisions')).status).toBe(404)
  })

  it('erases the history when the post is purged for good', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, { id: 'p1', slug: 'post-one', noteId: 'n1', title: 'First' })
    const app = makeApp()
    await patchJson(app, '/api/blog/posts/p1', { title: 'Second' })
    expect((await queryRows(db, 'SELECT id FROM blog_revisions')).length).toBe(1)

    await request(app, '/api/blog/posts/p1', { method: 'DELETE' })
    expect((await request(app, '/api/blog/trash/p1', { method: 'DELETE' })).status).toBe(200)
    expect((await queryRows(db, 'SELECT id FROM blog_revisions')).length).toBe(0)
  })
})
