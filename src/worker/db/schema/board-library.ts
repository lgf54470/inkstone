/**
 * An account owns a set of *named* whiteboard libraries, the way the public directory
 * lists them: one row per name, one JSON object per row (see attachments/backend.ts) —
 * a library can grow past what a D1 row should carry, and the stored hash lets a re-save
 * of identical content skip the object write.
 */
export const BOARD_LIBRARY_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS board_library (
     user_id TEXT NOT NULL,
     name TEXT NOT NULL,
     storage TEXT NOT NULL CHECK (storage IN ('r2', 'kv')),
     object_key TEXT NOT NULL,
     size INTEGER NOT NULL,
     sha256 TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, name)
   )`,
]
