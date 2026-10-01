import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import type { BlogCalendarRow, BlogPostPublicRow, BlogPublicCategoryRow, BlogTimelineRow } from '../../db/rows'
import { loadPublicPostBySlug } from './public-post'
import { registerBlogPublicRelatedRoute } from './public-related'
import { registerBlogPublicVisitBeaconRoute } from './visit-beacon'
import { safeDecodeTagParam, summarizePostTagCounts, toBlogSeoFields } from './helpers'
import { resolveRetiredSlug } from './slug-history'
import { publicPostVisibleSql } from './publish-moment'
import { searchPublicPosts } from './post-search'


import { registerMusicPublicRoutes } from '../music'
import { getBlogSettings } from './settings'
import { blogOwnerOf, registerBlogOwnerMiddleware } from './owner'
import { registerBlogPublicCommentsRoutes } from './public-comments'
import { registerBlogPublicLinksRoutes } from './public-links'
import { registerBlogPublicMediaRoutes } from './media'

export function registerBlogPublicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogCorsMiddleware(blogPublicRoutes)
  registerBlogCacheMiddleware(blogPublicRoutes)
  registerBlogOwnerMiddleware(blogPublicRoutes)
  registerBlogSiteRoute(blogPublicRoutes)
  registerBlogPublicPostsRoutes(blogPublicRoutes)
  registerBlogPublicRelatedRoute(blogPublicRoutes)
  registerBlogPublicRetiredSlugRoute(blogPublicRoutes)
  registerBlogPublicCategoriesRoute(blogPublicRoutes)
  registerBlogPublicTagsRoute(blogPublicRoutes)
  registerBlogPublicTimelineRoute(blogPublicRoutes)
  registerBlogPublicCalendarRoute(blogPublicRoutes)
  registerBlogPublicCommentsRoutes(blogPublicRoutes)
  registerBlogPublicLinksRoutes(blogPublicRoutes)
  registerBlogPublicMediaRoutes(blogPublicRoutes)
  registerBlogPublicVisitBeaconRoute(blogPublicRoutes)
  registerPublicMusicRoutes(blogPublicRoutes)
}

// The blog player reads the owner's music library read-only, gated by the publish switch.
function registerPublicMusicRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  const musicPublicRoutes = new Hono<AppBindings>()
  registerMusicPublicRoutes(musicPublicRoutes)
  blogPublicRoutes.route('/music', musicPublicRoutes)
}

const MUSIC_PREFIX = '/api/blog/public/music'
const SHARED_PLAYLIST_PREFIX = '/api/blog/public/music/playlists/'

// The published library and the media it points at are read by the blog player from another
// origin, so those answers keep the open origin. A shared playlist is not in that position: its
// slug is the capability and the page that renders it is served from this origin, so granting it
// `*` would let any page that learns a slug read the playlist out of a visitor's browser.
function openToAnyOrigin(path: string): boolean {
  return !path.startsWith(SHARED_PLAYLIST_PREFIX)
}

// A preflight is an invitation, so it advertises only what the path really answers: the music
// subtree underneath is read-only, and the POST belongs to the blog's comment form.
function allowedMethods(path: string): string {
  return path.startsWith(MUSIC_PREFIX) ? 'GET, OPTIONS' : 'GET, POST, OPTIONS'
}

// Audio and artwork routes build their own Response, which drops headers set on the context,
// so the origin has to be stamped on the final response to keep cross-origin playback working.
function registerBlogCorsMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    const path = c.req.path
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Origin', '*')
      c.header('Access-Control-Allow-Methods', allowedMethods(path))
      c.header('Access-Control-Allow-Headers', 'Content-Type')
      return c.body(null, 204)
    }
    await next()
    if (openToAnyOrigin(path)) c.res.headers.set('Access-Control-Allow-Origin', '*')
  })
}

function registerBlogCacheMiddleware(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.use('*', async (c, next) => {
    await next()
    // Routes that know their own lifetime (artwork, audio) keep the header they set.
    if (c.req.method === 'GET' && c.res.status === 200 && !c.res.headers.has('Cache-Control')) {
      c.res.headers.set(
        'Cache-Control',
        'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      )
    }
  })
}

function registerBlogSiteRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/site', async (c) => {
    const settings = await getBlogSettings(c.env.DB, blogOwnerOf(c).userId)
    return c.json({ settings })
  })
}

function registerBlogPublicPostsRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogPublicPostsListRoute(blogPublicRoutes)
  registerBlogPublicPostDetailRoute(blogPublicRoutes)
}

function registerBlogPublicPostsListRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/posts', async (c) => {
    const ownerId = blogOwnerOf(c).userId
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10', 10)))
    const offset = (page - 1) * limit
    const tag = safeDecodeTagParam(c.req.query('tag'))
    const categorySlug = c.req.query('category')?.trim()
    const search = c.req.query('search')?.trim()

    const { rows, total } = await searchPublicPosts(
      c.env.DB,
      ownerId,
      { categorySlug, search, tag },
      limit,
      offset,
      c.get('database')?.ftsEnabled === true,
    )

    return c.json({
      posts: rows.map(toPublicPostSummary),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  })
}

function toPublicPostSummary(row: BlogPostPublicRow & { snippet?: string }): {
  id: string
  slug: string
  title: string
  excerpt: string
  coverUrl: string
  categoryId: string | null
  categoryName: string | null
  categorySlug: string | null
  tags: string[]
  views: number
  commentsCount: number
  publishedAt: number
  updatedAt: number
  // Present only on a search answered from the full-text index: the text around the match, which
  // the reader-facing list prefers over the post's own excerpt.
  snippet?: string
} {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    tags: JSON.parse(row.tags || '[]'),
    views: row.views || 0,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    ...(row.snippet ? { snippet: row.snippet } : {}),
  }
}

function registerBlogPublicPostDetailRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/posts/:slug', async (c) => {
    const ownerId = blogOwnerOf(c).userId
    const slug = c.req.param('slug')
    const row = await loadPublicPostBySlug(c.env.DB, ownerId, slug)

    // Reading a post does not count as a view. This request comes from the reader's server (the blog
    // frontend renders server-side), so it carries no visitor user-agent and `isBot('')` was true for
    // every one of them: the rows it wrote were all bots, the counter never moved, and the dashboard
    // therefore read 0 PV for traffic it had in fact recorded. The count comes from the browser's own
    // beacon (see visit-beacon.ts) and this path only serves the post.
    const post = {
      ...toPublicPostSummary(row),
      content: row.content,
      allowComments: Boolean(row.allow_comments),
      isPinned: Boolean(row.is_pinned),
      // The post's own preview values ride on the detail answer rather than on the list: a page that
      // draws meta tags needs them, a list that draws cards does not (FEA-02).
      ...toBlogSeoFields(row),
    }

    const prevPost = await loadAdjacentPost(c.env.DB, ownerId, row.published_at, false)
    const nextPost = await loadAdjacentPost(c.env.DB, ownerId, row.published_at, true)

    return c.json({ post, prevPost, nextPost })
  })
}

/**
 * Where a reader asking for a retired address should be sent (FEA-03). The answer is the post's
 * current slug, or null when nothing readable owns that address — the front end keeps the request a
 * 404 in that case instead of inventing a destination.
 */
function registerBlogPublicRetiredSlugRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/resolve-slug/:slug', async (c) => {
    const slug = c.req.param('slug')
    const current = await resolveRetiredSlug(c.env.DB, blogOwnerOf(c).userId, slug)
    return c.json({ slug: current })
  })
}

async function loadAdjacentPost(db: D1Database, ownerId: string, publishedAt: number, newer: boolean): Promise<{ slug: string; title: string } | null> {
  const row = newer
    ? await db
        .prepare(`SELECT slug, title FROM blog_posts WHERE ${publicPostVisibleSql('blog_posts')} AND user_id = ?2 AND published_at > ?1 ORDER BY published_at ASC LIMIT 1`)
        .bind(publishedAt, ownerId)
        .first<{ slug: string; title: string }>()
    : await db
        .prepare(`SELECT slug, title FROM blog_posts WHERE ${publicPostVisibleSql('blog_posts')} AND user_id = ?2 AND published_at < ?1 ORDER BY published_at DESC LIMIT 1`)
        .bind(publishedAt, ownerId)
        .first<{ slug: string; title: string }>()
  return row || null
}

function registerBlogPublicCategoriesRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/categories', async (c) => {
    const { results } = await c.env.DB
      .prepare(`
        SELECT c.id, c.name, c.slug, c.description, c.color, c.icon,
          COUNT(p.id) as posts_count
        FROM blog_categories c
        LEFT JOIN blog_posts p ON c.id = p.category_id AND ${publicPostVisibleSql('p')}
        WHERE c.user_id = ?1
        GROUP BY c.id
        ORDER BY c.position ASC, c.created_at ASC
      `)
      .bind(blogOwnerOf(c).userId)
      .all<BlogPublicCategoryRow>()

    return c.json({ categories: results || [] })
  })
}

/**
 * The archive endpoints answer with the whole published blog by design — a timeline or a calendar is
 * only useful complete — so their bound is a ceiling far above a personal blog's post count rather
 * than a page size, and every one of them keeps the newest rows: past the ceiling the oldest posts
 * fall out of the archive views, never the recent ones.
 */
const PUBLIC_ARCHIVE_LIMIT = 2000

function registerBlogPublicTagsRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/tags', async (c) => {
    const { results } = await c.env.DB
      .prepare(`
        SELECT tags FROM blog_posts
        WHERE ${publicPostVisibleSql('blog_posts')} AND user_id = ?1
        ORDER BY published_at DESC LIMIT ${PUBLIC_ARCHIVE_LIMIT}
      `)
      .bind(blogOwnerOf(c).userId)
      .all<{ tags: string }>()

    const tagCounts = summarizePostTagCounts(results || [])
    const tags = Array.from(tagCounts.entries()).map(([name, postsCount]) => ({
      name,
      postsCount,
    })).sort((a, b) => b.postsCount - a.postsCount)

    return c.json({ tags })
  })
}

function registerBlogPublicTimelineRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/timeline', async (c) => {
    const { results } = await c.env.DB
      .prepare(`
        SELECT id, slug, title, published_at, cover_url, tags, views, updated_at, seo_noindex
        FROM blog_posts
        WHERE ${publicPostVisibleSql('blog_posts')} AND user_id = ?1
        ORDER BY published_at DESC LIMIT ${PUBLIC_ARCHIVE_LIMIT}
      `)
      .bind(blogOwnerOf(c).userId)
      .all<BlogTimelineRow>()

    return c.json({ timeline: buildBlogTimelineMap(results || []) })
  })
}

interface BlogTimelineEntry {
  id: string
  slug: string
  title: string
  publishedAt: number
  // What a sitemap needs to date a post and to leave a noindex one out of the index (FEA-08).
  updatedAt: number
  noindex: boolean
  coverUrl: string
  tags: unknown[]
  views: number
}

function buildBlogTimelineMap(rows: BlogTimelineRow[]): Record<number, Record<number, BlogTimelineEntry[]>> {
  const timelineMap: Record<number, Record<number, BlogTimelineEntry[]>> = {}
  for (const row of rows) {
    const d = new Date(row.published_at)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    if (!timelineMap[year]) timelineMap[year] = {}
    if (!timelineMap[year][month]) timelineMap[year][month] = []
    timelineMap[year][month].push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      noindex: row.seo_noindex === 1,
      coverUrl: row.cover_url,
      tags: JSON.parse(row.tags || '[]'),
      views: row.views || 0,
    })
  }
  return timelineMap
}

function registerBlogPublicCalendarRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/calendar', async (c) => {
    const { results } = await c.env.DB
      // The inner order picks which posts the ceiling keeps (the newest), the outer one keeps the
      // order the calendar renders in (a day's posts oldest first).
      .prepare(`
        SELECT slug, title, published_at FROM (
          SELECT slug, title, published_at FROM blog_posts
          WHERE ${publicPostVisibleSql('blog_posts')} AND user_id = ?1
          ORDER BY published_at DESC LIMIT ${PUBLIC_ARCHIVE_LIMIT}
        ) ORDER BY published_at ASC
      `)
      .bind(blogOwnerOf(c).userId)
      .all<BlogCalendarRow>()

    return c.json({ calendar: buildBlogCalendarMap(results || []) })
  })
}

function buildBlogCalendarMap(rows: BlogCalendarRow[]): Record<string, { count: number; posts: { slug: string; title: string }[] }> {
  const calendarMap: Record<string, { count: number; posts: { slug: string; title: string }[] }> = {}
  for (const row of rows) {
    const d = new Date(row.published_at)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!calendarMap[dateStr]) {
      calendarMap[dateStr] = { count: 0, posts: [] }
    }
    calendarMap[dateStr].count++
    calendarMap[dateStr].posts.push({ slug: row.slug, title: row.title })
  }
  return calendarMap
}
