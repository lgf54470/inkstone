import { describe, expect, it, vi } from 'vitest'
import { Hono, type Context, type Next } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { BLOG_FTS_STATEMENT } from '../src/worker/db/schema/statements'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { auditBlogFtsIndex, rebuildBlogFtsIndex } from '../src/worker/db/blog-fts'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, queryFirst, runSql, type D1Shim } from './d1-harness'

/**
 * The blog index has one writer — the queue — so a drifted index is one whose queue rows were lost
 * or whose post moved on without one. The repair path is operator-triggered: every post of the
 * account is re-enqueued, the queue is drained without waiting out the write delay, rows no post
 * owns are dropped, and the result is audited before the route reports success. Without it, an
 * index that lost its rows answers every search with nothing while LIKE would have found the post.
 */

const USER = 'user-1'
const VISIBLE_PUBLISHED_AT = 1_700_000_000_000
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

async function makeWorld(options: { ftsEnabled?: boolean } = {}): Promise<{ db: D1Shim; app: Hono<AppBindings> }> {
  const db = createDb([...TABLE_STATEMENTS, ...INDEX_STATEMENTS, BLOG_FTS_STATEMENT].join(';\n'))
  DB_ENV.env.DB = db as unknown as D1Database
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'writer', 'x', 'login', 'writer', '', 1, 1)`,
    USER,
  )

  const ftsEnabled = options.ftsEnabled !== false
  const app = new Hono<AppBindings>()
  const context = async (c: Context<AppBindings>, next: Next) => {
    c.set('database', { ftsEnabled })
    c.set('userId', USER)
    await next()
  }
  app.use('/api/blog', context)
  app.use('/api/blog/*', context)
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog', blogManageRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  return { db, app }
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function seedPost(
  db: D1Shim,
  fields: { id: string; title: string; excerpt?: string; content: string; publishedAt?: number },
): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at,
       seo_noindex)
     VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, '', NULL, NULL, '[]', 1, 1, 0, 0, ?7, ?7, ?7, 0)`,
    fields.id,
    `note-${fields.id}`,
    USER,
    fields.title,
    fields.excerpt ?? '',
    fields.content,
    fields.publishedAt ?? VISIBLE_PUBLISHED_AT,
  )
}

interface SearchBody {
  posts: Array<{ id: string; slug: string; snippet?: string }>
}

