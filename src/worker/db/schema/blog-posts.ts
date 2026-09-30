/**
 * `blog_posts` declares its own shape because the slug constraint is part of it, and changing that
 * constraint costs a table rebuild.
 *
 * A slug names a post inside one blog. Instance-wide uniqueness made the second account unable to
 * publish a name the first had used, and answered "is this taken?" for every blog at once, so the
 * uniqueness belongs on `(user_id, slug)`. SQLite cannot drop a UNIQUE the table declares, so the
 * move is a rebuild — rename, create the current shape, copy, drop — and the rebuild must create
 * exactly the shape the running schema declares. Both therefore come from the constants below
 * rather than from a statement written twice.
 *
 * Columns added after the rebuild (the per-post SEO fields, FEA-02) are appended to the declared
 * shape and replicated by their own `ALTER TABLE` migration with a `skipIfColumnExists` guard: a
 * database that has not run the rebuild yet gets them from the declared shape here, one that has gets
 * them from the migration. The rebuild's `INSERT … SELECT` names the columns it copies, so appended
 * ones simply take their defaults.
 */
export const BLOG_POSTS_TABLE_STATEMENT = `CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      note_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      cover_url TEXT NOT NULL DEFAULT '',
      category_id TEXT,
      folder_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 1,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      seo_image_url TEXT NOT NULL DEFAULT '',
      seo_canonical_url TEXT NOT NULL DEFAULT '',
      seo_noindex INTEGER NOT NULL DEFAULT 0
    )`

export const BLOG_POSTS_INDEX_STATEMENTS: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id, is_published, published_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_user_slug ON blog_posts(user_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_note ON blog_posts(note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_folder ON blog_posts(user_id, folder_id)`,
]

/**
 * The order indexes the management list actually reads (ENG-14), added after the slug rebuild.
 * They stay out of `BLOG_POSTS_INDEX_STATEMENTS` so migration 52's statement list remains exactly
 * what it was when it was applied — this list is what migration 53 and the schema path both run.
 */
export const BLOG_POSTS_ORDER_INDEX_STATEMENTS: readonly string[] = [
  // The list's default order (`is_pinned DESC, published_at DESC`) and its pinned filter.
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_user_pinned ON blog_posts(user_id, is_pinned DESC, published_at DESC)`,
  // The `sort=views_desc` ordering the list offers.
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_user_views ON blog_posts(user_id, views DESC)`,
]

/**
 * The shipped shape declared `slug TEXT NOT NULL UNIQUE`, whose implicit index cannot be dropped,
 * so the table is rebuilt to move uniqueness onto `(user_id, slug)`.
 *
 * Every index is dropped first: a renamed table keeps its indexes, so the names would still be taken
 * when the new table asks for them — and the ones left behind would be dropped along with the old
 * table, leaving the new one unindexed. The rebuild runs unconditionally, including on a database
 * that already has the current shape (a fresh install creates the table before migrations apply):
 * the copy is then empty, the shape it creates is the declared one, and the alternative — a guard
 * whose signal the normal schema path could also produce — would let a legacy table keep its
 * instance-wide UNIQUE while the index check reported the schema healthy.
 */
export const BLOG_POSTS_SLUG_REBUILD_STATEMENTS: readonly string[] = [
  'DROP INDEX IF EXISTS idx_blog_posts_user',
  'DROP INDEX IF EXISTS idx_blog_posts_user_slug',
  'DROP INDEX IF EXISTS idx_blog_posts_slug',
  'DROP INDEX IF EXISTS idx_blog_posts_note',
  'DROP INDEX IF EXISTS idx_blog_posts_category',
  'DROP INDEX IF EXISTS idx_blog_posts_folder',
  'ALTER TABLE blog_posts RENAME TO blog_posts_slug_legacy',
  BLOG_POSTS_TABLE_STATEMENT,
  `INSERT INTO blog_posts (
     id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id, folder_id,
     tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at
   )
   SELECT id, slug, note_id, user_id, title, excerpt, content, cover_url, category_id, folder_id,
     tags, is_published, allow_comments, is_pinned, views, published_at, created_at, updated_at
   FROM blog_posts_slug_legacy`,
  'DROP TABLE blog_posts_slug_legacy',
  ...BLOG_POSTS_INDEX_STATEMENTS,
]
