/**
 * The SQL one batch action runs over a selection of posts. It is a module of its own because the
 * statements are the part of the batch route that can go wrong quietly — a child delete ordered after
 * its parent, a publish that rewrites dates the archive already published — while the route around
 * them only validates and dispatches.
 */

/** D1 refuses a statement that binds more than 100 variables, so a selection is written in groups. */
export const BLOG_POST_ID_CHUNK = 50

export interface BlogBatchStatement {
  sql: string
  binds: unknown[]
}

export function chunkPostIds(postIds: string[]): string[][] {
  const groups: string[][] = []
  for (let index = 0; index < postIds.length; index += BLOG_POST_ID_CHUNK) {
    groups.push(postIds.slice(index, index + BLOG_POST_ID_CHUNK))
  }
  return groups
}

export function blogBatchStatements(
  userId: string,
  action: string,
  postIds: string[],
  body: { categoryId?: string | null; folderId?: string | null; isPinned?: boolean },
  now: number,
): BlogBatchStatement[] {
  const placeholders = postIds.map(() => '?').join(',')
  // Every batch action works on live posts only: a selection cannot reach a row the author cannot
  // see, so a stale id in a request (or one restored elsewhere meanwhile) is a no-op rather than a
  // silent write to the recycle bin.
  const withIds = ` WHERE user_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`

  switch (action) {
    case 'publish':
      // Drafts stamp the moment they go out; already published rows keep their own, so a batch
      // publish cannot rewrite an archive's dates. SQLite reads the old `is_published` here.
      return [{
        sql: `UPDATE blog_posts SET is_published = 1, published_at = CASE WHEN is_published = 0 THEN ? ELSE published_at END, updated_at = ?${withIds}`,
        binds: [now, now, userId, ...postIds],
      }]
    case 'unpublish':
      return [{ sql: `UPDATE blog_posts SET is_published = 0, updated_at = ?${withIds}`, binds: [now, userId, ...postIds] }]
    case 'delete':
      // FEA-04: a batch delete moves the selection to the recycle bin. Nothing is erased here; the
      // trash routes are the only place that really deletes.
      return [{ sql: `UPDATE blog_posts SET deleted_at = ?, updated_at = ?${withIds}`, binds: [now, now, userId, ...postIds] }]
    case 'setCategory':
      return [{ sql: `UPDATE blog_posts SET category_id = ?, updated_at = ?${withIds}`, binds: [body.categoryId || null, now, userId, ...postIds] }]
    case 'setFolder':
      return [{ sql: `UPDATE blog_posts SET folder_id = ?, updated_at = ?${withIds}`, binds: [body.folderId || null, now, userId, ...postIds] }]
    case 'setPinned':
      return [{ sql: `UPDATE blog_posts SET is_pinned = ?, updated_at = ?${withIds}`, binds: [body.isPinned ? 1 : 0, now, userId, ...postIds] }]
    default:
      return []
  }
}

/**
 * The statements that really erase posts: the recycle bin's purge, which erases whatever the post
 * owned before the row itself goes. Order matters — `blog_comments` has no owner column, so the
 * delete has to ask `blog_posts` who owned the post while the row is still there.
 */
export function blogPurgeStatements(userId: string, postIds: string[]): BlogBatchStatement[] {
  const placeholders = postIds.map(() => '?').join(',')
  const withIds = ` WHERE user_id = ? AND id IN (${placeholders})`
  return [
    {
      sql: `DELETE FROM blog_comments WHERE post_id IN (
              SELECT id FROM blog_posts WHERE user_id = ? AND id IN (${placeholders}))`,
      binds: [userId, ...postIds],
    },
    { sql: `DELETE FROM blog_visits WHERE user_id = ? AND post_id IN (${placeholders})`, binds: [userId, ...postIds] },
    // The retired addresses go with the posts: a redirect to a row that is gone would resolve to
    // nothing, and the rows would sit in the table forever.
    { sql: `DELETE FROM blog_post_slugs WHERE user_id = ? AND post_id IN (${placeholders})`, binds: [userId, ...postIds] },
    { sql: `DELETE FROM blog_posts${withIds}`, binds: [userId, ...postIds] },
  ]
}
