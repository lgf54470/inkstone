import { ApiError } from '../../lib/errors'
import type { BlogPostPublicRow } from '../../db/rows'

/**
 * One published post of one blog, by slug. Both readers of a post need the same row — the detail
 * response that renders it and the visit beacon that counts a view for it — and the owner is part of
 * the key in both, so a slug another account published is a different post.
 */
export async function loadPublicPostBySlug(db: D1Database, ownerId: string, slug: string): Promise<BlogPostPublicRow> {
  const row = await db
    .prepare(`
      SELECT p.*,
        c.name as category_name, c.slug as category_slug,
        (SELECT COUNT(*) FROM blog_comments cm WHERE cm.post_id = p.id AND cm.status = 'approved') as comments_count
      FROM blog_posts p
      LEFT JOIN blog_categories c ON p.category_id = c.id
      WHERE p.slug = ?1 AND p.is_published = 1 AND p.user_id = ?2
    `)
    .bind(slug, ownerId)
    .first<BlogPostPublicRow>()

  if (!row) {
    throw ApiError.notFound('Post not found')
  }
  return row
}
