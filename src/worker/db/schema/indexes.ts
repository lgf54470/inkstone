export const INDEX_STATEMENTS: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id, parent_id, position)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_sibling
       ON folders(user_id, IFNULL(parent_id, ''), lower(name)) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_notes_user_updated
       ON notes(user_id, deleted_at, is_archived, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(user_id, folder_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_starred ON notes(user_id, is_starred, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_trash ON notes(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notes_title_key
       ON notes(user_id, title_key, deleted_at, created_at, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique ON tags(user_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_target ON links(user_id, target_key)`,
  `CREATE INDEX IF NOT EXISTS idx_links_target_note ON links(target_note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_user_source ON links(user_id, source_note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_user_target ON links(user_id, target_note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_note ON note_versions(note_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_user_sha ON attachments(user_id, sha256)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_user_folder ON attachments(user_id, folder_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_user_starred ON attachments(user_id, is_starred)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_user_pinned ON attachments(user_id, is_pinned)`,
  `CREATE INDEX IF NOT EXISTS idx_attachment_folders_user ON attachment_folders(user_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_attachment_folders_parent ON attachment_folders(parent_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_tags_user ON attachment_tags(user_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_attachment_cleanup_created
       ON attachment_cleanup(created_at, object_key)`,
  `CREATE INDEX IF NOT EXISTS idx_attachment_cleanup_user
       ON attachment_cleanup(user_id, created_at, object_key)`,
  `CREATE INDEX IF NOT EXISTS idx_import_mappings_target
       ON import_mappings(user_id, entity, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_targets_user ON backup_targets(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_user ON backup_runs(user_id, started_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_note ON shares(note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_shares_folder ON shares(user_id, folder_id)`,
  `CREATE INDEX IF NOT EXISTS idx_share_folders_user ON share_folders(user_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_share_folders_parent ON share_folders(parent_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_share_tags_user ON share_tags(user_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_share_visits_user_time ON share_visits(user_id, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_share_visits_slug_time ON share_visits(slug, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_share_visits_note_time ON share_visits(note_id, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_share_visits_filter_time ON share_visits(user_id, is_bot, is_self_referrer, is_owner, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_share_asset_sessions_slug
       ON share_asset_sessions(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_share_asset_sessions_expires
       ON share_asset_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_changes_user ON changes(user_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_last_fail ON login_attempts(last_fail_at)`,
  `CREATE INDEX IF NOT EXISTS idx_totp_recovery_codes_user
       ON totp_recovery_codes(user_id, generation, used_at)`,
  `CREATE INDEX IF NOT EXISTS idx_totp_challenges_user
       ON totp_login_challenges(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_totp_challenges_expires
       ON totp_login_challenges(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_operations_created
       ON mcp_operations(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user
       ON mcp_api_keys(user_id, revoked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_revoked
       ON mcp_api_keys(revoked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_embeddings_indexed
       ON ai_note_embeddings(user_id, indexed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_index_queue_due
       ON ai_index_queue(user_id, created_at, note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fts_index_queue_due
       ON fts_index_queue(user_id, created_at, note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_community_templates_created
       ON community_templates(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id, is_published, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_note ON blog_posts(note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_posts_folder ON blog_posts(user_id, folder_id)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_folders_user ON blog_folders(user_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_folders_parent ON blog_folders(parent_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_tags_user ON blog_tags(user_id, name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(user_id, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_categories_user ON blog_categories(user_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id, status, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_visits_user_time ON blog_visits(user_id, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_visits_slug_time ON blog_visits(slug, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_visits_post_time ON blog_visits(post_id, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_blog_visits_filter_time ON blog_visits(user_id, is_bot, is_self_referrer, is_owner, visited_at DESC)`,
];
