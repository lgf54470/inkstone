export const TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      login TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      position REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
  `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      title_key TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      rev INTEGER NOT NULL DEFAULT 1,
      word_count INTEGER NOT NULL DEFAULT 0,
      char_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
  `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_manual INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id)
    )`,
  `CREATE TABLE IF NOT EXISTS links (
      source_note_id TEXT NOT NULL,
      target_key TEXT NOT NULL,
      target_title TEXT NOT NULL,
      target_note_id TEXT,
      user_id TEXT NOT NULL,
      PRIMARY KEY (source_note_id, target_key)
    )`,
  `CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note_id TEXT,
      folder_id TEXT,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      storage TEXT NOT NULL CHECK (storage IN ('r2', 'kv')),
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )`,
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
  `CREATE TABLE IF NOT EXISTS attachment_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS attachment_refs (
      user_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (user_id, attachment_id)
    )`,
  `CREATE TABLE IF NOT EXISTS attachment_cleanup (
      object_key TEXT PRIMARY KEY CHECK (object_key GLOB 'r2:?*' OR object_key GLOB 'kv:?*'),
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS import_mappings (
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL CHECK (entity IN ('note', 'attachment')),
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, entity, source_id)
    )`,
  `CREATE TABLE IF NOT EXISTS backup_targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      secret TEXT,
      last_run_at INTEGER,
      last_status TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS backup_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      note_count INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      bytes INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '[]'
    )`,
  `CREATE TABLE IF NOT EXISTS shares (
      slug TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      folder_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      password_hash TEXT,
      expires_at INTEGER,
      views INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      last_viewed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
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
  `CREATE TABLE IF NOT EXISTS share_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
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
      is_bot INTEGER NOT NULL DEFAULT 0,
      is_self_referrer INTEGER NOT NULL DEFAULT 0,
      is_owner INTEGER NOT NULL DEFAULT 0
    )`,
  `CREATE TABLE IF NOT EXISTS share_asset_sessions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL,
      at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      fails INTEGER NOT NULL DEFAULT 0,
      last_fail_at INTEGER NOT NULL,
      locked_until INTEGER
    )`,
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
  `CREATE TABLE IF NOT EXISTS totp_login_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      claimed_by TEXT,
      created_at INTEGER NOT NULL
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
  `CREATE TABLE IF NOT EXISTS ai_note_embeddings (
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      model TEXT NOT NULL,
      vector BLOB NOT NULL,
      indexed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, note_id)
    )`,
  `CREATE TABLE IF NOT EXISTS ai_index_queue (
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('embed', 'delete')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, note_id)
    )`,
  `CREATE TABLE IF NOT EXISTS fts_index_queue (
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, note_id)
    )`,
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
      folder_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 1,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
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
  `CREATE TABLE IF NOT EXISTS blog_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
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
];
