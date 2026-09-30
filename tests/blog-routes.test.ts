import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newSlug: () => `slug-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { LIMITS } from '../src/shared/constants'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, captureSql, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
// 2023-11-14: reader-facing queries compare a post's publish moment against the real clock (that is
// what makes a scheduled post invisible), so a fixture that must be readable sits in the real past —
// `H.now` is a deterministic 2033, which the rule would rightly treat as scheduling.
const VISIBLE_PUBLISHED_AT = 1_700_000_000_000
const DB_ENV = { env: { DB: null as unknown as D1Database, VISIT_FP_SECRET: undefined as string | undefined } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  DB_ENV.env.VISIT_FP_SECRET = undefined
  return db
}

async function seedUser(db: D1Shim, id = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    id, `user-${id}`, H.now,
  )
}

async function seedBlogPost(db: D1Shim, fields: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const id = (fields.id ?? `p-${++H.counter}`) as string
  const slug = (fields.slug ?? `post-${++H.counter}`) as string
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, '', NULL, NULL, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?12)`,
    id, slug, fields.note_id ?? `n-${++H.counter}`, USER,
    fields.title ?? 'Post title', fields.content ?? 'Post content',
    JSON.stringify((fields.tags as string[]) ?? []),
    fields.is_published === undefined ? 1 : fields.is_published ? 1 : 0,
    fields.allow_comments === undefined ? 1 : fields.allow_comments ? 1 : 0,
    fields.is_pinned ? 1 : 0,
    (fields.views as number) ?? 0,
    (fields.published_at as number) ?? VISIBLE_PUBLISHED_AT,
  )
  return { id, slug }
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/blog', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.use('/api/blog/*', async (c, next) => {
    c.set('userId', USER)
    await next()
  })
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog', blogManageRoutes)
  app.route('/api/blog/public', blogPublicRoutes)
  return app
}

function firstRow(db: D1Shim, sql: string, ...values: unknown[]): Promise<Record<string, unknown> | null> {
  return db.prepare(sql).bind(...values).first()
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function requestWithIp(
  app: Hono<AppBindings>,
  path: string,
  clientIp: string,
  headers?: Record<string, string>,
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, { headers: { 'CF-Connecting-IP': clientIp, ...headers } })
  Object.defineProperty(req, 'cf', { value: { clientIp } })
  return app.request(req, undefined, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

/** The reader's browser reporting a page view: the only caller that counts one. */
async function postVisitBeacon(
  app: Hono<AppBindings>,
  slug: string,
  clientIp: string,
  headers?: Record<string, string>,
  referrer?: string,
): Promise<Response> {
  const req = new Request('http://localhost/api/blog/public/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientIp, ...headers },
    body: JSON.stringify({ slug, referrer }),
  })
  Object.defineProperty(req, 'cf', { value: { clientIp } })
  return app.request(req, undefined, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

async function seedVisitAt(
  db: D1Shim,
  postId: string,
  slug: string,
  visitedAt: number,
  visitorFp: string,
): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, country, is_bot, is_self_referrer, is_owner)
     VALUES (?1, ?2, ?3, ?4, ?5, 'US', 0, 0, 0)`,
    USER, postId, slug, visitedAt, visitorFp,
  )
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

describe('blog posts routes (real D1)', () => {
  it('creates, lists, patches, and deletes a post', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const created = await postJson(app, '/api/blog/posts', {
      noteId: `n-${++H.counter}`,
      title: 'Hello world',
      content: 'First post',
      slug: 'hello-world',
      tags: ['alpha', 'beta'],
    })
    expect(created.status).toBe(200)
    const { id, slug } = await created.json()
    expect(slug).toBe('hello-world')

    const list = await request(app, '/api/blog/posts')
    expect(list.status).toBe(200)
    const { posts } = await list.json()
    expect(posts).toHaveLength(1)
    expect(posts[0].title).toBe('Hello world')
    expect(posts[0].tags).toEqual(['alpha', 'beta'])
    expect(posts[0].isPublished).toBe(true)

    const patched = await patchJson(app, `/api/blog/posts/${id}`, {
      title: 'Hello world v2',
      isPublished: false,
    })
    expect(patched.status).toBe(200)
    expect((await patched.json()).ok).toBe(true)

    const listDraft = await request(app, '/api/blog/posts?status=draft')
    const { posts: drafts } = await listDraft.json()
    expect(drafts).toHaveLength(1)
    expect(drafts[0].title).toBe('Hello world v2')

    const listPublished = await request(app, '/api/blog/posts?status=published')
    expect((await listPublished.json()).posts).toHaveLength(0)

    const deleted = await request(app, `/api/blog/posts/${id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    const after = await request(app, '/api/blog/posts')
    expect((await after.json()).posts).toHaveLength(0)
  })

  it('rejects a duplicate slug and missing note sources', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const first = await postJson(app, '/api/blog/posts', { noteId: `n-${++H.counter}`, title: 'A', content: 'a', slug: 'taken' })
    expect(first.status).toBe(200)
    const { id } = await first.json()

    const conflict = await postJson(app, '/api/blog/posts', { noteId: `n-${++H.counter}`, title: 'B', content: 'b', slug: 'taken' })
    expect(conflict.status).toBe(409)

    const patchConflict = await patchJson(app, `/api/blog/posts/${id}`, { slug: 'taken' })
    expect(patchConflict.status).toBe(200)

    const noNote = await postJson(app, '/api/blog/posts', { noteId: 'n-missing' })
    expect(noNote.status).toBe(404)
  })

  // A post carries its note's body into a second row, so the write that copies it must weigh the
  // same budget the note was allowed; otherwise a caller can park an arbitrarily large body in
  // blog_posts while every note-side guard still reads as satisfied.
  it('refuses a body past the note content budget on both write paths', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const oversized = 'x'.repeat(LIMITS.contentMaxBytes + 1)
    const created = await postJson(app, '/api/blog/posts', {
      noteId: `n-${++H.counter}`,
      title: 'Too big',
      content: oversized,
      slug: 'too-big',
    })
    expect(created.status).toBe(413)

    const ok = await postJson(app, '/api/blog/posts', {
      noteId: `n-${++H.counter}`,
      title: 'Fits',
      content: 'small',
      slug: 'fits',
    })
    expect(ok.status).toBe(200)
    const { id } = await ok.json()

    const patched = await patchJson(app, `/api/blog/posts/${id}`, { content: oversized })
    expect(patched.status).toBe(413)
  })

  it('applies batch publish and setCategory actions', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id } = await seedBlogPost(db, { title: 'Draft post', is_published: 0 })

    const app = makeApp()
    const batched = await postJson(app, '/api/blog/posts/batch', {
      action: 'publish',
      postIds: [id],
    })
    expect(batched.status).toBe(200)
    expect((await batched.json()).count).toBe(1)

    const list = await request(app, '/api/blog/posts')
    const { posts } = await list.json()
    expect(posts[0].isPublished).toBe(true)
  })
})

