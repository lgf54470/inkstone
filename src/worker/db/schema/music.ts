export const MUSIC_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS music_tracks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'r2',
      object_key TEXT NOT NULL,
      mime TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      cover_url TEXT,
      lyric TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS music_tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      parent_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS music_track_tags (
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (track_id, tag_id)
    )`,
  `CREATE TABLE IF NOT EXISTS music_playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS music_playlist_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
]

export const MUSIC_INDEX_STATEMENTS: readonly string[] = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_tracks_object ON music_tracks(user_id, object_key)',
  'CREATE INDEX IF NOT EXISTS idx_music_tracks_list ON music_tracks(user_id, is_pinned DESC, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_music_tracks_favorite ON music_tracks(user_id, is_favorite)',
  'CREATE INDEX IF NOT EXISTS idx_music_tracks_source ON music_tracks(user_id, source)',
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_music_tags_parent_name ON music_tags(user_id, COALESCE(parent_id, ''), name)`,
  'CREATE INDEX IF NOT EXISTS idx_music_tags_list ON music_tags(user_id, sort_order ASC)',
  'CREATE INDEX IF NOT EXISTS idx_music_track_tags_tag ON music_track_tags(user_id, tag_id)',
  'CREATE INDEX IF NOT EXISTS idx_music_playlists_list ON music_playlists(user_id, sort_order ASC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_music_playlist_items_unique ON music_playlist_items(playlist_id, track_id)',
  'CREATE INDEX IF NOT EXISTS idx_music_playlist_items_list ON music_playlist_items(playlist_id, sort_order ASC)',
]

// Databases created before the music tag tree shipped can hold a music_tags
// table without these columns; CREATE TABLE IF NOT EXISTS never adds them.
export const MUSIC_TAG_PARENT_MIGRATION_STATEMENTS: readonly string[] = [
  'ALTER TABLE music_tags ADD COLUMN parent_id TEXT',
]

export const MUSIC_TAG_ORDER_MIGRATION_STATEMENTS: readonly string[] = [
  'ALTER TABLE music_tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
]

export const MUSIC_SOURCE_MIGRATION_STATEMENTS: readonly string[] = [
  `ALTER TABLE music_tracks ADD COLUMN source TEXT NOT NULL DEFAULT 'r2'`,
  'CREATE INDEX IF NOT EXISTS idx_music_tracks_source ON music_tracks(user_id, source)',
]

export const MUSIC_PLAYBACK_MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS music_playback (
      user_id TEXT PRIMARY KEY,
      queue TEXT NOT NULL DEFAULT '[]',
      current_index INTEGER NOT NULL DEFAULT 0,
      position_ms INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
]

export const MUSIC_TAG_SCOPE_MIGRATION_STATEMENTS: readonly string[] = [
  'DROP INDEX IF EXISTS idx_music_tags_name',
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_music_tags_parent_name
     ON music_tags(user_id, COALESCE(parent_id, ''), name)`,
]

// An abandoned earlier build shipped a music schema with different column names
// (duration/size/source_path/is_favorited) and tag links by name. Rebuild those
// tables in place and carry the rows across instead of dropping the library.
export const MUSIC_LEGACY_REBUILD_STATEMENTS: readonly string[] = [
  // Legacy index names collide with the current ones; drop them so the new tables get their own.
  'DROP INDEX IF EXISTS idx_music_tracks_source',
  'DROP INDEX IF EXISTS idx_music_tags_user',
  'ALTER TABLE music_tracks RENAME TO music_tracks_legacy_backup',
  'ALTER TABLE music_playlists RENAME TO music_playlists_legacy_backup',
  'ALTER TABLE music_playlist_items RENAME TO music_playlist_items_legacy_backup',
  'ALTER TABLE music_track_tags RENAME TO music_track_tags_legacy_backup',
  ...MUSIC_TABLE_STATEMENTS,
  `INSERT OR IGNORE INTO music_tracks
     (id, user_id, title, artist, album, duration_ms, source, object_key, mime, size_bytes, cover_url, lyric, is_favorite, is_pinned, play_count, created_at, updated_at)
   SELECT id, user_id, title, artist, album,
          CASE WHEN duration IS NULL OR duration <= 0 THEN 0
               WHEN duration < 100000 THEN CAST(ROUND(duration * 1000) AS INTEGER)
               ELSE CAST(duration AS INTEGER) END,
          CASE WHEN source = 'webdav' THEN 'webdav' ELSE 'r2' END,
          CASE WHEN instr(COALESCE(source_path, ''), ':') > 0
               THEN substr(source_path, instr(source_path, ':') + 1)
               ELSE COALESCE(source_path, '') END,
          COALESCE(mime, 'audio/mpeg'), COALESCE(size, 0), NULL, lyric,
          CASE WHEN COALESCE(is_favorited, 0) = 1 OR COALESCE(is_liked, 0) = 1 THEN 1 ELSE 0 END,
          COALESCE(is_pinned, 0), COALESCE(play_count, 0), created_at, updated_at
     FROM music_tracks_legacy_backup`,
  `INSERT OR IGNORE INTO music_playlists
     (id, user_id, name, description, is_pinned, is_favorite, sort_order, created_at, updated_at)
   SELECT id, user_id, name, COALESCE(description, ''), COALESCE(is_pinned, 0), 0, COALESCE(position, 0), created_at, updated_at
     FROM music_playlists_legacy_backup`,
  `INSERT OR IGNORE INTO music_playlist_items (id, user_id, playlist_id, track_id, sort_order, created_at)
   SELECT lower(hex(randomblob(13))), user_id, playlist_id, track_id, COALESCE(position, 0), COALESCE(added_at, 0)
     FROM music_playlist_items_legacy_backup`,
  `INSERT OR IGNORE INTO music_track_tags (user_id, track_id, tag_id)
   SELECT links.user_id, links.track_id, tags.id
     FROM music_track_tags_legacy_backup links
     JOIN music_tags tags ON tags.user_id = links.user_id AND tags.name = links.tag_name`,
]

export const MUSIC_SCHEMA_STATEMENTS: readonly string[] = [
  ...MUSIC_TABLE_STATEMENTS,
  ...MUSIC_INDEX_STATEMENTS,
]
