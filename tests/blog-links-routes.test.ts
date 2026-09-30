import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogManageRoutes, blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const USER = 'user-test-1'
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

/** One published post, so a comment submission has something to be filed under. */
async function seedPostForComments(db: D1Shim): Promise<string> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, is_published, published_at, created_at, updated_at)
     VALUES ('post-comments', 'url-comments', 'note-comments', ?1, 'Comments', 'body', 1, 1000, 1000, 1000)`,
    USER,
  )
  return 'post-comments'
}

describe('blog links management and public routes', () => {
  it('manages link categories with two-level hierarchy', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const parentRes = await postJson(app, '/api/blog/links/categories', {
      name: 'DevTools',
      icon: 'Code',
    })
    expect(parentRes.status).toBe(200)
    const { category: parentCat } = await parentRes.json() as any
    expect(parentCat.name).toBe('DevTools')
    expect(parentCat.parentId).toBeNull()

    const subRes = await postJson(app, '/api/blog/links/categories', {
      name: 'Frontend',
      parentId: parentCat.id,
    })
    expect(subRes.status).toBe(200)
    const { category: subCat } = await subRes.json() as any
    expect(subCat.name).toBe('Frontend')
    expect(subCat.parentId).toBe(parentCat.id)

    const linkRes = await postJson(app, '/api/blog/links', {
      name: 'React',
      url: 'https://react.dev',
      description: 'The library for web and native user interfaces',
      categoryId: subCat.id,
      isPinned: true,
    })
    expect(linkRes.status).toBe(200)
    const { link } = await linkRes.json() as any
    expect(link.name).toBe('React')
    expect(link.isPinned).toBe(true)

    const listRes = await request(app, '/api/blog/links')
    expect(listRes.status).toBe(200)
    const listData = await listRes.json() as any
    expect(listData.categories.length).toBe(2)
    expect(listData.links.length).toBe(1)
    expect(listData.counts.approved).toBe(1)

    const delCatRes = await request(app, `/api/blog/links/categories/${parentCat.id}`, { method: 'DELETE' })
    expect(delCatRes.status).toBe(200)

    const afterDelRes = await request(app, '/api/blog/links')
    const afterDelData = await afterDelRes.json() as any
    expect(afterDelData.categories.length).toBe(1)
    expect(afterDelData.categories[0].parentId).toBeNull()
  })

  it('supports link audit status and pin updates', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/links', {
      name: 'GitHub',
      url: 'https://github.com',
      status: 'pending',
    })
    const { link } = await res.json() as any
    expect(link.status).toBe('pending')

    const statusRes = await patchJson(app, `/api/blog/links/${link.id}/status`, { status: 'approved' })
    expect(statusRes.status).toBe(200)

    const pinRes = await patchJson(app, `/api/blog/links/${link.id}/pin`, { isPinned: true })
    expect(pinRes.status).toBe(200)

    const listRes = await request(app, '/api/blog/links')
    const listData = await listRes.json() as any
    const updated = listData.links.find((l: any) => l.id === link.id)
    expect(updated.status).toBe('approved')
    expect(updated.isPinned).toBe(true)
  })

  it('supports batch actions on links', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const r1 = await postJson(app, '/api/blog/links', { name: 'L1', url: 'https://1.com', status: 'pending' })
    const r2 = await postJson(app, '/api/blog/links', { name: 'L2', url: 'https://2.com', status: 'pending' })
    const { link: l1 } = await r1.json() as any
    const { link: l2 } = await r2.json() as any

    const batchRes = await postJson(app, '/api/blog/links/batch', {
      action: 'approve',
      linkIds: [l1.id, l2.id],
    })
    expect(batchRes.status).toBe(200)

    const listRes = await request(app, '/api/blog/links')
    const listData = await listRes.json() as any
    expect(listData.counts.approved).toBe(2)
  })

  it('handles public link requests, duplicate prevention and clicks', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const reqRes = await postJson(app, '/api/blog/public/link-requests', {
      name: 'My Blog',
      url: 'https://myblog.com',
      description: 'Tech notes',
      email: 'me@example.com',
    })
    expect(reqRes.status).toBe(200)
    const reqData = await reqRes.json() as any
    expect(reqData.success).toBe(true)

    const dupRes = await postJson(app, '/api/blog/public/link-requests', {
      name: 'My Blog 2',
      url: 'https://myblog.com',
    })
    expect(dupRes.status).toBe(409)

    const listRes = await request(app, '/api/blog/links')
    const listData = await listRes.json() as any
    expect(listData.counts.pending).toBe(1)
    const pendingLink = listData.links.find((l: any) => l.url === 'https://myblog.com')
    expect(pendingLink.status).toBe('pending')

    const pubRes = await request(app, '/api/blog/public/links')
    const pubData = await pubRes.json() as any
    expect(pubData.links.length).toBe(0)

    await patchJson(app, `/api/blog/links/${pendingLink.id}/status`, { status: 'approved' })

    const pubRes2 = await request(app, '/api/blog/public/links')
    const pubData2 = await pubRes2.json() as any
    expect(pubData2.links.length).toBe(1)

    const clickRes = await postJson(app, `/api/blog/public/links/${pendingLink.id}/click`, {})
    expect(clickRes.status).toBe(200)
  })

  // The click counter is public-facing and used to move on every request, so both halves are
  // asserted here: a link the blog has not approved is not the public's to count, and one visitor
  // counts once per window however many times the same link is clicked.
  it('counts one click per visitor per window and none on an unapproved link', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const pending = await postJson(app, '/api/blog/links', { name: 'Pending', url: 'https://pending.com', status: 'pending' })
    const approved = await postJson(app, '/api/blog/links', { name: 'Approved', url: 'https://approved.com', status: 'approved' })
    const pendingId = (await pending.json() as any).link.id
    const approvedId = (await approved.json() as any).link.id

    const unapproved = await postJson(app, `/api/blog/public/links/${pendingId}/click`, {})
    expect((await unapproved.json() as any).counted).toBe(false)

    const first = await postJson(app, `/api/blog/public/links/${approvedId}/click`, {})
    expect((await first.json() as any).counted).toBe(true)
    const repeated = await postJson(app, `/api/blog/public/links/${approvedId}/click`, {})
    expect((await repeated.json() as any).counted).toBe(false)

    const clicksOf = async (id: string): Promise<number> => {
      const row = await db.prepare('SELECT clicks FROM blog_links WHERE id = ?1').bind(id).first()
      return Number((row as { clicks: number }).clicks)
    }
    expect(await clicksOf(approvedId)).toBe(1)
    expect(await clicksOf(pendingId)).toBe(0)
  })

  // Every request in the harness arrives from the same client, which is what makes the
  // budget observable at all: the count used to be over the whole table, so the sixth
  // application here would have been the sixth from anywhere.
  it('caps the applications one client can send within a minute', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    for (let index = 0; index < 5; index += 1) {
      const res = await postJson(app, '/api/blog/public/link-requests', {
        name: `Blog ${index}`,
        url: `https://blog-${index}.com`,
      })
      expect(res.status).toBe(200)
    }

    const overBudget = await postJson(app, '/api/blog/public/link-requests', {
      name: 'One Too Many',
      url: 'https://one-too-many.com',
    })
    expect(overBudget.status).toBe(429)
  })

  it('imports links and categories preserving category hierarchy', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const payload = {
      categories: [
        { id: 'cat-root', name: 'Recommended', icon: 'Star', parentId: null, sortOrder: 0 },
        { id: 'cat-sub', name: 'SearchEngines', icon: 'Search', parentId: 'cat-root', sortOrder: 0 },
      ],
      links: [
        { name: 'Google', url: 'https://google.com', categoryId: 'cat-sub', isPinned: true },
        { name: 'Bing', url: 'https://bing.com', categoryId: 'cat-sub' },
      ],
    }

    const importRes = await postJson(app, '/api/blog/links/import', payload)
    expect(importRes.status).toBe(200)
    const importData = await importRes.json() as any
    expect(importData.importedLinks).toBe(2)
    expect(importData.importedCategories).toBe(2)

    const listRes = await request(app, '/api/blog/links')
    const listData = await listRes.json() as any
    expect(listData.links.length).toBe(2)
    expect(listData.categories.length).toBe(2)
  })

  it('toggles favorite and reorders links', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const r1 = await postJson(app, '/api/blog/links', { name: 'A', url: 'https://a.com' })
    const r2 = await postJson(app, '/api/blog/links', { name: 'B', url: 'https://b.com' })
    const { link: l1 } = await r1.json() as any
    const { link: l2 } = await r2.json() as any

    const favRes = await patchJson(app, `/api/blog/links/${l1.id}/favorite`, { isFavorite: true })
    expect(favRes.status).toBe(200)
    const favData = await favRes.json() as any
    expect(favData.isFavorite).toBe(true)

    const reorderRes = await postJson(app, '/api/blog/links/reorder', {
      orders: [
        { id: l2.id, sortOrder: 0 },
        { id: l1.id, sortOrder: 1 },
      ],
    })
    expect(reorderRes.status).toBe(200)

    const batchFavRes = await postJson(app, '/api/blog/links/batch', {
      action: 'unfavorite',
      linkIds: [l1.id],
    })
    expect(batchFavRes.status).toBe(200)

    const listRes = await request(app, '/api/blog/links')
    const listData = await listRes.json() as any
    const foundL1 = listData.links.find((l: any) => l.id === l1.id)
    expect(foundL1.isFavorite).toBe(false)
    expect(foundL1.sortOrder).toBe(1)
  })

  it('checks link URLs via link checker route', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const checkRes = await postJson(app, '/api/blog/links/check', {
      urls: ['https://invalid-non-existent-domain-xyz-123.org'],
    })
    expect(checkRes.status).toBe(200)
    const checkData = await checkRes.json() as any
    expect(Array.isArray(checkData.results)).toBe(true)
    expect(checkData.results.length).toBe(1)
    expect(checkData.results[0].level).toBe('broken')
  })
})