describe('blog management list shape and paging (ENG-02)', () => {
  it('answers one page without the post body and reports the whole list with it', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { title: 'Newest', slug: 'newest', published_at: 3 })
    await seedBlogPost(db, { title: 'Middle', slug: 'middle', published_at: 2 })
    await seedBlogPost(db, { title: 'Oldest', slug: 'oldest', published_at: 1 })
    const app = makeApp()

    const first = await request(app, '/api/blog/posts?limit=2')
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.posts.map((p: { slug: string }) => p.slug)).toEqual(['newest', 'middle'])
    expect(firstBody.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 })
    // The body is the one column measured in kilobytes, and the list draws titles and counters.
    expect(firstBody.posts[0].content).toBeUndefined()

    const second = await request(app, '/api/blog/posts?limit=2&page=2')
    const secondBody = await second.json()
    expect(secondBody.posts.map((p: { slug: string }) => p.slug)).toEqual(['oldest'])
    expect(secondBody.pagination.totalPages).toBe(2)
  })

  it('filters by tag inside SQL, descendants included, before the page is cut', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { title: 'Parent tag', slug: 'parent-tag', tags: ['tech'], published_at: 3 })
    await seedBlogPost(db, { title: 'Child tag', slug: 'child-tag', tags: ['tech/vue'], published_at: 2 })
    await seedBlogPost(db, { title: 'Unrelated', slug: 'unrelated', tags: ['life'], published_at: 1 })
    const app = makeApp()

    const first = await request(app, `/api/blog/posts?tag=${encodeURIComponent('tech')}&limit=1`)
    const firstBody = await first.json()
    expect(firstBody.posts.map((p: { slug: string }) => p.slug)).toEqual(['parent-tag'])
    expect(firstBody.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 })

    // The old filter ran in JS after fetching everything. Cutting a page first would have answered
    // "no posts" for every tag match that lived on another page.
    const second = await request(app, `/api/blog/posts?tag=${encodeURIComponent('tech')}&limit=1&page=2`)
    expect((await second.json()).posts.map((p: { slug: string }) => p.slug)).toEqual(['child-tag'])
  })

  it('counts the same filter its page answers', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { title: 'Live', slug: 'live', is_published: 1 })
    await seedBlogPost(db, { title: 'Draft', slug: 'draft', is_published: 0 })
    const app = makeApp()

    const drafts = await request(app, '/api/blog/posts?status=draft&limit=1')
    const draftBody = await drafts.json()
    expect(draftBody.posts).toHaveLength(1)
    expect(draftBody.pagination.total).toBe(1)

    const search = await request(app, '/api/blog/posts?search=Live')
    expect((await search.json()).pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 })
  })

  it('serves the body-free post index the note list reads', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { title: 'Published', slug: 'published', is_published: 1 })
    const draft = await seedBlogPost(db, { title: 'Draft', slug: 'draft', is_published: 0 })
    const app = makeApp()

    const res = await request(app, '/api/blog/post-index')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.posts).toHaveLength(2)
    const entry = body.posts.find((p: { id: string }) => p.id === draft.id)
    expect(entry.title).toBe('Draft')
    expect(entry.noteId).toBeTruthy()
    expect(entry.isPublished).toBe(false)
    expect(entry.content).toBeUndefined()
    expect(entry.views).toBeUndefined()
  })
})

describe('blog comment moderation list (ENG-06)', () => {
  async function seedCommentStatuses(db: D1Shim, postId: string, statuses: string[]): Promise<void> {
    for (const [index, status] of statuses.entries()) {
      await runSql(
        db,
        `INSERT INTO blog_comments (id, post_id, author_name, author_email, content, status, created_at)
         VALUES (?1, ?2, 'Reader', 'reader@example.com', 'Comment body', ?3, ?4)`,
        `c-${index}`, postId, status, H.now + index,
      )
    }
  }

  it('counts every tab over the whole list while the tab only narrows the page', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedBlogPost(db, { title: 'Threaded', slug: 'threaded' })
    await seedCommentStatuses(db, post.id, ['pending', 'pending', 'approved', 'spam'])
    const app = makeApp()

    const pending = await request(app, '/api/blog/comments?status=pending')
    const pendingBody = await pending.json()
    expect(pendingBody.comments).toHaveLength(2)
    // Counting the rows the status filter already narrowed down drew every other tab as zero.
    expect(pendingBody.counts).toEqual({ all: 4, pending: 2, approved: 1, rejected: 0, spam: 1 })

    const searched = await request(app, '/api/blog/comments?search=Nobody')
    const searchedBody = await searched.json()
    expect(searchedBody.comments).toHaveLength(0)
    expect(searchedBody.counts.all).toBe(0)
  })

  it('caps the returned list while the counts keep describing the whole result', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedBlogPost(db, { title: 'Many comments', slug: 'many-comments' })
    await db.batch(Array.from({ length: 501 }, (_, index) =>
      db.prepare(
        `INSERT INTO blog_comments (id, post_id, author_name, author_email, content, status, created_at)
         VALUES (?1, ?2, 'Reader', 'reader@example.com', 'Comment body', 'approved', ?3)`,
      ).bind(`c-${index}`, post.id, index),
    ))
    const app = makeApp()

    const res = await request(app, '/api/blog/comments')
    const body = await res.json()
    expect(body.comments).toHaveLength(500)
    expect(body.counts.approved).toBe(501)
  })
})

