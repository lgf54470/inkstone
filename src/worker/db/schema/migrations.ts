import { BOARD_LIBRARY_DEFAULT_NAME } from '@shared/constants'
import { BOARD_LIBRARY_TABLE_STATEMENTS } from './board-library'
import { MUSIC_LEGACY_REBUILD_STATEMENTS, MUSIC_PLAYBACK_MIGRATION_STATEMENTS, MUSIC_SCHEMA_STATEMENTS, MUSIC_SOURCE_MIGRATION_STATEMENTS, MUSIC_TAG_ORDER_MIGRATION_STATEMENTS, MUSIC_TAG_PARENT_MIGRATION_STATEMENTS, MUSIC_TAG_SCOPE_MIGRATION_STATEMENTS } from './music'
import type { SchemaMigration } from './types'
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
  {
    version: 24,
    statements: [
      `CREATE TABLE IF NOT EXISTS blog_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        category_id TEXT,
        status TEXT NOT NULL DEFAULT 'approved',
        is_pinned INTEGER NOT NULL DEFAULT 0,
        pinned_order INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_links_user ON blog_links(user_id, status, is_pinned DESC, sort_order ASC, created_at ASC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_links_category ON blog_links(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_links_url ON blog_links(url)`,
      `CREATE TABLE IF NOT EXISTS blog_link_categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        parent_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blog_link_categories_user ON blog_link_categories(user_id, sort_order ASC)`,
      `CREATE INDEX IF NOT EXISTS idx_blog_link_categories_parent ON blog_link_categories(parent_id)`,
    ],
  },
  {
    version: 25,
    skipIfColumnExists: { table: 'blog_links', column: 'is_favorite' },
    statements: [
      `ALTER TABLE blog_links ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_blog_links_fav ON blog_links(user_id, is_favorite DESC)`,
    ],
  },
  {
    version: 26,
    statements: [...MUSIC_SCHEMA_STATEMENTS],
  },
  {
    version: 27,
    skipIfColumnExists: { table: 'music_tracks', column: 'source' },
    statements: [...MUSIC_SOURCE_MIGRATION_STATEMENTS],
  },
  { version: 28, statements: [...MUSIC_PLAYBACK_MIGRATION_STATEMENTS] },
  { version: 29, skipIfColumnExists: { table: 'music_tags', column: 'parent_id' }, statements: MUSIC_TAG_PARENT_MIGRATION_STATEMENTS },
  { version: 30, skipIfColumnExists: { table: 'music_tags', column: 'sort_order' }, statements: MUSIC_TAG_ORDER_MIGRATION_STATEMENTS },
  { version: 31, statements: MUSIC_TAG_SCOPE_MIGRATION_STATEMENTS },
  { version: 32, skipIfColumnExists: { table: 'music_tracks', column: 'duration_ms' }, statements: MUSIC_LEGACY_REBUILD_STATEMENTS },
  {
    // Persist the storage key per row: reads and deletes stop rebuilding keys
    // from mutable row fields, and new uploads write user-scoped keys. The
    // backfill reproduces the pre-user_id key layout that existing objects
    // were written under; the oldest per-user id layout stays reachable via
    // the legacy fallback.
    version: 33,
    skipIfColumnExists: { table: 'attachments', column: 'object_key' },
    statements: [
      `ALTER TABLE attachments ADD COLUMN object_key TEXT`,
      `UPDATE attachments SET object_key =
         (CASE WHEN mime LIKE 'image/%' THEN 'images' ELSE 'files' END)
         || '/' || strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')
         || '/' || filename
       WHERE object_key IS NULL`,
    ],
  },
  {
    // Version and backup-run lists page by (created_at DESC, id DESC) and tag
    // lists order by name COLLATE NOCASE, while note lookups and per-user
    // version retention filter by user_id alone; the existing indexes match
    // none of those shapes, so each of those reads scans the user's rows.
    version: 34,
    statements: [
      `DROP INDEX IF EXISTS idx_versions_note`,
      `CREATE INDEX idx_versions_note ON note_versions(note_id, created_at DESC, id DESC)`,
      `DROP INDEX IF EXISTS idx_runs_user`,
      `CREATE INDEX idx_runs_user ON backup_runs(user_id, started_at DESC, id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id, id)`,
      `CREATE INDEX IF NOT EXISTS idx_tags_name_nocase ON tags(user_id, name COLLATE NOCASE)`,
      `CREATE INDEX IF NOT EXISTS idx_versions_user ON note_versions(user_id)`,
    ],
  },
  {
    // Whiteboard libraries arrived after every other table, so the baseline carries
    // the definition (schema/board-library.ts) and this migration only makes existing
    // instances catch up with it.
    version: 35,
    statements: [...BOARD_LIBRARY_TABLE_STATEMENTS],
  },
  {
    // Version 35 kept one document per account; a library is a named collection (the
    // shape the public directory lists), so the table becomes one row per name. The
    // single document an instance may already hold is carried over as the default
    // library, keeping its object key — no object is moved or rewritten.
    version: 36,
    statements: [
      `ALTER TABLE board_library RENAME TO board_library_flat`,
      ...BOARD_LIBRARY_TABLE_STATEMENTS,
      `INSERT INTO board_library (user_id, name, storage, object_key, size, sha256, updated_at)
         SELECT user_id, '${BOARD_LIBRARY_DEFAULT_NAME}', storage, object_key, size, sha256, updated_at
         FROM board_library_flat`,
      `DROP TABLE board_library_flat`,
    ],
  },
  {
    // FEAT-9: the recently-played list must survive a device switch, so the last play
    // timestamp lives on the row instead of only in one browser's preferences.
    version: 37,
    skipIfColumnExists: { table: 'music_tracks', column: 'last_played_at' },
    statements: [
      `ALTER TABLE music_tracks ADD COLUMN last_played_at INTEGER`,
      'CREATE INDEX IF NOT EXISTS idx_music_tracks_recent_play ON music_tracks(user_id, last_played_at DESC)',
    ],
  },
  {
    // M-51: sharing is per playlist, so the public slug lives on the playlist row.
    // NULL means not shared; the unique index tolerates many NULLs.
    version: 38,
    skipIfColumnExists: { table: 'music_playlists', column: 'share_slug' },
    statements: [
      `ALTER TABLE music_playlists ADD COLUMN share_slug TEXT`,
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_playlists_share ON music_playlists(share_slug)',
    ],
  },
  {
    // M-53: duplicate detection needs a content checksum per track. It is computed
    // when the bytes pass through the worker (uploads), so rows stored before this
    // migration keep NULL and simply stay out of the duplicate view - hashing old
    // objects would mean re-downloading the whole library.
    version: 39,
    skipIfColumnExists: { table: 'music_tracks', column: 'content_hash' },
    statements: [
      `ALTER TABLE music_tracks ADD COLUMN content_hash TEXT`,
      'CREATE INDEX IF NOT EXISTS idx_music_tracks_hash ON music_tracks(user_id, content_hash)',
    ],
  },
  {
    // The index is dropped rather than reshaped because fts5 has no ALTER: note_id moves from
    // UNINDEXED to indexed so the deletes that reach a row through MATCH stop scanning the table,
    // which is also what they silently stopped doing (a no-op delete left every edit's previous
    // body behind and grew a duplicate row per rebuild). Repopulating is the queue's job, not this
    // migration's: the stored body is segmented for CJK, and that transform only exists in code.
    // Until the drain catches up the search falls back to LIKE, which answers from the note rows.
    version: 40,
    statements: [
      `DROP TABLE IF EXISTS notes_fts`,
      `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at)
         SELECT user_id, id, 'upsert', CAST(strftime('%s', 'now') AS INTEGER) * 1000
           FROM notes WHERE deleted_at IS NULL
         ON CONFLICT(user_id, note_id) DO UPDATE SET
           kind = excluded.kind,
           created_at = CASE
             WHEN excluded.created_at > fts_index_queue.created_at THEN excluded.created_at
             ELSE fts_index_queue.created_at + 1
           END`,
    ],
  },
  {
    // The distribution marker a visit's URL carried (ADR-0004). Nullable and unindexed: existing
    // rows mean "no marker", and the dashboard reads the column only inside an already-narrowed
    // range, so a partial index over a mostly-null column would buy nothing.
    version: 41,
    skipIfColumnExists: { table: 'share_visits', column: 'channel' },
    statements: [
      `ALTER TABLE share_visits ADD COLUMN channel TEXT`,
    ],
  },
  {
    // Published collection pages (ADR-0005). The table holds only what must be stored — the address
    // and the access policy — because the members are derived from the shares on every request; a
    // member snapshot would need double writes and would silently go stale.
    version: 42,
    statements: [
      `CREATE TABLE IF NOT EXISTS share_collections (
         id TEXT PRIMARY KEY,
         slug TEXT NOT NULL,
         user_id TEXT NOT NULL,
         target_type TEXT NOT NULL,
         target_value TEXT NOT NULL,
         password_hash TEXT,
         expires_at INTEGER,
         is_enabled INTEGER NOT NULL DEFAULT 1,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_share_collections_slug ON share_collections(slug)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_share_collections_target
         ON share_collections(user_id, target_type, target_value) WHERE is_enabled = 1`,
      `CREATE INDEX IF NOT EXISTS idx_share_collections_user ON share_collections(user_id, created_at DESC)`,
    ],
  },
  {
    // The share link's own change history (audit #6): an append-only record of who changed what
    // about a link — slug, passcode presence, expiry, visibility — so an overwriting edit stops
    // being unrecoverable. Only the shape of a passcode change is recorded (set/cleared), never
    // the value, and no IP or agent: the log answers "what happened to this link", not "who was
    // near it".
    version: 43,
    statements: [
      `CREATE TABLE IF NOT EXISTS share_audit_log (
         id TEXT PRIMARY KEY,
         user_id TEXT NOT NULL,
         note_id TEXT NOT NULL,
         slug TEXT NOT NULL,
         action TEXT NOT NULL CHECK (action IN ('create', 'update', 'revoke', 'batch')),
         changed_json TEXT NOT NULL DEFAULT '{}',
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_share_audit_log_user ON share_audit_log(user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_share_audit_log_note ON share_audit_log(note_id, created_at DESC)`,
    ],
  },
  {
    // The member order a collection's page lists with (audit #13). A preset key rather than a
    // per-member order: derived members are computed from the shares on every request, so a
    // stored member ordering would go stale the moment a share moved — a named preset keeps the
    // page, the count and the owner's list answering the same question. NULL is the shipped
    // order (pinned first, then newest), which is what every collection before this column had.
    version: 44,
    skipIfColumnExists: { table: 'share_collections', column: 'member_sort' },
    statements: [
      `ALTER TABLE share_collections ADD COLUMN member_sort TEXT`,
    ],
  },
]
