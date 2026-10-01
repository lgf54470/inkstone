import { describe, expect, it, vi } from 'vitest'
import { Hono, type Context, type Next } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { BLOG_FTS_STATEMENT } from '../src/worker/db/schema/statements'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { drainBlogFtsQueue, enqueueBlogFtsStatement } from '../src/worker/db/blog-fts'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, queryFirst, runSql, type D1Shim } from './d1-harness'

/**
 * The public blog search answers from the blog's own full-text index, so a match is ranked by
 * relevance and the list can show a snippet around it instead of the post's excerpt. The index is
 * fed by the write queue: a post written through the management routes enqueues itself in the same
 * batch, and the search drains what it finds queued before it asks the index — while anything still
 * queued is answered from LIKE, because a partially indexed blog would quietly omit posts.
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

async function enqueue(db: D1Shim, postId: string, at?: number): Promise<void> {
  await enqueueBlogFtsStatement(db as unknown as D1Database, USER, postId, 'upsert', at).run()
}

interface SearchBody {
  posts: Array<{ id: string; slug: string; snippet?: string }>
  pagination: { total: number }
}

async function search(app: Hono<AppBindings>, query: string): Promise<SearchBody> {
  const res = await request(app, `/api/blog/public/posts?search=${encodeURIComponent(query)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as SearchBody
}

describe('blog public search on the full-text index', () => {
  it('ranks a title match above a newer post that only mentions the term in its body', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, {
      id: 'post-title',
      title: 'Relevance ranking',
      content: 'Body without the term.',
      publishedAt: VISIBLE_PUBLISHED_AT,
    })
    await seedPost(db, {
      id: 'post-newer',
      title: 'Weekly notes',
      content: 'One mention of ranking lives in this body.',
      publishedAt: VISIBLE_PUBLISHED_AT + 86_400_000,
    })
    await enqueue(db, 'post-title')
    await enqueue(db, 'post-newer')

    const body = await search(app, 'ranking')

    expect(body.posts.map((post) => post.id)).toEqual(['post-title', 'post-newer'])
  })

  it('matches a CJK term across markup the LIKE needle cannot cross', async () => {
    const { db, app } = await makeWorld()
    // Escaped code points: the i18n gate allows literal Chinese only in the zh-CN resources.
    await seedPost(db, {
      id: 'post-cjk',
      title: 'CJK post',
      content: '\u8fd9\u662f\u5168\u6587**\u641c\u7d22**\u7684\u6d4b\u8bd5\u5185\u5bb9\u3002',
    })
    await seedPost(db, { id: 'post-other', title: 'Other post', content: '\u65e0\u5173\u7684\u6b63\u6587\u3002' })
    await enqueue(db, 'post-cjk')
    await enqueue(db, 'post-other')

    const body = await search(app, '\u5168\u6587\u641c\u7d22')

    expect(body.posts.map((post) => post.id)).toEqual(['post-cjk'])
  })

  it('answers with a snippet cut around the match instead of the excerpt', async () => {
    const { db, app } = await makeWorld()
    const content = `${'padding '.repeat(40)}needle in the middle ${'tail '.repeat(40)}`
    await seedPost(db, {
      id: 'post-snippet',
      title: 'A post',
      excerpt: 'The excerpt says nothing specific.',
      content,
    })
    await enqueue(db, 'post-snippet')

    const body = await search(app, 'needle')
    const snippet = body.posts[0]?.snippet

    expect(typeof snippet).toBe('string')
    expect(snippet).toContain('needle')
    expect(snippet).not.toContain('The excerpt')
    expect(snippet?.startsWith('…')).toBe(true)
    expect(snippet!.length).toBeLessThan(content.length)
  })

  it('makes a post written through the management route searchable', async () => {
    const { app } = await makeWorld()
    const created = await request(app, '/api/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId: 'note-fresh',
        title: 'Fresh post',
        content: 'A brand new paragraph about waterfalls.',
        slug: 'fresh-post',
        isPublished: true,
      }),
    })
    expect(created.status).toBe(200)

    const body = await search(app, 'waterfalls')

    expect(body.posts.map((post) => post.slug)).toEqual(['fresh-post'])
    expect(body.posts[0]?.snippet).toContain('waterfalls')
  })

  it('reindexes a post whose text was patched', async () => {
    const { app } = await makeWorld()
    const created = await request(app, '/api/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId: 'note-patched',
        title: 'Patched post',
        content: 'first wording about rivers',
        slug: 'patched-post',
        isPublished: true,
      }),
    })
    const { id } = (await created.json()) as { id: string }
    await search(app, 'rivers')

    const patched = await request(app, `/api/blog/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'rewritten wording about volcanoes' }),
    })
    expect(patched.status).toBe(200)

    const body = await search(app, 'volcanoes')
    expect(body.posts.map((post) => post.slug)).toEqual(['patched-post'])
    expect(body.posts[0]?.snippet).toContain('volcanoes')
  })

  it('reindexes a post after a revision is restored', async () => {
    const { app } = await makeWorld()
    const created = await request(app, '/api/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId: 'note-revision',
        title: 'Revision post',
        content: 'original wording about rivers',
        slug: 'revision-post',
        isPublished: true,
      }),
    })
    const { id } = (await created.json()) as { id: string }
    await request(app, `/api/blog/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'edited wording about mountains' }),
    })
    await search(app, 'mountains')
    const revisions = (await (await request(app, `/api/blog/posts/${id}/revisions`)).json()) as {
      revisions: Array<{ id: string }>
    }
    const restored = await request(app, `/api/blog/posts/${id}/revisions/${revisions.revisions[0]!.id}/restore`, {
      method: 'POST',
    })
    expect(restored.status).toBe(200)

    const body = await search(app, 'rivers')
    expect(body.posts.map((post) => post.slug)).toEqual(['revision-post'])
  })

  it('answers from LIKE while a queued write cannot be drained yet', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, {
      id: 'post-old',
      title: 'Old post',
      content: 'the needle is here',
      publishedAt: VISIBLE_PUBLISHED_AT,
    })
    await seedPost(db, {
      id: 'post-new',
      title: 'New post',
      content: 'another needle',
      publishedAt: VISIBLE_PUBLISHED_AT + 1000,
    })
    // A write has just been made but its queue row is not due, so the index cannot be trusted yet.
    await enqueue(db, 'post-new', Date.now() + 60_000)

    const body = await search(app, 'needle')

    expect(body.posts.map((post) => post.id)).toEqual(['post-new', 'post-old'])
    expect(body.posts[0]).not.toHaveProperty('snippet')
  })

  it('keeps answering from LIKE when the database has no full-text support', async () => {
    const { db, app } = await makeWorld({ ftsEnabled: false })
    await seedPost(db, { id: 'post-like', title: 'LIKE post', content: 'the needle is here' })

    const body = await search(app, 'needle')

    expect(body.posts.map((post) => post.id)).toEqual(['post-like'])
    expect(body.posts[0]).not.toHaveProperty('snippet')
  })

  it('drops the index row of a post purged from the trash', async () => {
    const { db, app } = await makeWorld()
    await seedPost(db, { id: 'post-purge', title: 'Purged post', content: 'needle inside' })
    await enqueue(db, 'post-purge')
    await search(app, 'needle')
    expect(await indexRows(db, 'post-purge')).toBe(1)

    await request(app, '/api/blog/posts/post-purge', { method: 'DELETE' })
    await request(app, '/api/blog/trash/post-purge', { method: 'DELETE' })
    await drainBlogFtsQueue(db as unknown as D1Database, USER, 10, true)

    expect(await indexRows(db, 'post-purge')).toBe(0)
  })
})

async function indexRows(db: D1Shim, postId: string): Promise<number> {
  const row = await queryFirst(db, 'SELECT COUNT(*) AS n FROM blog_posts_fts WHERE post_id = ?1', postId)
  return Number(row?.n ?? 0)
}
