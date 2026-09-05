import type { SchemaMigration } from './types';

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    // Explicit whitelist (not a regex over SCHEMA_STATEMENTS) so later
    // additions like mcp_api_keys can never be picked up accidentally.
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         applied_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS mcp_preferences (
         user_id TEXT PRIMARY KEY,
         write_enabled INTEGER NOT NULL DEFAULT 1 CHECK (write_enabled IN (0, 1)),
         trash_enabled INTEGER NOT NULL DEFAULT 0 CHECK (trash_enabled IN (0, 1)),
         updated_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS mcp_operations (
         user_id TEXT NOT NULL,
         operation_id TEXT NOT NULL,
         tool TEXT NOT NULL,
         request_hash TEXT NOT NULL,
         response_json TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         PRIMARY KEY (user_id, operation_id)
       )`,
      `CREATE INDEX IF NOT EXISTS idx_mcp_operations_created
         ON mcp_operations(created_at)`,
    ],
  },
  {
    // Only CREATE TABLE / INDEX statements: D1 does not reliably support
    // ALTER TABLE ADD COLUMN with constraints, so the AI search preference
    // lives in app_meta (key `ai-search-enabled:<userId>`) instead of a
    // new column on the pre-existing mcp_preferences table.
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS mcp_api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT 'notes:read',
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user
         ON mcp_api_keys(user_id, revoked_at)`,
      `CREATE TABLE IF NOT EXISTS ai_note_embeddings (
        user_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        model TEXT NOT NULL,
        vector BLOB NOT NULL,
        indexed_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, note_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_embeddings_indexed
         ON ai_note_embeddings(user_id, indexed_at)`,
      `CREATE TABLE IF NOT EXISTS ai_index_queue (
        user_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('embed', 'delete')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, note_id)
      )`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS fts_index_queue (
        user_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, note_id)
      )`,
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_fts_index_queue_due
         ON fts_index_queue(user_id, created_at, note_id)`,
    ],
  },
  {
    version: 5,
    skipIfColumnExists: { table: 'folders', column: 'color' },
    statements: [
      `ALTER TABLE folders ADD COLUMN color TEXT`,
    ],
  },
  {
    version: 6,
    skipIfColumnExists: { table: 'tags', column: 'is_manual' },
    statements: [
      `ALTER TABLE tags ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: 7,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_attachments_user_sha ON attachments(user_id, sha256)`,
    ],
  },
  {
    version: 8,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_ai_index_queue_due
         ON ai_index_queue(user_id, created_at, note_id)`,
    ],
  },
  {
    version: 9,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_attachment_cleanup_user
         ON attachment_cleanup(user_id, created_at, object_key)`,
    ],
  },
  {
    version: 10,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_revoked
         ON mcp_api_keys(revoked_at)`,
    ],
  },
  {
    version: 11,
    statements: [
      `CREATE TABLE IF NOT EXISTS totp_credentials (
        user_id TEXT PRIMARY KEY,
        secret_ciphertext TEXT NOT NULL,
        enabled_at INTEGER,
        pending_token_hash TEXT,
        pending_session_id TEXT,
        pending_expires_at INTEGER,
        recovery_generation TEXT NOT NULL DEFAULT '',
        last_used_step INTEGER,
        last_used_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS totp_recovery_codes (
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        generation TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        used_at INTEGER,
        used_by TEXT,
        PRIMARY KEY (user_id, code_hash)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_totp_recovery_codes_user
         ON totp_recovery_codes(user_id, generation, used_at)`,
      `CREATE TABLE IF NOT EXISTS totp_login_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        claimed_by TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_totp_challenges_user
         ON totp_login_challenges(user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_totp_challenges_expires
         ON totp_login_challenges(expires_at)`,
    ],
  },
  {
    version: 12,
    statements: [
      `CREATE TABLE IF NOT EXISTS community_templates (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_community_templates_created
         ON community_templates(created_at DESC)`,
    ],
  },
  {
    // Source-side graph traversal (local graph mode BFS, MCP explore) queries
    // links by user + source and by user + target; the OR join can only use
    // both branches when each side has its own user-scoped index.
    version: 13,
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_links_user_source ON links(user_id, source_note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_links_user_target ON links(user_id, target_note_id)`,
    ],
  },
  {
    version: 14,
    skipIfColumnExists: { table: 'tags', column: 'is_pinned' },
    statements: [
      `ALTER TABLE tags ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: 15,
    skipIfColumnExists: { table: 'attachments', column: 'folder_id' },
    statements: [
      `ALTER TABLE attachments ADD COLUMN folder_id TEXT`,
      `ALTER TABLE attachments ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE attachments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE attachments ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_user_folder ON attachments(user_id, folder_id)`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_user_starred ON attachments(user_id, is_starred)`,
      `CREATE INDEX IF NOT EXISTS idx_attachments_user_pinned ON attachments(user_id, is_pinned)`,
    ],
  },
  {
    version: 16,
    statements: [
      `CREATE TABLE IF NOT EXISTS attachment_folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_attachment_folders_user ON attachment_folders(user_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_attachment_folders_parent ON attachment_folders(parent_id)`,
      `CREATE TABLE IF NOT EXISTS attachment_tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_tags_user ON attachment_tags(user_id, name)`,
    ],
  },
  {
    version: 17,
    skipIfColumnExists: { table: 'shares', column: 'is_enabled' },
    statements: [
      `ALTER TABLE shares ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE shares ADD COLUMN last_viewed_at INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS share_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        note_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        visited_at INTEGER NOT NULL,
        visitor_fp TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        referrer TEXT,
        referrer_host TEXT,
        device_type TEXT,
        os TEXT,
        browser TEXT,
        language TEXT,
        user_agent TEXT,
        is_bot INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_share_visits_user_time ON share_visits(user_id, visited_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_share_visits_slug_time ON share_visits(slug, visited_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_share_visits_note_time ON share_visits(note_id, visited_at DESC)`,
    ],
  },
  {
    version: 18,
    skipIfColumnExists: { table: 'share_visits', column: 'is_self_referrer' },
    statements: [
      `ALTER TABLE share_visits ADD COLUMN is_self_referrer INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE share_visits ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_share_visits_filter_time ON share_visits(user_id, is_bot, is_self_referrer, is_owner, visited_at DESC)`,
    ],
  },
  {
    version: 19,
    skipIfColumnExists: { table: 'shares', column: 'folder_id' },
    statements: [
      `ALTER TABLE shares ADD COLUMN folder_id TEXT`,
      `ALTER TABLE shares ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
      `CREATE INDEX IF NOT EXISTS idx_shares_folder ON shares(user_id, folder_id)`,
      `CREATE TABLE IF NOT EXISTS share_folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_share_folders_user ON share_folders(user_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_share_folders_parent ON share_folders(parent_id)`,
      `CREATE TABLE IF NOT EXISTS share_tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tags_user ON share_tags(user_id, name)`,
    ],
  },
  {
    version: 20,
    statements: [
      `UPDATE share_visits SET is_self_referrer = 0 WHERE is_self_referrer = 1 AND (referrer IS NULL OR referrer = '' OR referrer LIKE '%/s/%')`,
      `UPDATE shares SET views = COALESCE((SELECT COUNT(*) FROM share_visits WHERE share_visits.note_id = shares.note_id AND share_visits.is_bot = 0), 0) WHERE views = 0`,
    ],
  },
  {
    version: 21,
    statements: [
      `CREATE TABLE IF NOT EXISTS blog_posts (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        note_id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        cover_url TEXT NOT NULL DEFAULT '',
        category_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        is_published INTEGER NOT NULL DEFAULT 1,
        allow_comments INTEGER NOT NULL DEFAULT 1,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        published_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id, is_published, published_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_posts_note ON blog_posts(note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id)`,
      `CREATE TABLE IF NOT EXISTS blog_categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT,
        icon TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(user_id, slug)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_categories_user ON blog_categories(user_id, position)`,
      `CREATE TABLE IF NOT EXISTS blog_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        parent_id TEXT,
        author_name TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_url TEXT,
        author_avatar TEXT,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        ip TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id, status, created_at ASC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status, created_at DESC)`,
    ],
  },
  {
    version: 22,
    statements: [
      `CREATE TABLE IF NOT EXISTS blog_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        visited_at INTEGER NOT NULL,
        visitor_fp TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        referrer TEXT,
        referrer_host TEXT,
        device_type TEXT,
        os TEXT,
        browser TEXT,
        language TEXT,
        user_agent TEXT,
        is_bot INTEGER NOT NULL DEFAULT 0,
        is_self_referrer INTEGER NOT NULL DEFAULT 0,
        is_owner INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_visits_user_time ON blog_visits(user_id, visited_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_visits_slug_time ON blog_visits(slug, visited_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_visits_post_time ON blog_visits(post_id, visited_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_visits_filter_time ON blog_visits(user_id, is_bot, is_self_referrer, is_owner, visited_at DESC)`,
    ],
  },
  {
    version: 23,
    skipIfColumnExists: { table: 'blog_posts', column: 'folder_id' },
    statements: [
      `ALTER TABLE blog_posts ADD COLUMN folder_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_blog_posts_folder ON blog_posts(user_id, folder_id)`,
      `CREATE TABLE IF NOT EXISTS blog_folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        position REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_folders_user ON blog_folders(user_id, position)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_folders_parent ON blog_folders(parent_id)`,
      `CREATE TABLE IF NOT EXISTS blog_tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_tags_user ON blog_tags(user_id, name)`,
    ],
  },
]
