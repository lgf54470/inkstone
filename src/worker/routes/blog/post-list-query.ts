import type { BlogPost } from '@shared/types'
import { escapeLike, likeAny } from '../../lib/like'

export interface BlogPostsFilter {
  status?: string
  categoryId?: string
  folderId?: string
  tag?: string
  search?: string
  sort: string
}

export function blogPostsListQuery(userId: string, filter: BlogPostsFilter): { sql: string; params: unknown[] } {
  const { status, categoryId, folderId, search, sort } = filter

  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id) as comments_count
    FROM blog_posts p
    WHERE p.user_id = ?1
  `
  const params: unknown[] = [userId]
  let idx = 2

  if (status === 'published') {
    sql += ` AND p.is_published = 1`
  } else if (status === 'draft') {
    sql += ` AND p.is_published = 0`
  } else if (status === 'pinned') {
    sql += ` AND p.is_pinned = 1`
  }

  if (folderId === 'none') {
    sql += ` AND (p.folder_id IS NULL OR p.folder_id = '')`
  } else if (folderId) {
    sql += ` AND p.folder_id = ?${idx++}`
    params.push(folderId)
  }

  if (categoryId) {
    sql += ` AND p.category_id = ?${idx++}`
    params.push(categoryId)
  }

  if (search) {
    // Escaped like the public listing's needle: an unescaped `%` here scans every post of the
    // account, and `_` silently matches unrelated titles.
    sql += ` AND (${likeAny(['p.title', 'p.excerpt', 'p.slug'], `?${idx}`)})`
    params.push(`%${escapeLike(search)}%`)
    idx++
  }

  sql += postListOrderSql(sort)

  return { sql, params }
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

export function filterPostsByTag(posts: BlogPost[], tag: string): BlogPost[] {
  return posts.filter(
    (p) =>
      Array.isArray(p.tags) &&
      p.tags.some((t: string) => t === tag || t.startsWith(`${tag}/`)),
  )
}