// The links view drives this endpoint from every filter control, and until now the endpoint ignored
// all three parameters: the client got the whole table back and filtered it again in the browser.
// These cases pin the question the client actually asks, plus the two answers that have to stay
// honest — the tab badges count every matching link (not just the page that came back), and an
// unknown status is refused instead of being answered as "all".
describe('blog links list filters and counts', () => {
  async function seedFilterableLinks(db: D1Shim): Promise<void> {
    const rows: Array<[string, string, string, string, string | null, number, number]> = [
      ['l-pinned', 'Alpha React', 'https://react.dev', 'approved', 'cat-a', 1, 0],
      ['l-favorite', 'Beta Vue', 'https://vuejs.org', 'pending', 'cat-a', 0, 1],
      ['l-rejected', 'Gamma', 'https://gamma.example', 'rejected', null, 0, 0],
      ['l-percent', '100% Wild', 'https://wild.example', 'approved', 'cat-b', 0, 0],
    ]
    await db.batch(rows.map(([id, name, url, status, categoryId, isPinned, isFavorite]) =>
      db.prepare(`
        INSERT INTO blog_links (id, user_id, name, url, category_id, status, is_pinned, is_favorite, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1000, 1000)
      `).bind(id, USER, name, url, categoryId, status, isPinned, isFavorite),
    ))
  }

  const listedIds = (data: { links: Array<{ id: string }> }): string[] =>
    data.links.map((link) => link.id).sort()

  it('filters by status, flag, category and search, and counts every matching link', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedFilterableLinks(db)
    const app = makeApp()

    const all = await (await request(app, '/api/blog/links')).json() as any
    expect(listedIds(all)).toEqual(['l-favorite', 'l-percent', 'l-pinned', 'l-rejected'])
    expect(all.counts).toMatchObject({ total: 4, pending: 1, approved: 2, rejected: 1, pinned: 1, favorite: 1 })

    const pending = await (await request(app, '/api/blog/links?status=pending')).json() as any
    expect(listedIds(pending)).toEqual(['l-favorite'])
    // Switching tabs must not shrink the badge the reader is about to switch back to.
    expect(pending.counts).toMatchObject({ total: 4, pending: 1, approved: 2, pinned: 1 })

    expect(listedIds(await (await request(app, '/api/blog/links?status=pinned')).json() as any)).toEqual(['l-pinned'])
    expect(listedIds(await (await request(app, '/api/blog/links?status=favorite')).json() as any)).toEqual(['l-favorite'])

    const category = await (await request(app, '/api/blog/links?categoryId=cat-a')).json() as any
    expect(listedIds(category)).toEqual(['l-favorite', 'l-pinned'])
    expect(category.counts).toMatchObject({ total: 2, pending: 1, approved: 1, pinned: 1, favorite: 1 })

    const narrowed = await (await request(app, '/api/blog/links?categoryId=cat-a&status=pending')).json() as any
    expect(listedIds(narrowed)).toEqual(['l-favorite'])
    expect(narrowed.counts).toMatchObject({ total: 2, pending: 1 })

    expect(listedIds(await (await request(app, '/api/blog/links?search=react')).json() as any)).toEqual(['l-pinned'])
  })

  it('reads the search needle\'s wildcards as characters and refuses a status it does not know', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedFilterableLinks(db)
    const app = makeApp()

    const percent = await (await request(app, `/api/blog/links?search=${encodeURIComponent('100%')}`)).json() as any
    expect(listedIds(percent)).toEqual(['l-percent'])

    const underscore = await (await request(app, '/api/blog/links?search=100_')).json() as any
    expect(listedIds(underscore)).toEqual([])

    expect((await request(app, '/api/blog/links?status=spam')).status).toBe(400)
  })

  it('answers a bounded page while the badges still count every matching link', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    await db.batch(Array.from({ length: 501 }, (_, index) =>
      db.prepare(`
        INSERT INTO blog_links (id, user_id, name, url, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 'approved', ?5, ?5)
      `).bind(`bulk-${index}`, USER, `Bulk ${index}`, `https://bulk-${index}.example`, 1000 + index),
    ))

    const data = await (await request(app, '/api/blog/links?status=approved')).json() as {
      links: unknown[]
      counts: { approved: number }
    }
    expect(data.links).toHaveLength(500)
    expect(data.counts.approved).toBe(501)
  })
})