async function search(app: Hono<AppBindings>, query: string): Promise<SearchBody> {
  const res = await request(app, `/api/blog/public/posts?search=${encodeURIComponent(query)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as SearchBody
}

async function indexRows(db: D1Shim, postId: string): Promise<number> {
  const row = await queryFirst(db, 'SELECT COUNT(*) AS n FROM blog_posts_fts WHERE post_id = ?1', postId)
  return Number(row?.n ?? 0)
}

function reindex(app: Hono<AppBindings>): Promise<Response> {
  return request(app, '/api/blog/search/reindex', { method: 'POST' })
}

describe('blog index repair path', () => {
  it('rebuilds posts the index never saw and answers them through the index afterwards', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, { id: 'post-one', title: 'First post', content: 'alpha body' })
    await seedPost(db, { id: 'post-two', title: 'Second post', content: 'beta body' })
    // The drift a lost queue leaves: nothing is queued, so the search trusts the empty index.
    expect((await search(app, 'alpha')).posts).toEqual([])

    const res = await reindex(app)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, indexed: 2 })

    const body = await search(app, 'alpha')
    expect(body.posts.map((post) => post.id)).toEqual(['post-one'])
    expect(body.posts[0]?.snippet).toContain('alpha')
    expect(await indexRows(db, 'post-two')).toBe(1)
  })

  it('replaces an index row whose post was rewritten without a queue entry', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, { id: 'post-stale', title: 'Stale post', content: 'original wording about rivers' })
    await reindex(app)
    await runSql(
      db,
      `UPDATE blog_posts SET content = 'rewritten wording about volcanoes', updated_at = updated_at + 1
        WHERE id = 'post-stale'`,
    )
    // The index still holds the old text, so the new term is not there and the old one still is.
    expect((await search(app, 'volcanoes')).posts).toEqual([])
    expect((await search(app, 'rivers')).posts.map((post) => post.id)).toEqual(['post-stale'])

    const res = await reindex(app)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, indexed: 1 })

    expect((await search(app, 'rivers')).posts).toEqual([])
    const body = await search(app, 'volcanoes')
    expect(body.posts.map((post) => post.id)).toEqual(['post-stale'])
    expect(body.posts[0]?.snippet).toContain('volcanoes')
  })

  it('drops index rows no post owns', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, { id: 'post-kept', title: 'Kept post', content: 'alpha body' })
    await runSql(
      db,
      `INSERT INTO blog_posts_fts (post_id, user_id, title, excerpt, body)
       VALUES ('post-ghost', ?1, 'Ghost', '', 'haunt')`,
      USER,
    )

    const res = await reindex(app)
    expect(res.status).toBe(200)

    expect(await indexRows(db, 'post-ghost')).toBe(0)
    expect(await indexRows(db, 'post-kept')).toBe(1)
    const audit = await auditBlogFtsIndex(db as unknown as D1Database, USER)
    expect(audit).toMatchObject({ posts: 1, rows: 1, indexed: 1, duplicateRows: 0, orphanRows: 0 })
  })

  it('re-enqueues a post sitting in the trash so a later restore is still searchable', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, { id: 'post-trashed', title: 'Trashed post', content: 'recoverable wording' })
    const trashed = await request(app, '/api/blog/posts/post-trashed', { method: 'DELETE' })
    expect(trashed.status).toBe(200)

    const res = await reindex(app)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, indexed: 1 })
    expect(await indexRows(db, 'post-trashed')).toBe(1)
    // Indexed but not public while it is in the bin.
    expect((await search(app, 'recoverable')).posts).toEqual([])

    const restored = await request(app, '/api/blog/trash/post-trashed/restore', { method: 'POST' })
    expect(restored.status).toBe(200)

    const body = await search(app, 'recoverable')
    expect(body.posts.map((post) => post.id)).toEqual(['post-trashed'])
  })

  it('refuses to report success when the rebuilt index did not converge', async () => {
    const { db } = await makeWorld()
    await seedPost(db, { id: 'post-one', title: 'First post', content: 'alpha body' })
    // The repair has to detect a delete that reaches nothing: with `post_id` outside the index the
    // rebuild's delete matches no row, so each pass over the post adds another one.
    await runSql(db, 'DROP TABLE blog_posts_fts')
    await runSql(
      db,
      `CREATE VIRTUAL TABLE blog_posts_fts USING fts5(
        post_id UNINDEXED, user_id UNINDEXED, title, excerpt, body,
        tokenize = "unicode61 remove_diacritics 2"
      )`,
    )
    await runSql(
      db,
      `INSERT INTO blog_posts_fts (post_id, user_id, title, excerpt, body)
       VALUES ('post-one', ?1, 'First', '', 'alpha body')`,
      USER,
    )

    await expect(rebuildBlogFtsIndex(db as unknown as D1Database, USER)).rejects.toThrow(
      /did not converge.*1 rows beyond the first/,
    )
  })

  it('answers 503 when the database cannot keep a full-text index', async () => {
    const { app } = await makeWorld({ ftsEnabled: false })

    const res = await reindex(app)

    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('internal')
  })

  it('answers 409 while another rebuild holds the lease', async () => {
    const { db, app } = await makeWorld()
    await runSql(
      db,
      `INSERT INTO app_meta (key, value) VALUES (?1, ?2)`,
      `blog-fts-reindex-run:${USER}`,
      JSON.stringify({ token: 'someone-else', expiresAt: Date.now() + 60_000 }),
    )

    const res = await reindex(app)

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('conflict')
    expect(body.error.message).toBe('Blog search indexing is already running')
  })

  it('answers 429 once the hourly budget is spent', async () => {
    const { app } = await makeWorld()

    const statuses: number[] = []
    for (let attempt = 0; attempt < 7; attempt++) statuses.push((await reindex(app)).status)

    expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200])
    expect(statuses[6]).toBe(429)
    const blocked = await reindex(app)
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error.code).toBe('too_many_attempts')
  })
})
