import { segmentCJK } from '@shared/markdown-utils'
import { drainBlogFtsQueue, hasPendingBlogFtsWork } from '../../db/blog-fts'
import type { BlogPostPublicRow } from '../../db/rows'
import { escapeLike, likeAny } from '../../lib/like'
import { contentWindowSql, makeSnippet } from '../../lib/snippet'
import { publicPostVisibleSql } from './publish-moment'
import { blogTagFilterSql } from './tag-needles'

/**
 * The public list's search. Two answers to the same question live here: the full-text index ranks by
 * relevance and can cut a snippet around the match, and LIKE is the fallback for a database without
 * FTS5 and for the window where a queued write has not been indexed yet — answering from a
 * partially indexed blog would quietly omit posts, which is worse than answering unranked.
 */

export interface PublicPostsFilter {
  categorySlug?: string
  search?: string
  tag?: string
}

/** How many queued writes one public search will index before it falls back for the rest. */
const BLOG_SEARCH_DRAIN_BATCH = 20
const BLOG_SEARCH_TERM_LIMIT = 8
const BLOG_SEARCH_SNIPPET_RADIUS = 70

// The list's own columns. `updated_at` travels with the row because a search result is also a post
// summary; the body never does — a snippet comes from a bounded window around the match.
const PUBLIC_POST_COLUMNS = `p.id, p.slug, p.title, p.excerpt, p.cover_url, p.category_id, p.tags,
  p.views, p.published_at, p.updated_at,
  c.name as category_name, c.slug as category_slug,
  (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count`

interface PublicPostSearchRow extends BlogPostPublicRow {
  snippet_source?: string | null
}

export interface PublicPostsSearch {
  rows: Array<PublicPostSearchRow & { snippet?: string }>
  total: number
}

/** A page of published posts, searched through the index when it can be trusted. */
export async function searchPublicPosts(
  db: D1Database,
  ownerId: string,
  filter: PublicPostsFilter,
  limit: number,
  offset: number,
  ftsEnabled: boolean,
): Promise<PublicPostsSearch> {
  const terms = filter.search ? searchTerms(filter.search) : []
  if (ftsEnabled && terms.length && (await blogIndexReady(db, ownerId))) {
    try {
      return await indexedSearch(db, ownerId, filter, terms, limit, offset)
    } catch (error) {
      console.warn(
        '[blog] the full text search failed; answering from LIKE:',
        error instanceof Error ? error.message : error,
      )
    }
  }
  return likeSearch(db, ownerId, filter, limit, offset)
}

/**
 * A search may index the writes queued behind it before asking, and only answers from the index once
 * nothing is left queued: the drain is best-effort, so any failure simply keeps the LIKE answer.
 */
