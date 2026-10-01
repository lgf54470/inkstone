import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

/**
 * FEA-08: the feed is told when it changed, and the public archive views an aggregator reads carry
 * enough to date and filter what they see. The ping is best-effort like the comment webhook, so the
 * observable is the request it makes (and the fact that a failing hub never fails the write).
 */

const USER = 'user-1'
// A post the reader-facing queries treat as live: scheduling hides anything with a future moment.
const VISIBLE_PUBLISHED_AT = 1_700_000_000_000
const HUB = 'https://hub.example.com/'
const FRONTEND = 'https://blog.example.com'
const FEED_URL = `${FRONTEND}/feed.xml`

const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, 'writer', 'x', 'login', 'writer', '', 1, 1)`,
    USER,
  )
  return db
}

async function seedPost(
  db: D1Shim,
  fields: { id: string; slug: string; isPublished?: boolean; publishedAt?: number; seoNoindex?: boolean },
): Promise<string> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at,
       seo_noindex)
     VALUES (?1, ?2, ?3, ?4, ?2, '', 'body', '', NULL, NULL, '[]', ?5, 1, 0, 0, ?6, ?6, ?6, ?7)`,
    fields.id,
    fields.slug,
    `note-${fields.id}`,
    USER,
    fields.isPublished === false ? 0 : 1,
    fields.publishedAt ?? VISIBLE_PUBLISHED_AT,
    fields.seoNoindex ? 1 : 0,
  )
  return fields.id
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

async function configureHub(app: Hono<AppBindings>, hub: string): Promise<void> {
  const res = await patchJson(app, '/api/blog/settings', { websubHubUrl: hub, frontendUrl: FRONTEND })
  expect(res.status).toBe(200)
}

