import { newId } from './id'

export type ShareAuditAction = 'create' | 'update' | 'revoke' | 'batch'

export interface ShareAuditEntry {
  userId: string
  noteId: string
  slug: string
  action: ShareAuditAction
  changedJson: string
  createdAt: number
}

export interface ShareAuditFieldSnapshot {
  slug: string
  isEnabled: number | null
  expiresAt: number | null
  folderId: string | null
  tags: string[] | null
  hasPassword: boolean
}

/** One changed field: `from`/`to` as stored, except the passcode, which is only ever "was set". */
export interface ShareAuditFieldChange {
  field: string
  from?: string | number | boolean | null
  to?: string | number | boolean | null
}

function changed(
  field: string,
  from: ShareAuditFieldSnapshot,
  to: ShareAuditFieldSnapshot,
  read: (snapshot: ShareAuditFieldSnapshot) => string | number | boolean | null,
): ShareAuditFieldChange | null {
  const before = read(from)
  const after = read(to)
  if (before === after) return null
  return { field, from: before, to: after }
}

/**
 * The fields two share snapshots disagree on, in a stable order. The passcode is compared by
 * presence only — a hash is a secret-shaped value even in a log — and the tag list compares as a
 * serialized array, which is what the row stores. Nothing here reads the visitor's side: this is
 * the owner's edit history.
 */
export function shareAuditDiff(
  before: ShareAuditFieldSnapshot | null | undefined,
  after: ShareAuditFieldSnapshot,
): ShareAuditFieldChange[] {
  if (!before) return []
  const changes = [
    changed('slug', before, after, (row) => row.slug),
    changed('password', before, after, (row) => row.hasPassword),
    changed('expires_at', before, after, (row) => row.expiresAt),
    changed('is_enabled', before, after, (row) => row.isEnabled),
    changed('folder_id', before, after, (row) => row.folderId),
    changed('tags', before, after, (row) => (row.tags ? JSON.stringify(row.tags) : null)),
  ]
  return changes.filter((change): change is ShareAuditFieldChange => change !== null)
}

/**
 * Writes the entries in one batch. Best-effort by design, and so it is caught rather than left
 * floating: the audit trail describes an edit that has already happened, so a failed append must
 * not turn a finished, owner-visible write into a 500 — but it also must not vanish quietly, which
 * is why the failure is logged at warn with the reason it can be tolerated.
 */
export async function recordShareAudit(db: D1Database, entries: ShareAuditEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    await db.batch(entries.map((entry) => db.prepare(
      `INSERT INTO share_audit_log (id, user_id, note_id, slug, action, changed_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(newId(), entry.userId, entry.noteId, entry.slug, entry.action, entry.changedJson, entry.createdAt)))
  } catch (error) {
    console.warn('[share] failed to append the share audit log:', errorMessageOf(error))
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}
