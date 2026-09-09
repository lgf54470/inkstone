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

