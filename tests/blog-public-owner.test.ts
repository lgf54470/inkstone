import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext
const NOW = 2_000_000_000_000
const VISIBLE_PUBLISHED_AT = 1_700_000_000_000

interface SeededAccount {
  id: string
  username: string
  createdAt: number
}

/** Two accounts whose creation order is explicit, so the instance default is not a coin flip. */
const ALICE: SeededAccount = { id: 'user-alice', username: 'alice', createdAt: 1_000 }
const BOB: SeededAccount = { id: 'user-bob', username: 'bob', createdAt: 2_000 }

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedAccount(db: D1Shim, account: SeededAccount): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', ?2, '', ?3, ?3)`,
    account.id, account.username, account.createdAt,
  )
}

let postSequence = 0

async function seedPost(
  db: D1Shim,
  account: SeededAccount,
  fields: { slug: string; title?: string; isPublished?: boolean; allowComments?: boolean },
): Promise<string> {
  const id = `post-${++postSequence}`
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, '', NULL, NULL, ?7, ?8, ?9, 0, 0, ?10, ?11, ?11)`,
    id,
    fields.slug,
    `note-${id}`,
    account.id,
    fields.title ?? fields.slug,
    `body of ${fields.slug}`,
    JSON.stringify(['shared-tag']),
    fields.isPublished === false ? 0 : 1,
    fields.allowComments === false ? 0 : 1,
    // A visitor's clock has already passed this moment: reader-facing queries hide a post whose
    // publish time is still in the future (that is what scheduling is), and `NOW` is 2033.
    VISIBLE_PUBLISHED_AT,
    NOW,
  )
  return id
}

async function seedLink(db: D1Shim, account: SeededAccount, name: string): Promise<string> {
  const id = `link-${account.id}-${name}`
  await runSql(
    db,
    `INSERT INTO blog_links (id, user_id, name, url, description, avatar, email, category_id,
       status, is_pinned, pinned_order, is_favorite, sort_order, is_active, clicks, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, '', '', '', NULL, 'approved', 0, 0, 0, 0, 1, 0, ?5, ?5)`,
    id, account.id, name, `https://${name}.example.com`, NOW,
  )
  return id
}

