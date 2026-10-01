import type { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { clampInt } from '../../lib/request'
import { loadPublicPostBySlug } from './public-post'
import { publicPostVisibleSql } from './publish-moment'
import type { BlogRelatedRow } from '../../db/rows'
import { blogOwnerOf } from './owner'

/**
 * What else to read after a post (FEA-12). The relation is stated — shared tags, then the same
 * category — and scored in SQL so the ceiling stays on the rows actually shown: a post related to
 * nothing answers with an empty list rather than the newest posts wearing a "related" label.
 */

/** How many of a post's tags take part in the match; the first ones are enough to rank by overlap. */
const RELATED_TAG_LIMIT = 10
const RELATED_LIMIT_DEFAULT = 4
const RELATED_LIMIT_MAX = 8

export function registerBlogPublicRelatedRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/posts/:slug/related', async (c) => {
    const ownerId = blogOwnerOf(c).userId
    const post = await loadPublicPostBySlug(c.env.DB, ownerId, c.req.param('slug'))
    const limit = clampInt(c.req.query('limit'), 1, RELATED_LIMIT_MAX, RELATED_LIMIT_DEFAULT)
    const tags = parseTags(post.tags).slice(0, RELATED_TAG_LIMIT)
    const query = relatedPostsQuery({ ownerId, postId: post.id, categoryId: post.category_id, tags, limit })
    const { results } = await c.env.DB.prepare(query.sql).bind(...query.params).all<BlogRelatedRow>()

    return c.json({ posts: (results || []).map(toRelatedPost) })
  })
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    // A row whose tag column does not parse is a row about nothing: it contributes no overlaps.
    return []
  }
}

function relatedPostsQuery(params: {
  ownerId: string
  postId: string
  categoryId: string | null
  tags: string[]
  limit: number
}): { sql: string; params: unknown[] } {
  const binds: unknown[] = [params.ownerId, params.postId, params.categoryId]
  let next = binds.length + 1
  let tagOverlap = '0'
  if (params.tags.length > 0) {
    const placeholders = params.tags.map(() => `?${next++}`)
    binds.push(...params.tags)
    tagOverlap = `(SELECT COUNT(*) FROM json_each(p.tags) jt WHERE jt.value IN (${placeholders.join(', ')}))`
  }
  const limitPlaceholder = `?${next}`
  binds.push(params.limit)

  // The outer select is what filters by score: a scalar subquery is not an aggregate, so the aliases
  // cannot ride a HAVING, and filtering after LIMIT would rank rows the page never shows.
  const sql = `
    SELECT * FROM (
      SELECT p.id, p.slug, p.title, p.excerpt, p.cover_url, p.category_id, p.tags, p.published_at, p.updated_at,
        ${tagOverlap} AS tag_overlap,
        (CASE WHEN p.category_id IS NOT NULL AND p.category_id = ?3 THEN 1 ELSE 0 END) AS same_category
      FROM blog_posts p
      WHERE ${publicPostVisibleSql('p')} AND p.user_id = ?1 AND p.id <> ?2
    )
    WHERE tag_overlap > 0 OR same_category = 1
    ORDER BY tag_overlap DESC, same_category DESC, published_at DESC
    LIMIT ${limitPlaceholder}
  `
  return { sql, params: binds }
}

function toRelatedPost(row: BlogRelatedRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    tags: parseTags(row.tags),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}