// A URL from a reader is rendered inside the admin session, so the allowlist is asked of the server
// first: a link's target, a picture, the site's own address and everything an import carries.
describe('blog URL allowlist', () => {
  const EXECUTABLE = 'javascript:alert(document.cookie)'

  it('refuses a link URL that is not one a link may carry', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    expect((await postJson(app, '/api/blog/links', { name: 'X', url: EXECUTABLE })).status).toBe(400)
    expect((await postJson(app, '/api/blog/links', { name: 'X', url: 'data:text/html,<script>1</script>' })).status).toBe(400)
    expect((await postJson(app, '/api/blog/links', { name: 'X', url: '//evil.example/x' })).status).toBe(400)
    expect((await postJson(app, '/api/blog/links', { name: 'X', url: 'mailto:a@b.c' })).status).toBe(200)
    expect((await postJson(app, '/api/blog/links', { name: 'Y', url: '/posts/hello' })).status).toBe(200)
  })

  it('refuses a reader application whose site or picture is not renderable', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const executable = await postJson(app, '/api/blog/public/link-requests', {
      name: 'Spam', url: EXECUTABLE, email: 'spam@example.com',
    })
    expect(executable.status).toBe(400)

    const picture = await postJson(app, '/api/blog/public/link-requests', {
      name: 'Spam', url: 'https://spam.example', avatar: 'data:image/svg+xml,<svg onload=alert(1)>',
    })
    expect(picture.status).toBe(400)

    expect(await db.prepare('SELECT COUNT(*) AS n FROM blog_links').first<{ n: number }>()).toMatchObject({ n: 0 })
  })

  it('refuses a comment whose author URL would run in the admin session', async () => {
    const db = await makeDb()
    await seedUser(db)
    const post = await seedPostForComments(db)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/public/comments', {
      postSlug: 'url-comments',
      authorName: 'Reader',
      authorEmail: 'reader@example.com',
      content: 'Hello',
      authorUrl: EXECUTABLE,
    })
    expect(res.status).toBe(400)
    expect(await db.prepare('SELECT COUNT(*) AS n FROM blog_comments WHERE post_id = ?1').bind(post).first<{ n: number }>())
      .toMatchObject({ n: 0 })
  })

  it('refuses a frontend address the blog cannot be linked from', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    expect((await patchJson(app, '/api/blog/settings', { frontendUrl: EXECUTABLE })).status).toBe(400)
    expect((await patchJson(app, '/api/blog/settings', { frontendUrl: 'https://blog.example' })).status).toBe(200)
    const social = await patchJson(app, '/api/blog/settings', { socialLinks: { github: EXECUTABLE } })
    expect(social.status).toBe(400)
  })

  it('refuses an imported row the same way', async () => {
    const db = await makeDb()
    await seedUser(db)
    const app = makeApp()

    const res = await postJson(app, '/api/blog/links/import', {
      links: [{ name: 'X', url: EXECUTABLE }],
    })
    expect(res.status).toBe(400)
  })
})