/** A manage app that answers as the given account, plus the public app mount the reader uses. */
function makeApp(account: SeededAccount = ALICE): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.use('/api/blog', async (c, next) => {
    c.set('userId', account.id)
    await next()
  })
  app.use('/api/blog/*', async (c, next) => {
    c.set('userId', account.id)
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

async function slugsOf(response: Response): Promise<string[]> {
  const body = await response.json() as { posts: Array<{ slug: string }> }
  return body.posts.map((post) => post.slug).sort()
}

async function countRows(db: D1Shim, table: string, where: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...binds).first()
  return Number((row as { n: number }).n)
}

describe('blog public owner resolution (real D1)', () => {
  it('serves only the addressed blog and names it in the response', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)
    await seedPost(db, ALICE, { slug: 'alice-post' })
    await seedPost(db, BOB, { slug: 'bob-post' })
    await seedLink(db, ALICE, 'alice-friend')
    await seedLink(db, BOB, 'bob-friend')

    const app = makeApp()
    const alice = await request(app, '/api/blog/public/posts?owner=alice')
    expect(alice.status).toBe(200)
    expect(await slugsOf(alice)).toEqual(['alice-post'])
    expect(alice.headers.get('X-Inkstone-Blog-Owner')).toBe('alice')

    const bob = await request(app, '/api/blog/public/posts?owner=bob')
    expect(await slugsOf(bob)).toEqual(['bob-post'])

    const links = await request(app, '/api/blog/public/links?owner=alice')
    const linkBody = await links.json() as { links: Array<{ name: string }> }
    expect(linkBody.links.map((link) => link.name)).toEqual(['alice-friend'])
  })

  it('answers an unaddressed request from the instance default blog', async () => {
    const db = await makeDb()
    // The later-inserted account is the earlier registration, so this pins the default to the
    // earliest account rather than to whichever row happens to come back first.
    const late: SeededAccount = { id: 'user-late', username: 'late', createdAt: 9_000 }
    const early: SeededAccount = { id: 'user-early', username: 'early', createdAt: 500 }
    await seedAccount(db, late)
    await seedAccount(db, early)
    await seedPost(db, late, { slug: 'late-post' })
    await seedPost(db, early, { slug: 'early-post' })
    await seedLink(db, early, 'early-friend')

    const app = makeApp()
    const list = await request(app, '/api/blog/public/posts')
    expect(await slugsOf(list)).toEqual(['early-post'])
    expect(list.headers.get('X-Inkstone-Blog-Owner')).toBe('early')

    const links = await request(app, '/api/blog/public/links')
    const linkBody = await links.json() as { links: Array<{ name: string }> }
    expect(linkBody.links.map((link) => link.name)).toEqual(['early-friend'])
  })

  it('answers an unissued or malformed blog address with 404', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)

    const app = makeApp()
    expect((await request(app, '/api/blog/public/posts?owner=nobody')).status).toBe(404)
    expect((await request(app, '/api/blog/public/posts?owner=NOT%20A%20NAME')).status).toBe(404)
    expect((await request(app, '/api/blog/public/site?owner=nobody')).status).toBe(404)
  })

  it('keeps another blog post from being readable through the same slug', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)
    await seedPost(db, ALICE, { slug: 'alice-only' })

    const app = makeApp()
    const asAlice = await request(app, '/api/blog/public/posts/alice-only?owner=alice')
    expect(asAlice.status).toBe(200)

    const asBob = await request(app, '/api/blog/public/posts/alice-only?owner=bob')
    expect(asBob.status).toBe(404)

    const commentsForBob = await request(app, '/api/blog/public/comments/alice-only?owner=bob')
    expect(commentsForBob.status).toBe(404)

    // The public answer carries the rendered markdown, never the id of the note it came from.
    const post = (await asAlice.json() as { post: Record<string, unknown> }).post
    expect(post.noteId).toBeUndefined()
    expect(post.content).toBe('body of alice-only')
  })

  it('scopes tags, categories, timeline and calendar to the addressed blog', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)
    await seedPost(db, ALICE, { slug: 'alice-post' })
    await seedPost(db, BOB, { slug: 'bob-post' })

    const app = makeApp()
    const aliceTags = await request(app, '/api/blog/public/tags?owner=alice')
    const tagBody = await aliceTags.json() as { tags: Array<{ name: string; postsCount: number }> }
    expect(tagBody.tags).toEqual([{ name: 'shared-tag', postsCount: 1 }])

    const aliceCalendar = await request(app, '/api/blog/public/calendar?owner=alice')
    const calendarBody = await aliceCalendar.json() as { calendar: Record<string, { posts: Array<{ slug: string }> }> }
    const calendarSlugs = Object.values(calendarBody.calendar).flatMap((day) => day.posts.map((post) => post.slug))
    expect(calendarSlugs).toEqual(['alice-post'])

    const aliceTimeline = await request(app, '/api/blog/public/timeline?owner=alice')
    const timelineBody = await aliceTimeline.json() as { timeline: Record<string, Record<string, Array<{ slug: string }>>> }
    const timelineSlugs = Object.values(timelineBody.timeline)
      .flatMap((months) => Object.values(months))
      .flatMap((posts) => posts.map((post) => post.slug))
    expect(timelineSlugs).toEqual(['alice-post'])
  })

  it('serves the addressed blog own site settings', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)

    const alice = makeApp(ALICE)
    const bob = makeApp(BOB)
    await request(alice, '/api/blog/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName: 'Alice Journal' }) })
    await request(bob, '/api/blog/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteName: 'Bob Journal' }) })

    const forAlice = await request(alice, '/api/blog/public/site?owner=alice')
    expect((await forAlice.json() as { settings: { siteName: string } }).settings.siteName).toBe('Alice Journal')
    const forBob = await request(bob, '/api/blog/public/site?owner=bob')
    expect((await forBob.json() as { settings: { siteName: string } }).settings.siteName).toBe('Bob Journal')
  })

  it('ignores a settings row that no account owns', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    // The key a build without tenant addressing could read but never wrote: settings live under the
    // account they belong to, so a stray row here must not be served to anyone.
    await runSql(
      db,
      `INSERT INTO app_meta (key, value) VALUES ('blog_settings_global', ?1)`,
      JSON.stringify({ siteName: 'Nobody Blog' }),
    )

    const app = makeApp()
    const publicSite = await request(app, '/api/blog/public/site?owner=alice')
    const manage = await request(app, '/api/blog/settings')
    expect((await publicSite.json() as { settings: { siteName: string } }).settings.siteName).toBe('Inkstone Blog')
    expect((await manage.json() as { settings: { siteName: string } }).settings.siteName).toBe('Inkstone Blog')
  })

  it('files a public comment on the addressed blog and honours that blog approval switch', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)
    const alicePost = await seedPost(db, ALICE, { slug: 'talk-to-alice' })
    await seedPost(db, BOB, { slug: 'talk-to-bob' })

    const alice = makeApp(ALICE)
    const bob = makeApp(BOB)
    // Alice reviews before publishing; Bob posts straight through.
    await request(alice, '/api/blog/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requireCommentApproval: false }) })

    const comment = { authorName: 'Reader', authorEmail: 'reader@example.com', content: 'Hello' }
    const onAlice = await postJson(alice, '/api/blog/public/comments?owner=alice', { ...comment, postSlug: 'talk-to-alice' })
    expect(onAlice.status).toBe(200)
    expect((await onAlice.json() as { status: string }).status).toBe('approved')

    const onBob = await postJson(bob, '/api/blog/public/comments?owner=bob', { ...comment, postSlug: 'talk-to-bob' })
    expect((await onBob.json() as { status: string }).status).toBe('pending')

    expect(await countRows(db, 'blog_comments', 'post_id = ?1', alicePost)).toBe(1)
    // The slug belongs to Alice's blog, so Bob's form cannot be answered with Alice's post.
    const crossed = await postJson(bob, '/api/blog/public/comments?owner=bob', { ...comment, postSlug: 'talk-to-alice' })
    expect(crossed.status).toBe(404)
  })

  it('files a public link application under the addressed blog only', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)

    const app = makeApp()
    const body = { name: 'Friend', url: 'https://friend.example.com', description: '', email: 'friend@example.com' }
    const forAlice = await postJson(app, '/api/blog/public/link-requests?owner=alice', body)
    expect(forAlice.status).toBe(200)

    // The duplicate check is the blog's own directory, so the same site may apply to the other blog.
    const forBob = await postJson(app, '/api/blog/public/link-requests?owner=bob', body)
    expect(forBob.status).toBe(200)

    expect(await countRows(db, 'blog_links', 'user_id = ?1 AND status = ?2', ALICE.id, 'pending')).toBe(1)
    expect(await countRows(db, 'blog_links', 'user_id = ?1 AND status = ?2', BOB.id, 'pending')).toBe(1)
  })

  it('counts a click only on a link the addressed blog owns', async () => {
    const db = await makeDb()
    await seedAccount(db, ALICE)
    await seedAccount(db, BOB)
    const aliceLink = await seedLink(db, ALICE, 'alice-friend')

    const app = makeApp()
    const crossed = await postJson(app, `/api/blog/public/links/${aliceLink}/click?owner=bob`, {})
    expect(crossed.status).toBe(200)
    expect(await countRows(db, 'blog_links', 'clicks = 1')).toBe(0)

    await postJson(app, `/api/blog/public/links/${aliceLink}/click?owner=alice`, {})
    expect(await countRows(db, 'blog_links', 'clicks = 1')).toBe(1)
  })
})
