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
// The SEO columns travel with the list and the index for the same reason the excerpt does: editing a
// post starts from one of these rows, and a field the editor draws but the row does not carry would
// be silently written back as empty.
const POST_SEO_COLUMNS = `p.seo_title, p.seo_description, p.seo_image_url, p.seo_canonical_url, p.seo_noindex`

const POST_LIST_COLUMNS = `p.id, p.slug, p.note_id, p.user_id, p.title, p.excerpt,
  p.cover_url, p.category_id, p.folder_id, p.tags, p.is_published, p.allow_comments,
  p.is_pinned, p.views, p.published_at, p.created_at, p.updated_at, ${POST_SEO_COLUMNS}`

const POST_INDEX_COLUMNS = `p.id, p.note_id, p.slug, p.title, p.excerpt, p.cover_url,
  p.category_id, p.folder_id, p.tags, p.published_at, p.is_published, p.allow_comments, p.is_pinned,
  ${POST_SEO_COLUMNS}`

// The recycle bin draws the list's columns plus the moment the post was deleted; the same rows are
// the ones every live read filters out.
const POST_TRASH_COLUMNS = `${POST_LIST_COLUMNS}, p.deleted_at`

/**
 * One WHERE for the page query and the count query: if the two disagree about what the filter
 * selects, the pager offers a page the total does not know about.
 */
function blogPostsWhere(userId: string, filter: BlogPostsFilter): { clause: string; params: unknown[] } {
  const { status, categoryId, folderId, tag, search } = filter

  // A trashed post is gone from every live view (FEA-04): the list, its count, the note index and
  // the aggregate queries all start from the same "not in the bin" filter.
  let clause = `p.user_id = ?1 AND p.deleted_at IS NULL`
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
    sql: `SELECT ${POST_INDEX_COLUMNS} FROM blog_posts p
           WHERE p.user_id = ?1 AND p.deleted_at IS NULL
           ORDER BY p.published_at DESC`,
    params: [userId],
  }
}

/**
 * The recycle bin, newest deletion first. Deleted posts are the account's own rows and the list is
 * bounded by how many were thrown away, so it is answered in one query rather than paginated.
 */
export function blogTrashListQuery(userId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${POST_TRASH_COLUMNS},
      (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id) as comments_count
    FROM blog_posts p
    WHERE p.user_id = ?1 AND p.deleted_at IS NOT NULL
    ORDER BY p.deleted_at DESC`,
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
