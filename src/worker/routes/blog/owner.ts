import type { Context } from 'hono'
import type { Hono } from 'hono'
import type { BlogOwner } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { USERNAME_PATTERN, normalizeUsername } from '../../lib/password'

/** The address a public blog answers to. */
export const BLOG_OWNER_QUERY = 'owner'

/**
 * The music subtree underneath the blog public prefix keeps its own publish switch and resolves the
 * account that switch names, so it is left to do that instead of being handed this one.
 */
const MUSIC_PUBLIC_PREFIX = '/api/blog/public/music'

interface OwnerRow {
  userId: string
  username: string
}

/**
 * Resolves the account a public blog request is for and publishes the answer on the context, so no
 * public handler can query without one.
 *
 * What the address will become: the host is the next source (`<username>.blog.example.com`), which is
 * why resolution is a middleware rather than a per-handler query — a new source is one branch here,
 * not a sweep over every read. Until then `?owner=` is the only address, and a request without one is
 * answered by the instance default blog, which is what every pre-multi-tenant link already means.
 */
export function registerBlogOwnerMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    if (c.req.path.startsWith(MUSIC_PUBLIC_PREFIX)) return next()

    const owner = await resolveBlogOwner(c)
    c.set('blogOwner', owner)
    // The answer names the blog it answered for, so a cached response or an operator reading a log
    // can tell which account a body belongs to without reconstructing the request.
    c.header('X-Inkstone-Blog-Owner', owner.username)
    await next()
  })
}

/**
 * The owner a public handler must query with. Throws instead of returning nothing: a public route
 * registered ahead of the middleware would otherwise bind an undefined owner and answer "this blog is
 * empty" — an outage that looks like data loss.
 */
export function blogOwnerOf(c: Context<AppBindings>): BlogOwner {
  const owner = c.get('blogOwner')
  if (!owner) throw ApiError.internal('Blog owner was never resolved for a public route')
  return owner
}

async function resolveBlogOwner(c: Context<AppBindings>): Promise<BlogOwner> {
  const requested = c.req.query(BLOG_OWNER_QUERY)?.trim()
  return requested ? ownerNamed(c.env.DB, requested) : instanceDefaultOwner(c.env.DB)
}

async function ownerNamed(db: D1Database, rawUsername: string): Promise<BlogOwner> {
  const username = normalizeUsername(rawUsername)
  // A name that could not be issued is answered as not found rather than as a format error: the
  // reader asked for a blog, and no blog has that name.
  const row = USERNAME_PATTERN.test(username)
    ? await db
        .prepare('SELECT id AS userId, username FROM users WHERE username = ?1')
        .bind(username)
        .first<OwnerRow>()
    : null
  if (!row) throw ApiError.notFound('Blog not found')
  return row
}

/**
 * The instance's first account is the blog that existed before addresses did. The ordering is by
 * `created_at` and then by insertion order, so two accounts seeded in the same millisecond still
 * resolve to the one that was created first.
 */
async function instanceDefaultOwner(db: D1Database): Promise<BlogOwner> {
  const row = await db
    .prepare('SELECT id AS userId, username FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1')
    .first<OwnerRow>()
  if (!row) throw ApiError.notFound('Blog not found')
  return row
}
