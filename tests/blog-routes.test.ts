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
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

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
    (fields.published_at as number) ?? H.now,
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

    const detail = await request(app, '/api/blog/public/posts/published-one')
    expect(detail.status).toBe(200)
    const { post } = await detail.json()
    expect(post.title).toBe('Published')
    expect(post.views).toBe(1)

    const timelineRes = await request(app, '/api/blog/public/timeline')
    expect(timelineRes.status).toBe(200)
    const timelineData = await timelineRes.json()
    const postDate = new Date(H.now)
    const postYear = postDate.getFullYear()
    const postMonth = postDate.getMonth() + 1
    const timelinePosts = timelineData.timeline[postYear]?.[postMonth] || []
    expect(timelinePosts).toHaveLength(1)
    expect(timelinePosts[0].slug).toBe('published-one')
    expect(timelinePosts[0].views).toBe(1)

    const hidden = await request(app, '/api/blog/public/posts/draft-one')
    expect(hidden.status).toBe(404)
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
})

describe('blog settings routes (real D1)', () => {
  it('reads defaults, patches settings, and serves them publicly', async () => {
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

    const site = await request(app, '/api/blog/public/site')
    expect((await site.json()).settings.siteName).toBe('Inkstone Blog')
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

describe('blog analytics routes (real D1)', () => {
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