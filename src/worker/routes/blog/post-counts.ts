/**
 * The per-folder and per-tag post counts the dashboard and the tag list draw, answered by SQL
 * aggregates. They used to be accumulated in the worker from a `SELECT folder_id, is_published,
 * tags FROM blog_posts` — every post row crossing the wire on every hub open, and a second copy of
 * the same scan for the tag list. `json_each` reads the tags array in place, so the counts cost the
 * rows the database already had.
 */

export interface BlogPostCountPair {
  total: number
  published: number
}

export interface BlogPostFolderCountRow {
  folder_id: string
  total: number
  published: number
}

export interface BlogPostTagCountRow {
  name: string
  total: number
  published: number
}

/** Posts per folder, split into all and published. As before, only folders that hold posts appear. */
export function blogPostFolderCountsStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT folder_id,
            COUNT(*) AS total,
            COUNT(CASE WHEN is_published = 1 THEN 1 END) AS published
       FROM blog_posts
      WHERE user_id = ?1 AND folder_id IS NOT NULL AND folder_id <> ''
      GROUP BY folder_id`,
  ).bind(userId)
}

/**
 * Occurrences per tag, split into all and published, with the trim rules the JS accumulator had: a
 * member counts as its trimmed text, and an empty member is not a tag. The nested `CASE` is the
 * guard for a corrupt array — `json_type` and `json_each` throw on malformed JSON, `AND` does not
 * promise to short-circuit, and one legacy row must not take the dashboard down (the same guard the
 * share tag counts use in `lib/share-selection-sql.ts`). Non-string members are stringified the way
 * the JS path did (`true`/`false`/`null` carry their JSON text).
 */
export function blogPostTagCountsStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT name,
            COUNT(*) AS total,
            COUNT(CASE WHEN published = 1 THEN 1 END) AS published
       FROM (
         SELECT CASE je.type
                  WHEN 'true' THEN 'true'
                  WHEN 'false' THEN 'false'
                  WHEN 'null' THEN 'null'
                  ELSE TRIM(je.value)
                END AS name,
                p.is_published AS published
           FROM blog_posts p
           JOIN json_each(CASE WHEN json_valid(p.tags) THEN (CASE WHEN json_type(p.tags) = 'array' THEN p.tags ELSE '[]' END) ELSE '[]' END) AS je
          WHERE p.user_id = ?1
       )
      WHERE name <> ''
      GROUP BY name`,
  ).bind(userId)
}

export function toBlogPostFolderCounts(rows: BlogPostFolderCountRow[]): Record<string, BlogPostCountPair> {
  const folderCounts: Record<string, BlogPostCountPair> = {}
  for (const row of rows) {
    folderCounts[row.folder_id] = { total: row.total, published: row.published }
  }
  return folderCounts
}

export function toBlogPostTagCounts(rows: BlogPostTagCountRow[]): {
  tagCounts: Record<string, BlogPostCountPair>
  tagsCount: number
} {
  const tagCounts: Record<string, BlogPostCountPair> = {}
  for (const row of rows) {
    tagCounts[row.name] = { total: row.total, published: row.published }
  }
  return { tagCounts, tagsCount: rows.length }
}