describe('blog public routes (real D1)', () => {
  it('lists only published posts with pagination and serves detail with view counting', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'published-one', title: 'Published', is_published: 1 })
    await seedBlogPost(db, { slug: 'draft-one', title: 'Draft', is_published: 0 })

    const app = makeApp()
    const list = await request(app, '/api/blog/public/posts')
    expect(list.status).toBe(200)
    const body = await list.json()
    expect(body.posts).toHaveLength(1)
    expect(body.posts[0].slug).toBe('published-one')
    expect(body.pagination.total).toBe(1)

    const detail = await request(app, '/api/blog/public/posts/published-one', {
      headers: { 'user-agent': 'Mozilla/5.0 BlogTest/1.0' },
    })
    expect(detail.status).toBe(200)
    const { post } = await detail.json()
    expect(post.title).toBe('Published')
    // Reading a post is not a view: the beacon the reader's browser sends is (see visit-beacon.ts).
    expect(post.views).toBe(0)
    expect(await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_visits')).toMatchObject({ n: 0 })

    const timelineRes = await request(app, '/api/blog/public/timeline')
    expect(timelineRes.status).toBe(200)
    const timelineData = await timelineRes.json()
    const postDate = new Date(VISIBLE_PUBLISHED_AT)
    const postYear = postDate.getFullYear()
    const postMonth = postDate.getMonth() + 1
    const timelinePosts = timelineData.timeline[postYear]?.[postMonth] || []
    expect(timelinePosts).toHaveLength(1)
    expect(timelinePosts[0].slug).toBe('published-one')
    expect(timelinePosts[0].views).toBe(0)

    const hidden = await request(app, '/api/blog/public/posts/draft-one')
    expect(hidden.status).toBe(404)
  })

  // The beacon is what counts, and it counts what the visit path has always counted: one view per
  // visitor fingerprint inside the dedupe window, another when a different reader arrives.
  it('counts a beaconed view once per visitor fingerprint, and a second reader again', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'viewed-post', title: 'Viewed' })
    DB_ENV.env.VISIT_FP_SECRET = 'blog-dedupe-secret'

    const app = makeApp()
    const first = await postVisitBeacon(app, 'viewed-post', '203.0.113.11', { 'user-agent': 'Mozilla/5.0 BlogTest/1.0' })
    expect((await first.json()).counted).toBe(true)

    const second = await postVisitBeacon(app, 'viewed-post', '203.0.113.11', { 'user-agent': 'Mozilla/5.0 Rotated/2.0' })
    expect((await second.json()).counted).toBe(false)
    expect(await firstRow(db, 'SELECT views FROM blog_posts WHERE slug = ?1', 'viewed-post')).toMatchObject({ views: 1 })

    const freshReader = await postVisitBeacon(app, 'viewed-post', '198.51.100.99', { 'user-agent': 'Mozilla/5.0 BlogTest/1.0' })
    expect((await freshReader.json()).counted).toBe(true)

    const detail = await request(app, '/api/blog/public/posts/viewed-post')
    expect((await detail.json()).post.views).toBe(2)
  })

  it('refuses a beacon for a post this blog has not published, and does not count a bot', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'beacon-post', title: 'Beacon' })
    await seedBlogPost(db, { slug: 'beacon-draft', title: 'Draft', is_published: false })

    const app = makeApp()
    const missing = await postVisitBeacon(app, 'no-such-post', '203.0.113.11')
    expect(missing.status).toBe(404)
    const draft = await postVisitBeacon(app, 'beacon-draft', '203.0.113.11')
    expect(draft.status).toBe(404)

    const bot = await postVisitBeacon(app, 'beacon-post', '203.0.113.12', { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })
    expect((await bot.json()).counted).toBe(false)
    expect(await firstRow(db, 'SELECT views FROM blog_posts WHERE slug = ?1', 'beacon-post')).toMatchObject({ views: 0 })
  })

  it('records no visitor fingerprint instead of a publicly-derivable date salt', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'nosecret-post', title: 'NoSecret' })

    const app = makeApp()
    await postVisitBeacon(app, 'nosecret-post', '203.0.113.11')
    await postVisitBeacon(app, 'nosecret-post', '203.0.113.11')
    const rows = await db.prepare('SELECT visitor_fp FROM blog_visits WHERE slug = ?1').bind('nosecret-post').all()
    expect(rows.results).toHaveLength(2)
    expect(rows.results.every((r: { visitor_fp: unknown }) => r.visitor_fp === null)).toBe(true)
  })

  it('drops non-browser scheme referrers instead of storing them raw', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'ref-js', title: 'RefJs' })
    DB_ENV.env.VISIT_FP_SECRET = 'blog-ref-secret'

    const app = makeApp()
    await postVisitBeacon(app, 'ref-js', '203.0.113.11', undefined, 'javascript:alert(document.domain)')
    const row = await firstRow(db, 'SELECT referrer, referrer_host FROM blog_visits WHERE slug = ?1', 'ref-js')
    expect(row?.referrer).toBeNull()
    expect(row?.referrer_host).toBeNull()
  })

  it('stores only origin and path of an http referrer, never the query', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'ref-https', title: 'RefHttps' })
    DB_ENV.env.VISIT_FP_SECRET = 'blog-ref-secret'

    const app = makeApp()
    await postVisitBeacon(app, 'ref-https', '203.0.113.11', undefined, 'https://news.example.com/article/42?token=secret#frag')
    const row = await firstRow(db, 'SELECT referrer, referrer_host FROM blog_visits WHERE slug = ?1', 'ref-https')
    expect(row?.referrer).toBe('https://news.example.com/article/42')
    expect(row?.referrer_host).toBe('news.example.com')
  })

  it('caps a stored referrer at the shared length limit', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'ref-long', title: 'RefLong' })
    DB_ENV.env.VISIT_FP_SECRET = 'blog-ref-secret'

    const app = makeApp()
    await postVisitBeacon(app, 'ref-long', '203.0.113.11', undefined, `https://a.example.com/${'x'.repeat(600)}`)
    const row = await firstRow(db, 'SELECT referrer FROM blog_visits WHERE slug = ?1', 'ref-long')
    expect(typeof row?.referrer).toBe('string')
    expect((row?.referrer as string).length).toBeLessThanOrEqual(512)
  })

  // The column exists because the dashboard has a switch for it, and it was written as a literal 0,
  // so the switch never had anything to exclude and the number it showed was never measured. What a
  // referral is measured against is the site the blog is served at (its own configured address), not
  // the API host this beacon arrives at.
  it('records a referral from the blog itself as a self-referral and an external one as not', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'ref-self', title: 'RefSelf' })
    DB_ENV.env.VISIT_FP_SECRET = 'blog-ref-secret'

    const app = makeApp()
    // The blog's own address is what the settings name, so point them at one before reporting a view
    // that came from it.
    await patchJson(app, '/api/blog/settings', { frontendUrl: 'https://blog.example.com' })
    await postVisitBeacon(app, 'ref-self', '203.0.113.11', undefined, 'https://blog.example.com/archive')
    expect(await firstRow(db, 'SELECT is_self_referrer FROM blog_visits WHERE slug = ?1', 'ref-self'))
      .toMatchObject({ is_self_referrer: 1 })

    await seedBlogPost(db, { slug: 'ref-api-host', title: 'RefApiHost' })
    await postVisitBeacon(app, 'ref-api-host', '203.0.113.12', undefined, 'http://localhost/archive')
    const apiHostRow = await firstRow(db, 'SELECT is_self_referrer FROM blog_visits WHERE slug = ?1', 'ref-api-host')
    expect(apiHostRow?.is_self_referrer, 'the API host is not the blog').toBe(0)

    await seedBlogPost(db, { slug: 'ref-other', title: 'RefOther' })
    await postVisitBeacon(app, 'ref-other', '203.0.113.13', undefined, 'https://news.example.com/article/42')
    const otherRow = await firstRow(db, 'SELECT is_self_referrer FROM blog_visits WHERE slug = ?1', 'ref-other')
    expect(otherRow?.is_self_referrer).toBe(0)
  })

  it('pushes tag hierarchy and pagination into SQL with correct totals', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'tech-exact', title: 'Exact', tags: ['tech'] })
    await seedBlogPost(db, { slug: 'tech-child', title: 'Child', tags: ['tech/ai'] })
    await seedBlogPost(db, { slug: 'life-post', title: 'Life', tags: ['life'] })
    await seedBlogPost(db, { slug: 'discount', title: 'Discount', tags: ['50%off'] })

    const app = makeApp()
    const tech = await request(app, '/api/blog/public/posts?tag=tech')
    const techBody = await tech.json()
    expect(techBody.pagination.total).toBe(2)
    expect(techBody.posts.map((p: { slug: string }) => p.slug).sort()).toEqual(['tech-child', 'tech-exact'])

    const exactOnly = await request(app, '/api/blog/public/posts?tag=50%25off')
    expect((await exactOnly.json()).pagination.total).toBe(1)

    const paged = await request(app, '/api/blog/public/posts?page=2&limit=2')
    const pagedBody = await paged.json()
    expect(pagedBody.pagination.total).toBe(4)
    expect(pagedBody.pagination.totalPages).toBe(2)
    expect(pagedBody.posts).toHaveLength(2)

    const combined = await request(app, '/api/blog/public/posts?tag=tech&search=Exact')
    const combinedBody = await combined.json()
    expect(combinedBody.pagination.total).toBe(1)
    expect(combinedBody.posts[0].slug).toBe('tech-exact')
  })

  it('submits a pending comment and exposes it publicly only after approval', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'commented-post', title: 'Commented' })

    const app = makeApp()
    const submitted = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'commented-post',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      content: 'Nice post!',
    })
    expect(submitted.status).toBe(200)
    const submittedBody = await submitted.json()
    expect(submittedBody.status).toBe('pending')

    const publicList = await request(app, '/api/blog/public/comments/commented-post')
    expect((await publicList.json()).comments).toHaveLength(0)

    const manageList = await request(app, '/api/blog/comments')
    const { comments } = await manageList.json()
    expect(comments).toHaveLength(1)
    expect(comments[0].status).toBe('pending')
    expect(comments[0].postSlug).toBe('commented-post')

    const approved = await patchJson(app, `/api/blog/comments/${comments[0].id}/status`, { status: 'approved' })
    expect(approved.status).toBe(200)

    const publicAfter = await request(app, '/api/blog/public/comments/commented-post')
    const after = await publicAfter.json()
    expect(after.comments).toHaveLength(1)
    expect(after.comments[0].author_name).toBe('Reader')

    // The default used to be a third-party avatar URL, so submitting a comment sent the nickname to
    // that service and put whoever opened the moderation queue on its server.
    const stored = await firstRow(db, 'SELECT author_avatar FROM blog_comments')
    expect(stored?.author_avatar).toBe('')
  })

  it('rejects comments on missing or comment-disabled posts', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'closed-post', allow_comments: 0 })

    const app = makeApp()
    const missing = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'no-such-post',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      content: 'Hello',
    })
    expect(missing.status).toBe(404)

    const closed = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'closed-post',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      content: 'Hello',
    })
    expect(closed.status).toBe(403)

    const invalid = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'closed-post',
      authorName: '',
      authorEmail: 'nope',
      content: '',
    })
    expect(invalid.status).toBe(400)
  })

  it('rejects oversized comments and comments whose parent belongs to another post', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'parent-post', title: 'Parent Post' })
    await seedBlogPost(db, { slug: 'other-post', title: 'Other Post' })

    const app = makeApp()
    const seededParent = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'other-post',
      authorName: 'Other Reader',
      authorEmail: 'other@example.com',
      content: 'On the other post',
    })
    expect(seededParent.status).toBe(200)
    const manage = await request(app, '/api/blog/comments')
    const { comments: allComments } = await manage.json()
    const otherPostCommentId = allComments[0].id

    const oversized = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'parent-post',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      content: 'x'.repeat(4001),
    })
    expect(oversized.status).toBe(400)

    const wrongParent = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'parent-post',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      parentId: otherPostCommentId,
      content: 'Reply from the wrong thread',
    })
    expect(wrongParent.status).toBe(400)
  })

  it('throttles anonymous comment floods per ip', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'flooded-post', title: 'Flooded' })

    const app = makeApp()
    let lastStatus = 0
    for (let index = 0; index < 6; index++) {
      const res = await postJson(app, '/api/blog/public/comments', {
        postSlug: 'flooded-post',
        authorName: `Reader ${index}`,
        authorEmail: 'reader@example.com',
        content: `Comment number ${index}`,
      })
      lastStatus = res.status
      if (index < 5) expect(lastStatus).toBe(200)
    }
    expect(lastStatus).toBe(429)
  })
})

