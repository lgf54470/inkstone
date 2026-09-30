import { escapeLike, likeAny } from '../../lib/like'
import { blogTagFilterSql } from './tag-needles'

/** Default page size of the management list; a request may ask for less, never for more than the cap. */
export const BLOG_POSTS_PAGE_SIZE = 50
export const BLOG_POSTS_PAGE_SIZE_MAX = 200

export interface BlogPostsFilter {
  status?: string
  categoryId?: string
  folderId?: string
  tag?: string
  search?: string
  sort: string
}

// The list draws a title, a summary of metadata and counters — never the body. `content` is the one
// column measured in kilobytes, and it used to travel with every row only to be dropped client-side.
const POST_LIST_COLUMNS = `p.id, p.slug, p.note_id, p.user_id, p.title, p.excerpt,
  p.cover_url, p.category_id, p.folder_id, p.tags, p.is_published, p.allow_comments,
  p.is_pinned, p.views, p.published_at, p.created_at, p.updated_at`

const POST_INDEX_COLUMNS = `p.id, p.note_id, p.slug, p.title, p.excerpt, p.cover_url,
  p.category_id, p.folder_id, p.tags, p.published_at, p.is_published, p.allow_comments, p.is_pinned`

/**
 * One WHERE for the page query and the count query: if the two disagree about what the filter
 * selects, the pager offers a page the total does not know about.
 */
function blogPostsWhere(userId: string, filter: BlogPostsFilter): { clause: string; params: unknown[] } {
  const { status, categoryId, folderId, tag, search } = filter

  let clause = `p.user_id = ?1`
  const params: unknown[] = [userId]
  let idx = 2

  if (status === 'published') {
    clause += ` AND p.is_published = 1`
  } else if (status === 'draft') {
    clause += ` AND p.is_published = 0`
  } else if (status === 'pinned') {
    clause += ` AND p.is_pinned = 1`
  }

  if (folderId === 'none') {
    clause += ` AND (p.folder_id IS NULL OR p.folder_id = '')`
  } else if (folderId) {
    clause += ` AND p.folder_id = ?${idx++}`
    params.push(folderId)
  }

  if (categoryId) {
    clause += ` AND p.category_id = ?${idx++}`
    params.push(categoryId)
  }

  if (tag) {
    // Pushed into SQL for the same reason as the public listing's: filtering a fetched page in JS
    // would answer "this tag has no posts" for every post that lives on another page.
    const tagFilter = blogTagFilterSql('p.tags', tag, idx)
    clause += ` AND ${tagFilter.clause}`
    params.push(...tagFilter.params)
    idx += 2
  }

  if (search) {
    // Escaped like the public listing's needle: an unescaped `%` here scans every post of the
    // account, and `_` silently matches unrelated titles.
    clause += ` AND (${likeAny(['p.title', 'p.excerpt', 'p.slug'], `?${idx}`)})`
    params.push(`%${escapeLike(search)}%`)
    idx++
  }

  return { clause, params }
}

export function blogPostsListQuery(
  userId: string,
  filter: BlogPostsFilter,
  limit: number,
  offset: number,
): { sql: string; params: unknown[] } {
  const { clause, params } = blogPostsWhere(userId, filter)
  const sql = `
    SELECT ${POST_LIST_COLUMNS},
      (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id) as comments_count
    FROM blog_posts p
    WHERE ${clause}
    ${postListOrderSql(filter.sort)}
    LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
  `
  return { sql, params: [...params, limit, offset] }
}

export function blogPostsCountQuery(userId: string, filter: BlogPostsFilter): { sql: string; params: unknown[] } {
  const { clause, params } = blogPostsWhere(userId, filter)
  return { sql: `SELECT COUNT(*) AS n FROM blog_posts p WHERE ${clause}`, params }
}

/**
 * The complete, body-free index of the account's posts, used by the note list to know which notes
 * were published and what the publish dialog should start from. It is deliberately not paginated —
 * the caller needs every note's answer — which is affordable only because the post body is absent.
 */
export function blogPostIndexQuery(userId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${POST_INDEX_COLUMNS} FROM blog_posts p WHERE p.user_id = ?1 ORDER BY p.published_at DESC`,
    params: [userId],
  }
}

function postListOrderSql(sort: string): string {
  if (sort === 'views_desc') {
    return ` ORDER BY p.views DESC, p.published_at DESC`
  }
  if (sort === 'published_asc') {
    return ` ORDER BY p.published_at ASC`
  }
  return ` ORDER BY p.is_pinned DESC, p.published_at DESC`
}
