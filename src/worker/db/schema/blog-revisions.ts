/**
 * A blog revision is a snapshot of everything the author can rewrite: the fields a publish form or a
 * `/sync` can change, taken just before that change lands. It is deliberately not a copy of the whole
 * row — `views`, the publish moment, `created_at` and the recycle-bin column are facts about the
 * post's life, not about its text, and restoring a revision must not rewrite them (ADR-0008).
 *
 * The table is declared here and replicated by migration 58 so a fresh install and an upgrade meet
 * the same shape.
 */
export const BLOG_REVISIONS_TABLE_STATEMENT = `CREATE TABLE IF NOT EXISTS blog_revisions (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      cover_url TEXT NOT NULL DEFAULT '',
      category_id TEXT,
      folder_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 0,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      seo_image_url TEXT NOT NULL DEFAULT '',
      seo_canonical_url TEXT NOT NULL DEFAULT '',
      seo_noindex INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`

export const BLOG_REVISIONS_INDEX_STATEMENTS: readonly string[] = [
  // The list is newest-first per post; `rowid` breaks ties between two snapshots written in the same
  // millisecond, which is also the order the retention trim keeps.
  `CREATE INDEX IF NOT EXISTS idx_blog_revisions_post ON blog_revisions(post_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_revisions_user ON blog_revisions(user_id)`,
]

/**
 * How many snapshots one post keeps. It is a retention rule, not a platform limit: history is there
 * to undo a mistake, and the twentieth-newest version is beyond what an author reaches for — while
 * the content column is the largest in the schema. Pruning runs in the same batch as the insert.
 */
export const BLOG_REVISION_LIMIT = 20