describe('blog settings routes (real D1)', () => {
  it('reads defaults, patches settings, and serves the patched values publicly', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const current = await request(app, '/api/blog/settings')
    expect((await current.json()).settings.siteName).toBe('Inkstone Blog')

    const patched = await patchJson(app, '/api/blog/settings', { siteName: 'My Journal' })
    expect(patched.status).toBe(200)
    expect((await patched.json()).settings.siteName).toBe('My Journal')

    const manage = await request(app, '/api/blog/settings')
    expect((await manage.json()).settings.siteName).toBe('My Journal')

    // The public site reads the blog it serves, not a second key nobody writes: patching the site
    // name has to reach the reader, which is what this used to assert the opposite of (SEC-09).
    const site = await request(app, '/api/blog/public/site')
    expect((await site.json()).settings.siteName).toBe('My Journal')
  })

  it('checks slug availability against existing posts', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'used-slug' })

    const app = makeApp()
    const free = await request(app, '/api/blog/check-slug?slug=free-slug')
    expect((await free.json()).available).toBe(true)

    const used = await request(app, '/api/blog/check-slug?slug=used-slug')
    expect((await used.json()).available).toBe(false)
  })
})

describe('blog organizer routes (real D1)', () => {
  it('creates, lists, renames, and deletes folders', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const created = await postJson(app, '/api/blog/folders', { name: 'Recipes', color: '#ff0000' })
    expect(created.status).toBe(201)
    const folder = await created.json()
    expect(folder.name).toBe('Recipes')

    const renamed = await patchJson(app, `/api/blog/folders/${folder.id}`, { name: 'Cooking' })
    expect(renamed.status).toBe(200)
    expect((await renamed.json()).name).toBe('Cooking')

    const list = await request(app, '/api/blog/folders')
    const folders = await list.json()
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('Cooking')

    const deleted = await request(app, `/api/blog/folders/${folder.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect(await request(app, '/api/blog/folders').then((r) => r.json())).toHaveLength(0)
  })

  it('creates and lists tags with counts', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'tagged-post', tags: ['essay', 'draft'] })
    await seedBlogPost(db, { slug: 'other-post', tags: ['essay'] })

    const app = makeApp()
    const created = await postJson(app, '/api/blog/tags', { name: 'essay' })
    expect(created.status).toBe(201)

    const list = await request(app, '/api/blog/tags')
    const tags = await list.json()
    expect(Array.isArray(tags)).toBe(true)
    const essay = tags.find((t: { name: string }) => t.name === 'essay')
    expect(essay).toBeDefined()
    expect(essay.postsCount).toBe(2)
  })
})

interface PreparedLike {
  bind(...values: unknown[]): PreparedLike
  all(): Promise<{ results: unknown[] }>
  first(): Promise<Record<string, unknown> | null>
  run(): Promise<unknown>
}

/**
 * Counts D1 round-trips for the next request: `direct` is a serial prepare().<all|first>(), `batch`
 * is one flight however many statements ride along. The analytics route used to take a flight per
 * segment; the point of merging them is that the answer now costs one.
 */
function instrumentRoundTrips(): { direct: number; batch: number } {
  const calls = { direct: 0, batch: 0 }
  const real = DB_ENV.env.DB as unknown as {
    prepare(sql: string): PreparedLike
    batch(statements: PreparedLike[]): Promise<unknown>
  }
  const wrap = (statement: PreparedLike): PreparedLike => ({
    bind: (...values: unknown[]) => wrap(statement.bind(...values)),
    all: async () => { calls.direct += 1; return statement.all() },
    first: async () => { calls.direct += 1; return statement.first() },
    run: async () => statement.run(),
  })
  DB_ENV.env.DB = {
    prepare: (sql: string) => wrap(real.prepare(sql)),
    batch: (statements: PreparedLike[]) => { calls.batch += 1; return real.batch(statements) },
  } as unknown as D1Database
  return calls
}

describe('blog stats aggregates (ENG-07)', () => {
  it('counts folders and tags from SQL aggregates without reading every post row', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'agg-a', tags: ['alpha', 'beta'] })
    await seedBlogPost(db, { slug: 'agg-b', tags: ['alpha'], is_published: false })
    await seedBlogPost(db, { slug: 'agg-c', tags: ['beta'], is_published: false })
    await runSql(db, "UPDATE blog_posts SET folder_id = 'f-1'")
    // One corrupt tags value must not take the dashboard down: the row still counts as a post.
    await runSql(db, "UPDATE blog_posts SET tags = '{not json' WHERE slug = 'agg-b'")
    const statements = captureSql(db)
    const calls = instrumentRoundTrips()

    const { stats } = await (await request(makeApp(), '/api/blog/stats')).json()

    expect(stats.totalPosts).toBe(3)
    expect(stats.publishedPosts).toBe(1)
    expect(stats.draftPosts).toBe(2)
    expect(stats.folderCounts['f-1']).toEqual({ total: 3, published: 1 })
    expect(stats.tagCounts.alpha).toEqual({ total: 1, published: 1 })
    expect(stats.tagCounts.beta).toEqual({ total: 2, published: 1 })
    expect(stats.tagsCount).toBe(2)
    // The counts answer in one batch of aggregates, and the tags one reads the JSON itself.
    expect(calls.batch).toBe(1)
    expect(calls.direct).toBe(0)
    expect(statements.some((sql) => sql.includes('json_each'))).toBe(true)
    expect(statements.filter((sql) => /SELECT folder_id, is_published, tags FROM blog_posts/.test(sql))).toEqual([])
  })

  it('lists tag counts from the tags JSON without parsing every post in the worker', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'tag-a', tags: ['alpha', 'beta'] })
    await seedBlogPost(db, { slug: 'tag-b', tags: ['alpha'], is_published: false })
    await runSql(db, "UPDATE blog_posts SET tags = '{not json' WHERE slug = 'tag-b'")
    const statements = captureSql(db)

    const tags = await (await request(makeApp(), '/api/blog/tags')).json()

    // The corrupt row contributes nothing but does not remove the tag the other post carries.
    expect(tags.find((t: { name: string }) => t.name === 'alpha').postsCount).toBe(1)
    expect(tags.find((t: { name: string }) => t.name === 'beta').postsCount).toBe(1)
    expect(statements.some((sql) => /SELECT tags FROM blog_posts/.test(sql))).toBe(false)
    expect(statements.some((sql) => sql.includes('json_each'))).toBe(true)
  })
})

describe('blog analytics routes (real D1)', () => {
  it('sanitizes an unknown range to the 30d window instead of answering with full history', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'rng-post' })
    await seedVisitAt(db, id, slug, Date.now() - 400 * 86_400_000, 'fp-ancient')
    await seedVisitAt(db, id, slug, Date.now() - 60_000, 'fp-recent')

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=zzz')).json()
    expect(analytics.range).toBe('30d')
    expect(analytics.totalViews).toBe(1)
    expect(analytics.timeline.length).toBe(30)
  })

  it('buckets range=all from the earliest visit instead of 1970', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'all-post' })
    const oldest = Date.now() - 800 * 86_400_000
    await seedVisitAt(db, id, slug, oldest, 'fp-a')
    await seedVisitAt(db, id, slug, Date.now() - 400 * 86_400_000, 'fp-b')
    await seedVisitAt(db, id, slug, Date.now() - 60_000, 'fp-c')

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=all')).json()
    expect(analytics.range).toBe('all')
    expect(analytics.totalViews).toBe(3)
    expect(analytics.timeline.length).toBe(12)
    expect(analytics.timeline[0].timestamp).toBe(oldest)
    expect(analytics.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(3)
  })

  it('keeps an empty range=all window recent rather than starting at epoch', async () => {    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'quiet-post' })

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=all')).json()
    expect(analytics.timeline.length).toBe(12)
    expect(analytics.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(0)
    expect(analytics.timeline[0].timestamp).toBeGreaterThan(0)
  })

  // The cumulative counter on the posts is not the range's traffic, and no amount of it can be
  // turned into a visitor count or a country distribution — the app never recorded those rows. It
  // used to be, at 0.75 and a hard-coded "China 100% / Direct 100% / desktop 60% / macOS 50%"
  // picture, which is what made a blog with no collected traffic show a full audience breakdown.
  it('reports an uncollected range as empty instead of estimating it from stored views', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'legacy-post', views: 20 })

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=all')).json()
    expect(analytics.totalViews).toBe(0)
    expect(analytics.totalVisitors).toBe(0)
    expect(analytics.storedViews).toBe(20)
    expect(analytics.topCountries).toEqual([])
    expect(analytics.devices).toEqual([])
    expect(analytics.osList).toEqual([])
    expect(analytics.topPosts).toEqual([])
  })

  // The ranking used to be the posts' stored views, with a visitor count invented for the ones the
  // range had no data for; it is the range's own ranking now, and only posts it recorded appear.
  it('ranks top posts by the range and leaves out the ones it recorded nothing for', async () => {
    const db = await makeDb()
    await seedUser(db)
    const quiet = await seedBlogPost(db, { slug: 'quiet-top', views: 900 })
    const read = await seedBlogPost(db, { slug: 'read-top', views: 5 })
    await seedVisitAt(db, read.id, read.slug, Date.now() - 60_000, 'fp-read-1')
    await seedVisitAt(db, read.id, read.slug, Date.now() - 120_000, 'fp-read-2')

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=7d')).json()
    expect(analytics.storedViews).toBe(905)
    expect(analytics.topPosts.map((p: { slug: string }) => p.slug)).toEqual(['read-top'])
    expect(analytics.topPosts[0].views).toBe(2)
    expect(analytics.topPosts[0].visitors).toBe(2)
    expect(analytics.topPosts.some((p: { postId: string }) => p.postId === quiet.id)).toBe(false)
  })


  it('returns totals, timeline, and breakdown derived from visits', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'stats-post', title: 'Stats' })

    await runSql(
      db,
      `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, country, is_bot, is_self_referrer, is_owner)
       VALUES (?1, ?2, ?3, ?4, 'fp-1', 'CN', 0, 0, 0)`,
      USER, id, slug, H.now,
    )
    await runSql(
      db,
      `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, country, is_bot, is_self_referrer, is_owner)
       VALUES (?1, ?2, ?3, ?4, 'fp-2', 'US', 0, 0, 0)`,
      USER, id, slug, H.now - 60 * 60 * 1000,
    )

    const app = makeApp()
    const res = await request(app, '/api/blog/analytics?range=7d')
    expect(res.status).toBe(200)
    const { analytics } = await res.json()
    expect(analytics.totalPosts).toBe(1)
    expect(analytics.publishedPosts).toBe(1)
    expect(analytics.totalViews).toBe(2)
    expect(analytics.totalVisitors).toBe(2)
    expect(analytics.timeline.length).toBeGreaterThan(0)
    expect(analytics.topPosts[0].slug).toBe('stats-post')
  })

  // The badge used to read "+100%" for any range whose previous window held nothing, which is the
  // first week of traffic every blog ever has.
  it('reports no delta while the previous window holds no traffic', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'delta-post' })
    await seedVisitAt(db, id, slug, Date.now() - 60_000, 'fp-delta')

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=7d')).json()
    expect(analytics.totalViews).toBe(1)
    expect(analytics.viewsDelta).toBeUndefined()
    expect(analytics.visitorsDelta).toBeUndefined()
  })

  it('answers range=all with SQL aggregation instead of fetching every visit row', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'push-post' })
    await seedVisitAt(db, id, slug, Date.now() - 800 * 86_400_000, 'fp-pd-1')
    await seedVisitAt(db, id, slug, Date.now() - 60_000, 'fp-pd-2')
    const statements = captureSql(db)

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=all')).json()
    expect(analytics.totalViews).toBe(2)
    expect(analytics.totalVisitors).toBe(2)
    expect(analytics.timeline.reduce((sum: number, p: { views: number }) => sum + p.views, 0)).toBe(2)
    expect(analytics.topPosts[0].views).toBe(2)
    expect(statements.some((sql) => sql.includes('GROUP BY'))).toBe(true)
    expect(statements.filter((sql) => /^SELECT visited_at, visitor_fp/.test(sql))).toEqual([])
  })

  it('answers a bounded range from SQL aggregation, asking the database once for all of it', async () => {
    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'bounded-post' })
    await seedVisitAt(db, id, slug, Date.now() - 60_000, 'fp-bounded-1')
    await seedVisitAt(db, id, slug, Date.now() - 8 * 86_400_000, 'fp-bounded-old')
    const statements = captureSql(db)
    const calls = instrumentRoundTrips()

    const { analytics } = await (await request(makeApp(), '/api/blog/analytics?range=7d')).json()

    expect(analytics.totalViews).toBe(1)
    expect(analytics.totalVisitors).toBe(1)
    // The window is summarized by GROUP BYs now, not fetched row by row.
    expect(statements.filter((sql) => /^SELECT visited_at, visitor_fp/.test(sql))).toEqual([])
    expect(statements.some((sql) => sql.includes('GROUP BY'))).toBe(true)
    // Summary, previous window, filter counts and recent visits ride the aggregate's batch; only
    // the top-post titles need a second look-up.
    expect(calls.batch).toBe(1)
    expect(calls.direct).toBe(1)
  })

  it('deletes visit logs by type', async () => {

    const db = await makeDb()
    await seedUser(db)
    const { id, slug } = await seedBlogPost(db, { slug: 'clean-post' })
    await runSql(
      db,
      `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, is_bot, is_self_referrer, is_owner)
       VALUES (?1, ?2, ?3, ?4, 'fp-1', 0, 0, 0)`,
      USER, id, slug, H.now,
    )
    await runSql(
      db,
      `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, is_bot, is_self_referrer, is_owner)
       VALUES (?1, ?2, ?3, ?4, 'fp-2', 1, 0, 0)`,
      USER, id, slug, H.now,
    )

    const app = makeApp()
    const cleared = await request(app, '/api/blog/visits?type=bots', { method: 'DELETE' })
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).deleted).toBe(1)
  })
})

describe('blog note-post lookup route (real D1)', () => {
  it('resolves an existing note into its blog post', async () => {
    const db = await makeDb()
    await seedUser(db)
    const noteId = `n-${++H.counter}`
    await runSql(
      db,
      `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
         is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
       VALUES (?1, ?2, NULL, 'Note title', '', 'Note content', '', 1, 1, 1, 0, 0, 0, 0, ?3, ?4, ?4)`,
      noteId, USER, shaOf('Note content'), H.now,
    )
    await seedBlogPost(db, { note_id: noteId, slug: 'note-post', title: 'From note' })

    const app = makeApp()
    const res = await request(app, `/api/blog/note-post/${noteId}`)
    expect(res.status).toBe(200)
    const { post } = await res.json()
    expect(post.slug).toBe('note-post')

    const missing = await request(app, '/api/blog/note-post/n-absent')
    expect(missing.status).toBe(200)
    expect((await missing.json()).post).toBeNull()
  })
})
describe('blog visit log lifecycle (SH-05b)', () => {
  async function visitCounts(db: D1Shim): Promise<Record<string, number>> {
    const rows = await db.prepare('SELECT post_id, COUNT(*) AS n FROM blog_visits GROUP BY post_id').all()
    const counts: Record<string, number> = {}
    for (const row of rows.results ?? []) counts[String(row.post_id)] = Number(row.n)
    return counts
  }

  it('deleting a post deletes its visit log rows', async () => {
    const db = await makeDb()
    await seedUser(db)
    const doomed = await seedBlogPost(db, { id: 'p-doomed', slug: 'doomed' })
    const kept = await seedBlogPost(db, { id: 'p-kept', slug: 'kept' })
    await seedVisitAt(db, doomed.id, doomed.slug, H.now - 1_000, 'fp-a')
    await seedVisitAt(db, doomed.id, doomed.slug, H.now - 2_000, 'fp-b')
    await seedVisitAt(db, kept.id, kept.slug, H.now - 1_000, 'fp-c')
    const app = makeApp()

    expect((await request(app, `/api/blog/posts/${doomed.id}`, { method: 'DELETE' })).status).toBe(200)

    expect(await visitCounts(db)).toEqual({ [kept.id]: 1 })
  })

  it('a batch delete removes the visit rows of every post it removed', async () => {
    const db = await makeDb()
    await seedUser(db)
    const first = await seedBlogPost(db, { id: 'p-one', slug: 'one' })
    const second = await seedBlogPost(db, { id: 'p-two', slug: 'two' })
    const kept = await seedBlogPost(db, { id: 'p-three', slug: 'three' })
    await seedVisitAt(db, first.id, first.slug, H.now - 1_000, 'fp-a')
    await seedVisitAt(db, second.id, second.slug, H.now - 1_000, 'fp-b')
    await seedVisitAt(db, kept.id, kept.slug, H.now - 1_000, 'fp-c')
    const app = makeApp()

    const res = await postJson(app, '/api/blog/posts/batch', {
      action: 'delete',
      postIds: [first.id, second.id],
    })

    expect(res.status).toBe(200)
    expect(await visitCounts(db)).toEqual({ [kept.id]: 1 })
  })
})

describe('blog visit log cascade isolation (SH-05b)', () => {
  async function seedForeignPost(db: D1Shim): Promise<{ id: string; slug: string }> {
    const owner = 'user-2'
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES (?1, ?1, 'x', 'login', 'Other', '', ?2, ?2)`,
      owner, H.now,
    )
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, tags, published_at, created_at, updated_at)
       VALUES ('p-foreign', 'foreign', 'n-foreign', ?1, 'Foreign', 'body', '[]', ?2, ?2, ?2)`,
      owner, H.now,
    )
    await runSql(
      db,
      `INSERT INTO blog_visits (user_id, post_id, slug, visited_at, visitor_fp, is_bot, is_self_referrer, is_owner)
       VALUES (?1, 'p-foreign', 'foreign', ?2, 'fp-f', 0, 0, 0)`,
      owner, H.now,
    )
    return { id: 'p-foreign', slug: 'foreign' }
  }

  async function foreignRowCounts(db: D1Shim): Promise<{ posts: number; visits: number }> {
    const posts = await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_posts WHERE id = ?1', 'p-foreign')
    const visits = await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_visits WHERE post_id = ?1', 'p-foreign')
    return { posts: Number(posts?.n ?? 0), visits: Number(visits?.n ?? 0) }
  }

  it('a delete that names another account post leaves it alone', async () => {
    const db = await makeDb()
    await seedUser(db)
    const foreign = await seedForeignPost(db)
    const app = makeApp()

    expect((await request(app, `/api/blog/posts/${foreign.id}`, { method: 'DELETE' })).status).toBe(200)

    expect(await foreignRowCounts(db)).toEqual({ posts: 1, visits: 1 })
  })

  it('a batch delete that names another account post leaves it alone', async () => {
    const db = await makeDb()
    await seedUser(db)
    const foreign = await seedForeignPost(db)
    const app = makeApp()

    expect((await postJson(app, '/api/blog/posts/batch', { action: 'delete', postIds: [foreign.id] })).status).toBe(200)

    expect(await foreignRowCounts(db)).toEqual({ posts: 1, visits: 1 })
  })
})

describe('blog comment cascade ownership (SH-41)', () => {
  async function seedComment(db: D1Shim, id: string, postId: string): Promise<void> {
    await runSql(
      db,
      `INSERT INTO blog_comments (id, post_id, author_name, author_email, content, status, created_at)
       VALUES (?1, ?2, 'Reader', 'reader@example.com', 'A comment', 'approved', ?3)`,
      id, postId, H.now,
    )
  }

  async function foreignCommentState(db: D1Shim): Promise<{ kept: number; gone: number }> {
    const kept = await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_comments WHERE id = ?1', 'c-foreign')
    const gone = await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_comments WHERE id = ?1', 'c-mine')
    return { kept: Number(kept?.n ?? 0), gone: Number(gone?.n ?? 0) }
  }

  /** Seeds one post of this account and one of another, each with a comment. */
  async function seedTwoOwners(db: D1Shim): Promise<void> {
    await seedUser(db)
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES ('user-2', 'user-2', 'x', 'login', 'Other', '', ?1, ?1)`,
      H.now,
    )
    await seedBlogPost(db, { id: 'p-foreign', slug: 'foreign', note_id: 'n-foreign' })
    await runSql(db, 'UPDATE blog_posts SET user_id = ?1 WHERE id = ?2', 'user-2', 'p-foreign')
    await runSql(db, 'UPDATE blog_visits SET user_id = ?1 WHERE post_id = ?2', 'user-2', 'p-foreign')
    await seedBlogPost(db, { id: 'p-mine', slug: 'mine', note_id: 'n-mine' })
    await seedComment(db, 'c-foreign', 'p-foreign')
    await seedComment(db, 'c-mine', 'p-mine')
  }

  it('a single delete of another account post leaves its comment', async () => {
    const db = await makeDb()
    await seedTwoOwners(db)
    const app = makeApp()

    expect((await request(app, '/api/blog/posts/p-foreign', { method: 'DELETE' })).status).toBe(200)

    expect(await foreignCommentState(db)).toEqual({ kept: 1, gone: 1 })
  })

  it('a batch delete naming another account post leaves its comment', async () => {
    const db = await makeDb()
    await seedTwoOwners(db)
    const app = makeApp()

    expect((await postJson(app, '/api/blog/posts/batch', { action: 'delete', postIds: ['p-foreign'] })).status).toBe(200)

    expect(await foreignCommentState(db)).toEqual({ kept: 1, gone: 1 })
  })

  it('a batch delete of an own post removes that post comment', async () => {
    const db = await makeDb()
    await seedTwoOwners(db)
    const app = makeApp()

    expect((await postJson(app, '/api/blog/posts/batch', { action: 'delete', postIds: ['p-mine'] })).status).toBe(200)

    expect(await foreignCommentState(db)).toEqual({ kept: 1, gone: 0 })
  })

  it("deleting an own post still removes that post's comment", async () => {
    const db = await makeDb()
    await seedTwoOwners(db)
    const app = makeApp()

    expect((await request(app, '/api/blog/posts/p-mine', { method: 'DELETE' })).status).toBe(200)

    expect(await foreignCommentState(db)).toEqual({ kept: 1, gone: 0 })
  })
})