const OTHER = 'user-test-2'

interface LinkRowSnapshot {
  name: string
  url: string
  user_id: string
  email: string
}

interface CategoryRowSnapshot {
  name: string
  user_id: string
  parent_id: string | null
}

// The ids in a saved link are the row's primary key, and the upsert keys on that rather than on the
// owner, so a second account that guesses or imports an id can save over the first account's row —
// and read it back. Every case here is that shape, plus the two foreign keys a save carries (a
// link's category, a category's parent).
describe('blog links ownership guards', () => {
  async function twoAccounts(): Promise<{
    db: D1Shim
    mine: Hono<AppBindings>
    theirs: Hono<AppBindings>
  }> {
    const db = await makeDb()
    await seedUser(db, USER)
    await seedUser(db, OTHER)
    return { db, mine: makeApp(USER), theirs: makeApp(OTHER) }
  }

  async function snapshotLink(db: D1Shim, id: string): Promise<LinkRowSnapshot> {
    const row = await db
      .prepare('SELECT name, url, user_id, email FROM blog_links WHERE id = ?1')
      .bind(id)
      .first<LinkRowSnapshot>()
    expect(row).not.toBeNull()
    return row as LinkRowSnapshot
  }

  it('refuses to save over a link another account owns', async () => {
    const { db, mine, theirs } = await twoAccounts()
    const created = await postJson(theirs, '/api/blog/links', {
      name: 'Their link',
      url: 'https://theirs.example',
      email: 'theirs@example.com',
    })
    const { link } = await created.json() as { link: { id: string } }

    const hijack = await postJson(mine, '/api/blog/links', {
      id: link.id,
      name: 'Hijacked',
      url: 'https://hijacked.example',
    })
    expect(hijack.status).toBe(404)
    expect(JSON.stringify(await hijack.json())).not.toContain('theirs@example.com')

    expect(await snapshotLink(db, link.id)).toMatchObject({
      name: 'Their link',
      url: 'https://theirs.example',
      user_id: OTHER,
    })
  })

  it('refuses to save over a link category another account owns', async () => {
    const { db, mine, theirs } = await twoAccounts()
    const created = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await created.json() as { category: { id: string } }

    const hijack = await postJson(mine, '/api/blog/links/categories', {
      id: category.id,
      name: 'Hijacked group',
    })
    expect(hijack.status).toBe(404)

    const row = await db
      .prepare('SELECT name, user_id, parent_id FROM blog_link_categories WHERE id = ?1')
      .bind(category.id)
      .first<CategoryRowSnapshot>()
    expect(row).toMatchObject({ name: 'Their group', user_id: OTHER })
  })

  it('refuses a category parented under another account', async () => {
    const { db, mine, theirs } = await twoAccounts()
    const created = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await created.json() as { category: { id: string } }

    const res = await postJson(mine, '/api/blog/links/categories', {
      name: 'My child',
      parentId: category.id,
    })
    expect(res.status).toBe(400)

    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM blog_link_categories WHERE user_id = ?1')
      .bind(USER)
      .first<{ n: number }>()
    expect(Number(count?.n)).toBe(0)
  })

  it('refuses a link filed under another account category', async () => {
    const { db, mine, theirs } = await twoAccounts()
    const created = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await created.json() as { category: { id: string } }

    const res = await postJson(mine, '/api/blog/links', {
      name: 'My link',
      url: 'https://mine.example',
      categoryId: category.id,
    })
    expect(res.status).toBe(400)

    const count = await db.prepare('SELECT COUNT(*) AS n FROM blog_links').first<{ n: number }>()
    expect(Number(count?.n)).toBe(0)
  })

  it('refuses a batch refile into another account category', async () => {
    const { db, mine, theirs } = await twoAccounts()
    const categoryRes = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await categoryRes.json() as { category: { id: string } }
    const linkRes = await postJson(mine, '/api/blog/links', { name: 'My link', url: 'https://mine.example', status: 'pending' })
    const { link } = await linkRes.json() as { link: { id: string } }

    const batch = await postJson(mine, '/api/blog/links/batch', {
      action: 'setCategory',
      linkIds: [link.id],
      categoryId: category.id,
    })
    expect(batch.status).toBe(400)

    const row = await db
      .prepare('SELECT category_id FROM blog_links WHERE id = ?1')
      .bind(link.id)
      .first<{ category_id: string | null }>()
    expect(row?.category_id).toBeNull()
  })

  it('imports a file whose ids another account holds without touching that account', async () => {
    const { mine, theirs } = await twoAccounts()
    const categoryRes = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await categoryRes.json() as { category: { id: string } }
    const linkRes = await postJson(theirs, '/api/blog/links', {
      name: 'Their link',
      url: 'https://theirs.example',
      categoryId: category.id,
    })
    const { link } = await linkRes.json() as { link: { id: string } }

    const res = await postJson(mine, '/api/blog/links/import', {
      categories: [{ id: category.id, name: 'Their group', parentId: null, sortOrder: 0 }],
      links: [{ id: link.id, name: 'Their link', url: 'https://theirs.example', categoryId: category.id }],
    })
    expect(res.status).toBe(200)

    const mineList = await (await request(mine, '/api/blog/links')).json() as {
      links: Array<{ id: string; name: string; categoryId: string | null }>
      categories: Array<{ id: string; name: string }>
    }
    expect(mineList.categories).toHaveLength(1)
    expect(mineList.categories[0]!.id).not.toBe(category.id)
    expect(mineList.links).toHaveLength(1)
    expect(mineList.links[0]!.id).not.toBe(link.id)
    expect(mineList.links[0]!.categoryId).toBe(mineList.categories[0]!.id)

    const theirList = await (await request(theirs, '/api/blog/links')).json() as {
      links: Array<{ id: string; name: string }>
      categories: Array<{ id: string; name: string }>
    }
    expect(theirList.categories).toHaveLength(1)
    expect(theirList.categories[0]!.name).toBe('Their group')
    expect(theirList.links).toHaveLength(1)
    expect(theirList.links[0]!.name).toBe('Their link')
  })

  it('drops an imported link category reference the file does not carry and this account does not own', async () => {
    const { mine, theirs } = await twoAccounts()
    const categoryRes = await postJson(theirs, '/api/blog/links/categories', { name: 'Their group' })
    const { category } = await categoryRes.json() as { category: { id: string } }

    const res = await postJson(mine, '/api/blog/links/import', {
      links: [{ name: 'Orphan', url: 'https://orphan.example', categoryId: category.id }],
    })
    expect(res.status).toBe(200)

    const list = await (await request(mine, '/api/blog/links')).json() as {
      links: Array<{ name: string; categoryId: string | null }>
    }
    expect(list.links).toHaveLength(1)
    expect(list.links[0]!.categoryId).toBeNull()
  })
})