/** Lets the settings read and the ping run to completion; the write route itself does not wait. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const HUB_FETCH = vi.fn(async () => new Response(null, { status: 204 }))

function pingCalls(): Array<[string, RequestInit | undefined]> {
  return HUB_FETCH.mock.calls as Array<[string, RequestInit | undefined]>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  HUB_FETCH.mockClear()
})

describe('WebSub ping (FEA-08)', () => {
  it('tells the configured hub to refetch the feed when a published post is written', async () => {
    vi.stubGlobal('fetch', HUB_FETCH)
    const db = await makeDb()
    const app = makeApp()
    await configureHub(app, HUB)

    const res = await postJson(app, '/api/blog/posts', {
      noteId: 'note-1',
      title: 'First post',
      content: 'body',
      slug: 'ping-one',
      isPublished: true,
    })
    expect(res.status).toBe(200)

    await vi.waitFor(() => expect(HUB_FETCH).toHaveBeenCalledTimes(1))
    const [url, init] = pingCalls()[0]
    expect(url).toBe(HUB)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'content-type': 'application/x-www-form-urlencoded' })
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('hub.mode')).toBe('publish')
    expect(body.get('hub.url')).toBe(FEED_URL)
  })

  it('pings for a content patch but not for one that only moves presentation', async () => {
    vi.stubGlobal('fetch', HUB_FETCH)
    const db = await makeDb()
    const app = makeApp()
    await configureHub(app, HUB)
    const postId = await seedPost(db, { id: 'post-content', slug: 'content-post' })

    const patched = await patchJson(app, `/api/blog/posts/${postId}`, { title: 'Rewritten' })
    expect(patched.status).toBe(200)
    await vi.waitFor(() => expect(HUB_FETCH).toHaveBeenCalledTimes(1))

    const pinned = await patchJson(app, `/api/blog/posts/${postId}`, { isPinned: true })
    expect(pinned.status).toBe(200)
    await settle()
    // A pin changes the order of a page, not the feed: pinging for it tells subscribers to refetch
    // the same bytes.
    expect(HUB_FETCH).toHaveBeenCalledTimes(1)
  })

  it('pings when a draft is published and when a published post is restored from history', async () => {
    vi.stubGlobal('fetch', HUB_FETCH)
    const db = await makeDb()
    const app = makeApp()
    await configureHub(app, HUB)
    const postId = await seedPost(db, { id: 'post-draft', slug: 'draft-post', isPublished: false })

    const published = await patchJson(app, `/api/blog/posts/${postId}`, { isPublished: true })
    expect(published.status).toBe(200)
    await vi.waitFor(() => expect(HUB_FETCH).toHaveBeenCalledTimes(1))

    // A content patch keeps the previous state as a version; restoring it is a write like any other.
    await patchJson(app, `/api/blog/posts/${postId}`, { content: 'second draft' })
    await vi.waitFor(() => expect(HUB_FETCH).toHaveBeenCalledTimes(2))
    const list = await request(app, `/api/blog/posts/${postId}/revisions`)
    const revisions = (await list.json() as { revisions: Array<{ id: string }> }).revisions
    expect(revisions.length).toBeGreaterThan(0)

    const restored = await postJson(app, `/api/blog/posts/${postId}/revisions/${revisions[0].id}/restore`, {})
    expect(restored.status).toBe(200)
    await vi.waitFor(() => expect(HUB_FETCH).toHaveBeenCalledTimes(3))
  })

  it('keeps quiet for a post scheduled in the future and when no hub is configured', async () => {
    vi.stubGlobal('fetch', HUB_FETCH)
    await makeDb()
    const app = makeApp()
    await configureHub(app, HUB)

    // A scheduled post is not in the feed yet, so there is nothing for a subscriber to refetch.
    const scheduled = await postJson(app, '/api/blog/posts', {
      noteId: 'note-later',
      title: 'Later post',
      content: 'body',
      slug: 'later-post',
      isPublished: true,
      publishedAt: Date.now() + 86_400_000,
    })
    expect(scheduled.status).toBe(200)
    await settle()
    expect(HUB_FETCH).not.toHaveBeenCalled()

    // The same write after the hub is cleared must not reach the network either.
    await configureHub(app, '')
    await postJson(app, '/api/blog/posts', {
      noteId: 'note-2',
      title: 'Second post',
      content: 'body',
      slug: 'ping-two',
      isPublished: true,
    })
    await settle()
    expect(HUB_FETCH).not.toHaveBeenCalled()
  })

  it('answers the write even when the hub is unreachable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('hub down')
    })
    vi.stubGlobal('fetch', failing)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await makeDb()
    const app = makeApp()
    await configureHub(app, HUB)

    const res = await postJson(app, '/api/blog/posts', {
      noteId: 'note-1',
      title: 'Deliver me',
      content: 'body',
      slug: 'still-saved',
      isPublished: true,
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    expect(warn.mock.calls.flat().join(' ')).toContain('WebSub ping failed')
    // The post is stored whatever the hub answered.
    const row = await db.prepare('SELECT slug FROM blog_posts WHERE slug = ?1').bind('still-saved').first()
    expect(row).toMatchObject({ slug: 'still-saved' })
  })

  it('rejects a hub address the app would not call', async () => {
    await makeDb()
    const app = makeApp()
    const res = await patchJson(app, '/api/blog/settings', { websubHubUrl: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
  })
})

describe('public archive feed metadata (FEA-08)', () => {
  it('carries the last edit moment and the noindex flag on each timeline post', async () => {
    const db = await makeDb()
    await seedPost(db, { id: 'post-plain', slug: 'plain-post' })
    await seedPost(db, { id: 'post-hidden', slug: 'hidden-post', seoNoindex: true })

    const app = makeApp()
    const res = await request(app, '/api/blog/public/timeline')
    expect(res.status).toBe(200)
    const timeline = (await res.json() as { timeline: Record<string, Record<string, Array<Record<string, unknown>>>> }).timeline
    const posts = Object.values(timeline).flatMap((months) => Object.values(months)).flat()
    const plain = posts.find((post) => post.slug === 'plain-post')
    const hidden = posts.find((post) => post.slug === 'hidden-post')
    expect(plain).toMatchObject({ updatedAt: VISIBLE_PUBLISHED_AT, noindex: false })
    expect(hidden).toMatchObject({ noindex: true })
  })
})