describe('blog comment batch statements stay inside the D1 bind limit', () => {
  async function seedComments(db: D1Shim, count: number): Promise<string[]> {
    const post = await seedBlogPost(db, { id: 'p-comments', slug: 'comments', note_id: 'n-comments' })
    const ids: string[] = []
    for (let index = 0; index < count; index++) {
      const id = `c-${index}`
      await runSql(
        db,
        `INSERT INTO blog_comments (id, post_id, author_name, author_email, content, status, created_at)
         VALUES (?1, ?2, 'Reader', 'reader@example.com', 'A comment', 'pending', ?3)`,
        id, post.id, H.now,
      )
      ids.push(id)
    }
    return ids
  }

  it('changes the status of a single comment', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedComments(db, 1)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/comments/batch', { action: 'approve', commentIds: ['c-0'] })

    expect(res.status).toBe(200)
    expect(await firstRow(db, "SELECT COUNT(*) AS n FROM blog_comments WHERE status = 'approved'"))
      .toMatchObject({ n: 1 })
  })

  it('approves more comments than one statement can bind', async () => {
    const db = await makeDb()
    await seedUser(db)
    const ids = await seedComments(db, 150)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/comments/batch', { action: 'approve', commentIds: ids })

    expect(res.status).toBe(200)
    expect(await firstRow(db, "SELECT COUNT(*) AS n FROM blog_comments WHERE status = 'approved'"))
      .toMatchObject({ n: 150 })
  })
})

