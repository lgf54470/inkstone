/**
 * One row per shared note that is currently being presented to an audience (ADR-0006).
 *
 * Keyed by slug because that is all a viewer knows: `POST /api/public/:slug/present` is the whole read
 * path, and one row per share is the decision that "a share has one show at a time" is enforced by the
 * schema rather than by convention. The token is stored hashed for the same reason session tokens are —
 * this row is the capability that lets a stranger read where a talk is, and a leaked row must not be a
 * leaked link.
 *
 * Nothing else lives here on purpose: no viewer identifiers, no per-page history, no counts. The row
 * answers one question ("where is the show now, and may this caller hear it"), and the lease in
 * `expires_at` is what stops a forgotten show from answering it forever.
 */
export const SHARE_PRESENCE_TABLE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS share_presence (
     slug TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     note_id TEXT NOT NULL,
     token_hash TEXT NOT NULL,
     slide INTEGER NOT NULL DEFAULT 0,
     page INTEGER NOT NULL DEFAULT 0,
     step INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  // The owner's own reads ("is a show running?") and the maintenance sweep both come from the account
  // side; the viewer's read comes from the primary key.
  `CREATE INDEX IF NOT EXISTS idx_share_presence_user ON share_presence(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_share_presence_expiry ON share_presence(expires_at)`,
]
