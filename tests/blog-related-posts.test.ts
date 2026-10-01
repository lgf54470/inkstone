import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { blogPublicRoutes } from '../src/worker/routes/blog'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

/**
 * FEA-12: a post page offers what else to read. The relation is stated, not guessed — shared tags
 * first, then the same category — and a post with neither gets no list rather than a "latest posts"
 * filler that pretends to be related.
 */

const ALICE = 'user-alice'
const BOB = 'user-bob'
const VISIBLE_PUBLISHED_AT = 1_700_000_000_000

const DB_ENV = { env: { DB: null as unknown as D1Database } }

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  for (const account of [ALICE, BOB]) {
    await runSql(
      db,
      `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
       VALUES (?1, ?1, 'x', 'login', ?1, '', 1, 1)`,
      account,
    )
  }
  return db
}

interface SeedPost {
  id: string
  slug: string
  userId?: string
  tags?: string[]
  categoryId?: string | null
  isPublished?: boolean
  publishedAt?: number
}

async function seedPost(db: D1Shim, post: SeedPost): Promise<void> {
  await runSql(
    db,
    `INSERT INTO blog_posts (id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id,
       folder_id, tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?2, ?2, 'body', '', ?5, NULL, ?6, ?7, 1, 0, 0, ?8, ?8, ?8)`,
    post.id,
    post.slug,
    `note-${post.id}`,
    post.userId ?? ALICE,
    post.categoryId ?? null,
    JSON.stringify(post.tags ?? []),
    post.isPublished === false ? 0 : 1,
    post.publishedAt ?? VISIBLE_PUBLISHED_AT,
  )
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/blog/public', blogPublicRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string): Promise<Response> {
  return app.request(path, undefined, DB_ENV.env as AppBindings['Bindings'])
}

async function relatedSlugs(app: Hono<AppBindings>, slug: string, query = ''): Promise<{ status: number; slugs: string[] }> {
  const res = await request(app, `/api/blog/public/posts/${slug}/related${query}`)
  if (res.status !== 200) return { status: res.status, slugs: [] }
  const body = await res.json() as { posts: Array<{ slug: string }> }
  return { status: res.status, slugs: body.posts.map((post) => post.slug) }
}

describe('related posts (FEA-12)', () => {
  it('ranks by shared tags, then the same category, then recency', async () => {
    const db = await makeDb()
    await seedPost(db, { id: 'self', slug: 'self', tags: ['a', 'b', 'c'], categoryId: 'cat-1' })
    await seedPost(db, { id: 'two-tags', slug: 'two-tags', tags: ['a', 'b'], publishedAt: VISIBLE_PUBLISHED_AT - 9_000 })
    await seedPost(db, { id: 'one-tag', slug: 'one-tag', tags: ['a'], publishedAt: VISIBLE_PUBLISHED_AT - 1_000 })
    await seedPost(db, { id: 'same-cat', slug: 'same-cat', tags: [], categoryId: 'cat-1', publishedAt: VISIBLE_PUBLISHED_AT - 1_000 })
    await seedPost(db, { id: 'unrelated', slug: 'unrelated', tags: ['z'], categoryId: 'cat-2' })
    await seedPost(db, { id: 'draft', slug: 'draft', tags: ['a', 'b'], isPublished: false })
    await seedPost(db, { id: 'later', slug: 'later', tags: ['a'], publishedAt: Date.now() + 86_400_000 })
    await seedPost(db, { id: 'bob-post', slug: 'bob-related', userId: BOB, tags: ['a'] })

    const app = makeApp()
    const { status, slugs } = await relatedSlugs(app, 'self')
    expect(status).toBe(200)
    // Two shared tags beats one; the same category beats a post with neither; drafts, scheduled posts
    // and another blog are not candidates at all.
    expect(slugs).toEqual(['two-tags', 'one-tag', 'same-cat'])
  })

  it('returns nothing rather than a latest-posts filler when there is no relation', async () => {
    const db = await makeDb()
    await seedPost(db, { id: 'self', slug: 'self', tags: [] })
    await seedPost(db, { id: 'other', slug: 'other', tags: [] })

    const app = makeApp()
    const { status, slugs } = await relatedSlugs(app, 'self')
    expect(status).toBe(200)
    expect(slugs).toEqual([])
  })

  it('answers 404 for an unknown post of an unaddressed blog', async () => {
    const db = await makeDb()
    await seedPost(db, { id: 'alice', slug: 'alice-post', tags: ['a'] })
    await seedPost(db, { id: 'bob', slug: 'bob-post', userId: BOB, tags: ['a'] })

    const app = makeApp()
    expect((await relatedSlugs(app, 'missing')).status).toBe(404)
    expect((await relatedSlugs(app, 'alice-post')).status).toBe(200)
    expect((await relatedSlugs(app, 'alice-post', `?owner=bob`)).status).toBe(404)
  })

  it('bounds the list and treats tag values as literals', async () => {
    const db = await makeDb()
    await seedPost(db, { id: 'self', slug: 'self', tags: ['%', 'a'] })
    for (let index = 0; index < 10; index++) {
      await seedPost(db, { id: `tagged-${index}`, slug: `tagged-${index}`, tags: ['a'], publishedAt: VISIBLE_PUBLISHED_AT - index * 1_000 })
    }
    await seedPost(db, { id: 'literal', slug: 'literal-percent', tags: ['%'] })
    await seedPost(db, { id: 'underscore', slug: 'underscore', tags: ['_'] })

    const app = makeApp()
    const capped = await relatedSlugs(app, 'self', '?limit=99')
    expect(capped.slugs.length).toBeLessThanOrEqual(8)
    // `%` is a tag here, not a wildcard that matches `_`.
    expect(capped.slugs).toContain('literal-percent')
    expect(capped.slugs).not.toContain('underscore')
  })
})