describe('blog batch requests are bounded', () => {
  it('refuses a list larger than one request may carry with a readable 400', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const tooMany = Array.from({ length: 1001 }, (_, index) => `p-${index}`)

    const posts = await postJson(app, '/api/blog/posts/batch', { action: 'publish', postIds: tooMany })
    expect(posts.status).toBe(400)

    const comments = await postJson(app, '/api/blog/comments/batch', { action: 'approve', commentIds: tooMany })
    expect(comments.status).toBe(400)

    const links = await postJson(app, '/api/blog/links/batch', { action: 'approve', linkIds: tooMany })
    expect(links.status).toBe(400)

    const imported = await postJson(app, '/api/blog/links/import', {
      links: tooMany.map((id) => ({ id, name: 'L', url: 'https://example.com' })),
    })
    expect(imported.status).toBe(400)
  })
})

describe('blog batch statements stay inside the D1 bind limit (SH-42)', () => {
  async function seedManyPosts(db: D1Shim, count: number): Promise<string[]> {
    const ids: string[] = []
    for (let index = 0; index < count; index++) {
      const post = await seedBlogPost(db, { id: `many-${index}`, slug: `many-${index}` })
      await seedVisitAt(db, post.id, post.slug, H.now - 1_000, `fp-${index}`)
      ids.push(post.id)
    }
    return ids
  }

  it('deletes more posts than one statement can bind', async () => {
    const db = await makeDb()
    await seedUser(db)
    const ids = await seedManyPosts(db, 120)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/posts/batch', { action: 'delete', postIds: ids })

    expect(res.status).toBe(200)
    expect(await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_posts')).toMatchObject({ n: 0 })
    expect(await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_visits')).toMatchObject({ n: 0 })
  })

  it('publishes more posts than one statement can bind', async () => {
    const db = await makeDb()
    await seedUser(db)
    const ids = await seedManyPosts(db, 120)
    await runSql(db, 'UPDATE blog_posts SET is_published = 0')
    const app = makeApp()

    const res = await postJson(app, '/api/blog/posts/batch', { action: 'publish', postIds: ids })

    expect(res.status).toBe(200)
    expect(await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_posts WHERE is_published = 1'))
      .toMatchObject({ n: 120 })
  })
})

// LIKE reads `_` and `%` as wildcards, so a needle bound raw answers with unrelated rows — and a
// search for `%` alone degenerates into a scan of everything — on both the admin listings and the
// public one. The tag branch already escaped; these are the three that did not.
describe('blog LIKE wildcard escaping (SEC-07)', () => {
  it('treats a wildcard in the post list search as a literal', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedBlogPost(db, { slug: 'under-score', title: 'a_b report' })
    await seedBlogPost(db, { slug: 'no-underscore', title: 'axb report' })
    const app = makeApp()

    const admin = await (await request(app, '/api/blog/posts?search=a_b')).json()
    expect(admin.posts.map((p: { slug: string }) => p.slug)).toEqual(['under-score'])

    const publicList = await (await request(app, '/api/blog/public/posts?search=a_b')).json()
    expect(publicList.posts.map((p: { slug: string }) => p.slug)).toEqual(['under-score'])

    const wildcard = await (await request(app, '/api/blog/public/posts?search=%25')).json()
    expect(wildcard.posts).toEqual([])
  })

  it('treats a wildcard in the comment list search as a literal', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedBlogPost(db, { slug: 'commented' })
    await runSql(
      db,
      `INSERT INTO blog_comments (id, post_id, parent_id, author_name, author_email, author_url,
         author_avatar, content, status, created_at)
       VALUES ('c-1', ?1, NULL, 'a_b', 'a_b@example.com', NULL, '', 'first', 'approved', ?2),
              ('c-2', ?1, NULL, 'axb', 'axb@example.com', NULL, '', 'second', 'approved', ?2)`,
      post.id, H.now,
    )
    const app = makeApp()

    const body = await (await request(app, '/api/blog/comments?search=a_b')).json()
    expect(body.comments.map((c: { id: string }) => c.id)).toEqual(['c-1'])
  })

  // `parseInt` reads `12.7` and `30abc` as numbers rather than refusing them, and a window nobody
  // asked for is exactly what an `older_than` delete must not fall back to.
  it('refuses a visit cleanup day count that is not a plain positive integer', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedBlogPost(db, { slug: 'visited' })
    await seedVisitAt(db, post.id, post.slug, H.now - 1_000, 'fp-1')
    const app = makeApp()

    for (const raw of ['abc', '12.7', '30abc', '0', '-5']) {
      const res = await request(app, `/api/blog/visits?type=older_than&days=${encodeURIComponent(raw)}`, { method: 'DELETE' })
      expect(res.status, raw).toBe(400)
    }

    const ok = await request(app, '/api/blog/visits?type=older_than&days=3650', { method: 'DELETE' })
    expect(ok.status).toBe(200)
    expect(await firstRow(db, 'SELECT COUNT(*) AS n FROM blog_visits')).toMatchObject({ n: 1 })
  })
})

