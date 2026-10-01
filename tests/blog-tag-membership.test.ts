import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, queryFirst, queryRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-tags-1'
const OTHER = 'user-tags-2'
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

async function seedPost(db: D1Shim, id: string, tags: string[], userId = USER, deleted = false): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, tags, is_published, published_at, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, 'Post', 'body', ?5, 1, 1000, 1000, 1000, ?6)`,
    id, `slug-${id}`, `note-${id}`, userId, JSON.stringify(tags), deleted ? 1500 : null,
  )
}

async function seedTagRow(db: D1Shim, id: string, name: string, userId = USER, color: string | null = null, pinned = 0): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_tags (id, user_id, name, color, is_pinned, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 1000)`,
    id, userId, name, color, pinned,
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

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function postTags(db: D1Shim, id: string): Promise<string[]> {
  const row = await queryFirst(db, 'SELECT tags FROM blog_posts WHERE id = ?1', id)
  return JSON.parse(String(row?.tags)) as string[]
}

async function tagNames(app: Hono<AppBindings>): Promise<string[]> {
  const tags = await (await request(app, '/api/blog/tags')).json() as Array<{ name: string }>
  return tags.map((tag) => tag.name).sort()
}

describe('blog tag membership moves (ADR-0007)', () => {
  it('renaming a registered tag moves every membership, descendants included', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['alpha', 'alpha/sub'])
    await seedPost(db, 'p-2', ['alpha'])
    await seedTagRow(db, 'tag-alpha', 'alpha', USER, '#fff')
    const app = makeApp()

    const res = await patchJson(app, '/api/blog/tags/tag-alpha', { name: 'beta' })
    expect(res.status).toBe(200)

    expect(await postTags(db, 'p-1')).toEqual(['beta', 'beta/sub'])
    expect(await postTags(db, 'p-2')).toEqual(['beta'])
    // The old name is gone from both the list and the public tag filter; the metadata row followed.
    expect(await tagNames(app)).toEqual(['beta', 'beta/sub'])
    const publicByOld = await (await request(app, '/api/blog/public/posts?tag=alpha')).json() as { posts: unknown[] }
    expect(publicByOld.posts).toHaveLength(0)
    const publicByNew = await (await request(app, '/api/blog/public/posts?tag=beta')).json() as { posts: unknown[] }
    expect(publicByNew.posts).toHaveLength(2)
  })

  it('renaming onto a taken name merges: memberships move, the destination keeps its metadata', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['red', 'crimson'])
    await seedPost(db, 'p-2', ['red'])
    await seedTagRow(db, 'tag-red', 'red', USER, '#f00', 1)
    await seedTagRow(db, 'tag-crimson', 'crimson', USER, '#900', 0)
    const app = makeApp()

    const res = await patchJson(app, '/api/blog/tags/tag-red', { name: 'crimson' })
    expect(res.status).toBe(200)

    // The duplicate the merge would otherwise leave inside p-1 is dropped on first occurrence.
    expect(await postTags(db, 'p-1')).toEqual(['crimson'])
    expect(await postTags(db, 'p-2')).toEqual(['crimson'])
    const source = await queryFirst(db, 'SELECT id FROM blog_tags WHERE id = ?1', 'tag-red')
    expect(source).toBeNull()
    const destination = await queryFirst(db, 'SELECT color, is_pinned FROM blog_tags WHERE id = ?1', 'tag-crimson')
    expect(destination).toEqual({ color: '#900', is_pinned: 0 })
  })

  it('refuses to rename a tag under its own path', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['alpha'])
    await seedTagRow(db, 'tag-alpha', 'alpha')
    const app = makeApp()

    const res = await patchJson(app, '/api/blog/tags/tag-alpha', { name: 'alpha/sub' })
    expect(res.status).toBe(400)
    expect(await postTags(db, 'p-1')).toEqual(['alpha'])
  })

  it('merges through the explicit endpoint and materializes a derived target from the source', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['alpha'])
    await seedPost(db, 'p-2', ['beta'])
    await seedTagRow(db, 'tag-alpha', 'alpha', USER, '#0f0', 1)
    const app = makeApp()

    // `beta` has members but no row: it is a derived tag addressed by its name.
    const res = await postJson(app, '/api/blog/tags/tag-alpha/merge', { targetId: 'beta' })
    expect(res.status).toBe(200)
    expect((await res.json() as { moved: number }).moved).toBe(1)

    expect(await postTags(db, 'p-1')).toEqual(['beta'])
    expect(await postTags(db, 'p-2')).toEqual(['beta'])
    expect(await queryFirst(db, 'SELECT id FROM blog_tags WHERE id = ?1', 'tag-alpha')).toBeNull()
    const target = await queryFirst(db, 'SELECT color, is_pinned FROM blog_tags WHERE user_id = ?1 AND name = ?2', USER, 'beta')
    expect(target).toEqual({ color: '#0f0', is_pinned: 1 })
  })

  it('rejects self-merge, descendant merge and unknown targets', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['alpha', 'alpha/sub'])
    await seedTagRow(db, 'tag-alpha', 'alpha')
    const app = makeApp()

    expect((await postJson(app, '/api/blog/tags/tag-alpha/merge', { targetId: 'tag-alpha' })).status).toBe(400)
    expect((await postJson(app, '/api/blog/tags/tag-alpha/merge', { targetId: 'alpha/sub' })).status).toBe(400)
    expect((await postJson(app, '/api/blog/tags/tag-alpha/merge', { targetId: 'nope' })).status).toBe(404)
    expect(await postTags(db, 'p-1')).toEqual(['alpha', 'alpha/sub'])
  })

  it('deleting a tag removes its memberships, the bin included', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['alpha', 'alpha/sub'])
    await seedPost(db, 'p-2', ['alpha'], USER, true)
    await seedTagRow(db, 'tag-alpha', 'alpha')
    const app = makeApp()

    const res = await request(app, '/api/blog/tags/tag-alpha', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json() as { removed: number }).removed).toBe(2)

    expect(await postTags(db, 'p-1')).toEqual([])
    // A restored post must not bring the deleted tag back.
    expect(await postTags(db, 'p-2')).toEqual([])
    expect(await queryFirst(db, 'SELECT id FROM blog_tags WHERE id = ?1', 'tag-alpha')).toBeNull()
    expect(await tagNames(app)).toEqual([])
  })

  it('renames and deletes a derived tag (members without a metadata row)', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['draft'])
    const app = makeApp()

    expect(await tagNames(app)).toEqual(['draft'])
    const renamed = await patchJson(app, '/api/blog/tags/draft', { name: 'published', color: '#123' })
    expect(renamed.status).toBe(200)
    expect(await postTags(db, 'p-1')).toEqual(['published'])
    const materialized = await queryFirst(db, 'SELECT name, color FROM blog_tags WHERE user_id = ?1', USER)
    expect(materialized).toEqual({ name: 'published', color: '#123' })

    const removed = await request(app, '/api/blog/tags/published', { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect(await postTags(db, 'p-1')).toEqual([])
  })

  it('never touches another account\'s tags or posts', async () => {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    await seedPost(db, 'p-mine', ['shared'], USER)
    await seedPost(db, 'p-theirs', ['shared'], OTHER)
    await seedTagRow(db, 'tag-theirs', 'shared', OTHER, '#abc')
    const app = makeApp()

    expect((await patchJson(app, '/api/blog/tags/tag-theirs', { name: 'renamed' })).status).toBe(404)
    expect((await postJson(app, '/api/blog/tags/tag-theirs/merge', { targetId: 'shared' })).status).toBe(404)
    expect((await request(app, '/api/blog/tags/tag-theirs', { method: 'DELETE' })).status).toBe(404)

    expect(await postTags(db, 'p-mine')).toEqual(['shared'])
    expect(await postTags(db, 'p-theirs')).toEqual(['shared'])
    const theirs = await queryFirst(db, 'SELECT name, color FROM blog_tags WHERE id = ?1', 'tag-theirs')
    expect(theirs).toEqual({ name: 'shared', color: '#abc' })
  })

  it('bumps updated_at but leaves published_at alone when memberships move', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedTagRow(db, 'tag-alpha', 'alpha')
    await seedPost(db, 'p-1', ['alpha'])
    const app = makeApp()

    const before = await queryFirst(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', 'p-1')
    await runSql(db, 'UPDATE blog_posts SET updated_at = 42 WHERE id = ?1', 'p-1')

    await patchJson(app, '/api/blog/tags/tag-alpha', { name: 'beta' })

    const after = await queryFirst(db, 'SELECT published_at, updated_at FROM blog_posts WHERE id = ?1', 'p-1')
    expect(after?.published_at).toEqual(before?.published_at)
    expect(Number(after?.updated_at)).toBeGreaterThan(42)
  })

  it('reports the moved count from the merge endpoint for a descendant move', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedPost(db, 'p-1', ['a', 'a/b', 'a/b/c'])
    await seedPost(db, 'p-2', ['other'])
    const app = makeApp()

    const res = await postJson(app, '/api/blog/tags/a/merge', { targetId: 'other' })
    expect((await res.json() as { moved: number }).moved).toBe(1)
    // A descendant of the target path would be rejected, so target `other` receives `a/b` as `other/b`.
    expect(await postTags(db, 'p-1')).toEqual(['other', 'other/b', 'other/b/c'])
  })

  it('batch toggle by tag uses the same escaped needles as the list filter', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedTagRow(db, 'tag-pct', '100%')
    await seedPost(db, 'p-1', ['100%', '100%done'])
    await seedPost(db, 'p-2', ['100x'])
    const app = makeApp()

    const res = await postJson(app, '/api/blog/batch-toggle-group', { type: 'tag', target: '100%', enabled: false })
    expect(res.status).toBe(200)
    const rows = await queryRows(db, 'SELECT id, is_published FROM blog_posts ORDER BY id')
    // `%` is a literal here: only the exact tag and its descendants change, `100x` does not.
    expect(rows).toEqual([
      { id: 'p-1', is_published: 0 },
      { id: 'p-2', is_published: 1 },
    ])
  })
})