async function blogIndexReady(db: D1Database, ownerId: string): Promise<boolean> {
  try {
    await drainBlogFtsQueue(db, ownerId, BLOG_SEARCH_DRAIN_BATCH, true)
    return !(await hasPendingBlogFtsWork(db, ownerId))
  } catch (error) {
    console.warn(
      '[blog] the search index queue could not be drained; answering from LIKE:',
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

function searchTerms(raw: string): string[] {
  const terms = raw.split(/\s+/).map((term) => term.trim()).filter(Boolean)
  return [...new Set(terms)].slice(0, BLOG_SEARCH_TERM_LIMIT)
}

/**
 * The terms as one FTS5 query, scoped to the three columns a reader searches so the id column can
 * never answer a term. A multi-token term is a phrase (that is what CJK segmentation produces) and a
 * single token is a prefix, so a half-typed word still finds its post.
 */
function blogFtsMatch(terms: string[]): string {
  const parts: string[] = []
  for (const term of terms) {
    const seg = segmentCJK(term).trim().replace(/"/g, '')
    if (!seg) continue
    if (seg.includes(' ')) parts.push(`{title excerpt body} : "${seg}"`)
    else parts.push(`{title excerpt body} : "${seg}"*`)
  }
  return parts.join(' AND ')
}

function filterClauses(
  filter: PublicPostsFilter,
  startIdx: number,
  withSearch: boolean,
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  let idx = startIdx

  if (filter.categorySlug) {
    clauses.push(`c.slug = ?${idx++}`)
    params.push(filter.categorySlug)
  }

  if (withSearch && filter.search) {
    // The needle is escaped, or a query of `%` turns the listing into a full scan of every body.
    clauses.push(`(${likeAny(['p.title', 'p.excerpt', 'p.content'], `?${idx}`)})`)
    params.push(`%${escapeLike(filter.search)}%`)
    idx++
  }

  if (filter.tag) {
    const tagFilter = blogTagFilterSql('p.tags', filter.tag, idx)
    clauses.push(tagFilter.clause)
    params.push(...tagFilter.params)
    idx += 2
  }

  return { clauses, params }
}

function likeWhere(ownerId: string, filter: PublicPostsFilter): { clauses: string[]; params: unknown[] } {
  const { clauses, params } = filterClauses(filter, 2, true)
  return { clauses: [publicPostVisibleSql('p'), 'p.user_id = ?1', ...clauses], params: [ownerId, ...params] }
}

function likePageQuery(
  ownerId: string,
  filter: PublicPostsFilter,
  limit: number,
  offset: number,
): { sql: string; params: unknown[] } {
  const { clauses, params } = likeWhere(ownerId, filter)
  return {
    sql: `
      SELECT ${PUBLIC_POST_COLUMNS}
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY p.is_pinned DESC, p.published_at DESC
      LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
    `,
    params: [...params, limit, offset],
  }
}

function likeCountQuery(ownerId: string, filter: PublicPostsFilter): { sql: string; params: unknown[] } {
  const { clauses, params } = likeWhere(ownerId, filter)
  return {
    sql: `SELECT COUNT(*) AS n FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE ${clauses.join(' AND ')}`,
    params,
  }
}

function indexedWhere(
  ownerId: string,
  filter: PublicPostsFilter,
  match: string,
): { clauses: string[]; params: unknown[] } {
  const { clauses, params } = filterClauses(filter, 3, false)
  return {
    clauses: [
      publicPostVisibleSql('p'),
      'p.user_id = ?2',
      'blog_posts_fts.user_id = ?2',
      'blog_posts_fts MATCH ?1',
      ...clauses,
    ],
    params: [match, ownerId, ...params],
  }
}

function indexedPageQuery(
  ownerId: string,
  filter: PublicPostsFilter,
  terms: string[],
  limit: number,
  offset: number,
): { sql: string; params: unknown[] } {
  const { clauses, params } = indexedWhere(ownerId, filter, blogFtsMatch(terms))
  const snippetIndex = params.length + 1
  return {
    sql: `
      SELECT ${PUBLIC_POST_COLUMNS},
        ${contentWindowSql('p.content', snippetIndex)} AS snippet_source,
        bm25(blog_posts_fts, 0.0, 0.0, 10.0, 5.0, 1.0) AS score
      FROM blog_posts_fts
      JOIN blog_posts p ON p.id = blog_posts_fts.post_id AND p.user_id = blog_posts_fts.user_id
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE ${clauses.join(' AND ')}
      ORDER BY score ASC, p.published_at DESC, p.id ASC
      LIMIT ?${snippetIndex + 1} OFFSET ?${snippetIndex + 2}
    `,
    params: [...params, terms[0]!, limit, offset],
  }
}

function indexedCountQuery(
  ownerId: string,
  filter: PublicPostsFilter,
  terms: string[],
): { sql: string; params: unknown[] } {
  const { clauses, params } = indexedWhere(ownerId, filter, blogFtsMatch(terms))
  return {
    sql: `SELECT COUNT(*) AS n FROM blog_posts_fts
      JOIN blog_posts p ON p.id = blog_posts_fts.post_id AND p.user_id = blog_posts_fts.user_id
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE ${clauses.join(' AND ')}`,
    params,
  }
}

async function indexedSearch(
  db: D1Database,
  ownerId: string,
  filter: PublicPostsFilter,
  terms: string[],
  limit: number,
  offset: number,
): Promise<PublicPostsSearch> {
  const pageQuery = indexedPageQuery(ownerId, filter, terms, limit, offset)
  const countQuery = indexedCountQuery(ownerId, filter, terms)
  const [pageResult, countRow] = await Promise.all([
    db.prepare(pageQuery.sql).bind(...pageQuery.params).all<PublicPostSearchRow>(),
    db.prepare(countQuery.sql).bind(...countQuery.params).first<{ n: number }>(),
  ])

  const rows = (pageResult.results || []).map((row) => ({
    ...row,
    snippet: makeSnippet(row.snippet_source || row.excerpt, terms, BLOG_SEARCH_SNIPPET_RADIUS),
  }))
  return { rows, total: countRow?.n ?? 0 }
}

async function likeSearch(
  db: D1Database,
  ownerId: string,
  filter: PublicPostsFilter,
  limit: number,
  offset: number,
): Promise<PublicPostsSearch> {
  const pageQuery = likePageQuery(ownerId, filter, limit, offset)
  const countQuery = likeCountQuery(ownerId, filter)
  const [pageResult, countRow] = await Promise.all([
    db.prepare(pageQuery.sql).bind(...pageQuery.params).all<PublicPostSearchRow>(),
    db.prepare(countQuery.sql).bind(...countQuery.params).first<{ n: number }>(),
  ])
  return { rows: pageResult.results || [], total: countRow?.n ?? 0 }
}