describe('blog publish moment (FEA-01)', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('keeps a scheduled post out of every reader-facing view until its moment', async () => {
    const db = await makeDb()
    await seedUser(db)
    const seededAt = Date.now()
    await seedBlogPost(db, { slug: 'already-out', published_at: seededAt - DAY, tags: ['tech'] })
    await seedBlogPost(db, { slug: 'scheduled', published_at: seededAt + DAY, tags: ['tech'] })
    const app = makeApp()

    const list = await (await request(app, '/api/blog/public/posts')).json()
    expect(list.posts.map((post: { slug: string }) => post.slug)).toEqual(['already-out'])
    expect(list.pagination.total).toBe(1)

    const categories = await (await request(app, '/api/blog/public/categories')).json()
    expect(categories.categories[0]?.postsCount ?? 0).toBe(0)

    const tags = await (await request(app, '/api/blog/public/tags')).json()
    expect(tags.tags).toEqual([{ name: 'tech', postsCount: 1 }])

    // Detail, comments and the comment form all read the post through the same gate.
    expect((await request(app, '/api/blog/public/posts/scheduled')).status).toBe(404)
    expect((await request(app, '/api/blog/public/posts/already-out')).status).toBe(200)
    expect((await request(app, '/api/blog/public/comments/scheduled')).status).toBe(404)
    const submitted = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'scheduled', authorName: 'Reader', authorEmail: 'reader@example.com', content: 'Too early?',
    })
    expect(submitted.status).toBe(404)
  })

  it('stamps a draft being published now and keeps the moment an already published post had', async () => {
    const db = await makeDb()
    await seedUser(db)
    const oldMoment = Date.now() - 10 * DAY
    const draft = await seedBlogPost(db, { slug: 'draft-stamp', is_published: 0, published_at: oldMoment })
    const live = await seedBlogPost(db, { slug: 'live-keep', is_published: 1, published_at: oldMoment })
    const app = makeApp()

    const before = Date.now()
    expect((await patchJson(app, `/api/blog/posts/${draft.id}`, { isPublished: true })).status).toBe(200)
    const stamped = await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', draft.id)
    expect(stamped?.published_at as number).toBeGreaterThanOrEqual(before)

    // Editing a live post must not move it: the archive order is a date readers already saw.
    expect((await patchJson(app, `/api/blog/posts/${live.id}`, { title: 'Retitled' })).status).toBe(200)
    const kept = await firstRow(db, 'SELECT published_at, title FROM blog_posts WHERE id = ?1', live.id)
    expect(kept?.published_at).toBe(oldMoment)
    expect(kept?.title).toBe('Retitled')

    // Republishing it (unpublish, publish) is a new moment — it was a draft at that point.
    await patchJson(app, `/api/blog/posts/${live.id}`, { isPublished: false })
    expect((await patchJson(app, `/api/blog/posts/${live.id}`, { isPublished: true })).status).toBe(200)
    const republished = await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', live.id)
    expect(republished?.published_at as number).toBeGreaterThan(oldMoment)
  })

  it('takes an explicit moment for scheduling and backdating', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()
    const scheduledAt = Date.now() + 3 * DAY

    const created = await postJson(app, '/api/blog/posts', {
      noteId: 'n-scheduled', title: 'Later', slug: 'later', content: 'Body', isPublished: true, publishedAt: scheduledAt,
    })
    expect(created.status).toBe(200)
    const { id } = await created.json()
    expect((await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', id))?.published_at).toBe(scheduledAt)
    expect((await request(app, '/api/blog/public/posts/later')).status).toBe(404)

    // The same field, the other direction: a moment in the past puts it back on the shelf.
    const backdated = Date.now() - DAY
    expect((await patchJson(app, `/api/blog/posts/${id}`, { publishedAt: backdated })).status).toBe(200)
    expect((await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', id))?.published_at).toBe(backdated)
    expect((await request(app, '/api/blog/public/posts/later')).status).toBe(200)
  })

  it('stamps drafts in a batch publish and leaves the rest of the archive where it was', async () => {
    const db = await makeDb()
    await seedUser(db)
    const oldMoment = Date.now() - 10 * DAY
    const draft = await seedBlogPost(db, { slug: 'batch-draft', is_published: 0, published_at: oldMoment })
    const live = await seedBlogPost(db, { slug: 'batch-live', is_published: 1, published_at: oldMoment })
    const app = makeApp()

    const res = await postJson(app, '/api/blog/posts/batch', { action: 'publish', postIds: [draft.id, live.id] })
    expect(res.status).toBe(200)
    const stamped = await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', draft.id)
    expect(stamped?.published_at as number).toBeGreaterThan(oldMoment)
    expect((await firstRow(db, 'SELECT published_at FROM blog_posts WHERE id = ?1', live.id))?.published_at).toBe(oldMoment)
  })

  it('shows a post published right now without waiting for the clock to tick', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const created = await postJson(app, '/api/blog/posts', {
      noteId: 'n-now', title: 'Now', slug: 'just-now', content: 'Body', isPublished: true,
    })
    expect(created.status).toBe(200)
    // The stored moment carries milliseconds while `strftime` reports whole seconds; a rule that
    // compares the two directly hides every fresh post for up to a second.
    expect((await request(app, '/api/blog/public/posts/just-now')).status).toBe(200)
  })

  it('refuses a publish moment that is not a plain epoch millisecond', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedBlogPost(db, { slug: 'guarded' })
    const app = makeApp()

    for (const bad of [-1, 1.5, 'later', 32_503_680_000_001]) {
      const res = await patchJson(app, `/api/blog/posts/${post.id}`, { publishedAt: bad })
      expect(res.status, String(bad)).toBe(400)
    }
  })
})
