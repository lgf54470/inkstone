import { extractAttachmentIds } from "@shared/markdown-utils";
import type { Attachment } from "@shared/types";
import { getMeta, setMeta } from "../../db/metadata";
import { type AttachmentObjectStorage } from "../../attachments/keys";
import { ApiError } from "../../lib/errors";

export interface AttachmentRow {
  id: string
  user_id: string
  note_id: string | null
  folder_id: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  storage: AttachmentObjectStorage
  is_starred: number
  is_pinned: number
  tags: string
  created_at: number
}

export const ATTACHMENT_LIST_PAGE_SIZE = 500

export const ATTACHMENT_SCAN_PAGE_SIZE = 100

export const ATTACHMENT_REF_WRITE_CHUNK = 100

// The usage panel re-opens and re-pages often while note contents rarely
// change between opens; keep one exact reference map per user for a short
// window so page 2, filters and re-opens skip the full content scan.
// The cache lives in D1 (attachment_refs + an app_meta freshness stamp), so
// every isolate shares the rebuild instead of scanning all note bodies once
// per isolate within the window.
const ATTACHMENT_REFERENCE_CACHE_TTL_MS = 60_000

export function attachmentRefMetaKey(userId: string): string {
  return `attachment-refs:${userId}`
}

export async function readAttachmentReferenceCounts(
  db: D1Database,
  userId: string,
): Promise<Map<string, number>> {
  const meta = await getMeta(db, attachmentRefMetaKey(userId))
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as { at?: unknown }
      if (
        typeof parsed.at === 'number' &&
        Date.now() - parsed.at < ATTACHMENT_REFERENCE_CACHE_TTL_MS
      ) {
        const { results } = await db
          .prepare(`SELECT attachment_id, count FROM attachment_refs WHERE user_id = ?1`)
          .bind(userId)
          .all<{ attachment_id: string; count: number }>()
        const references = new Map<string, number>()
        for (const row of results) references.set(row.attachment_id, row.count)
        return references
      }
    } catch {
      // Corrupt stamp: fall through to a rebuild.
    }
  }
  const references = await collectAttachmentReferences(db, userId)
  await persistAttachmentReferenceCounts(db, userId, references)
  return references
}

export async function persistAttachmentReferenceCounts(
  db: D1Database,
  userId: string,
  references: ReadonlyMap<string, number>,
): Promise<void> {
  // The freshness stamp is written last, so readers never observe a
  // half-rebuilt table: they only consult it when the stamp is fresh.
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM attachment_refs WHERE user_id = ?1`).bind(userId),
  ]
  for (const [attachmentId, count] of references) {
    statements.push(
      db.prepare(
        `INSERT OR REPLACE INTO attachment_refs (user_id, attachment_id, count)
         VALUES (?1, ?2, ?3)`,
      ).bind(userId, attachmentId, count),
    )
  }
  for (let index = 0; index < statements.length; index += ATTACHMENT_REF_WRITE_CHUNK) {
    await db.batch(statements.slice(index, index + ATTACHMENT_REF_WRITE_CHUNK))
  }
  await setMeta(db, attachmentRefMetaKey(userId), JSON.stringify({ at: Date.now() }))
}

export function encodeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function parseAttachmentListCursor(value: string | undefined): { createdAt: number; id: string } | null {
  if (!value) return null
  const match = /^(\d{1,16})\.([0-9a-hjkmnp-tv-z]{26})$/.exec(value)
  const createdAt = Number(match?.[1])
  if (!match || !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw ApiError.badRequest('Invalid attachment cursor')
  }
  return { createdAt, id: match[2]! }
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    folderId: row.folder_id ?? null,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    url: `/api/files/${row.id}`,
    createdAt: row.created_at,
    isStarred: Boolean(row.is_starred),
    isPinned: Boolean(row.is_pinned),
    tags: parseTags(row.tags),
  }
}

export async function collectAttachmentReferences(
  db: D1Database,
  userId: string,
  wantedIds?: ReadonlySet<string>,
  options: { earlyExit?: boolean } = {},
): Promise<Map<string, number>> {
  const references = new Map<string, number>()
  if (wantedIds?.size === 0) return references
  // When the caller only needs presence (e.g. pruning), stopping as soon as
  // every wanted id has been found is exact: unscanned notes could only add
  // more references for already-found ids, never create new ones.
  const earlyExit = options.earlyExit === true

  let afterId = ''
  while (true) {
    const { results } = await db.prepare(
      `SELECT id, content FROM notes
        WHERE user_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3`,
    ).bind(userId, afterId, ATTACHMENT_SCAN_PAGE_SIZE).all<{ id: string; content: string }>()
    if (!results.length) break

    for (const note of results) {
      for (const id of extractAttachmentIds(note.content)) {
        if (wantedIds && !wantedIds.has(id)) continue
        references.set(id, (references.get(id) ?? 0) + 1)
      }
    }
    if (earlyExit && wantedIds && references.size === wantedIds.size) break
    afterId = results[results.length - 1]!.id
    if (results.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  return references
}

export async function collectAttachmentIdsThroughBoundary(
  db: D1Database,
  userId: string,
  boundary: { created_at: number; id: string },
): Promise<Set<string>> {
  const ids = new Set<string>()
  let cursor: { createdAt: number; id: string } | null = null
  while (true) {
    const query: D1PreparedStatement = cursor
      ? db.prepare(
          `SELECT created_at, id FROM attachments WHERE user_id = ?1
            AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
            AND (created_at > ?4 OR (created_at = ?4 AND id > ?5))
           ORDER BY created_at ASC, id ASC LIMIT ?6`,
        ).bind(
          userId,
          boundary.created_at,
          boundary.id,
          cursor.createdAt,
          cursor.id,
          ATTACHMENT_SCAN_PAGE_SIZE,
        )
      : db.prepare(
          `SELECT created_at, id FROM attachments WHERE user_id = ?1
            AND (created_at < ?2 OR (created_at = ?2 AND id <= ?3))
           ORDER BY created_at ASC, id ASC LIMIT ?4`,
        ).bind(userId, boundary.created_at, boundary.id, ATTACHMENT_SCAN_PAGE_SIZE)
    const rows: Array<{ created_at: number; id: string }> = (await query.all<{
      created_at: number
      id: string
    }>()).results
    if (!rows.length) break
    for (const row of rows) ids.add(row.id)
    const last = rows[rows.length - 1]!
    cursor = { createdAt: last.created_at, id: last.id }
    if (rows.length < ATTACHMENT_SCAN_PAGE_SIZE) break
  }
  return ids
}

export async function removeTagFromAttachmentJson(
  db: D1Database,
  userId: string,
  name: string,
): Promise<void> {
  const { results } = await db.prepare(
    `SELECT id, tags FROM attachments WHERE user_id = ?1 AND tags LIKE ?2`,
  ).bind(userId, `%"${name}"%`).all<{ id: string; tags: string }>()
  const stmts: D1PreparedStatement[] = []
  for (const row of results) {
    const updated = parseTags(row.tags).filter((tag) => tag !== name)
    stmts.push(
      db.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`)
        .bind(JSON.stringify(updated), row.id, userId),
    )
  }
  if (stmts.length) await db.batch(stmts)
}

export async function renameTagInAttachmentJson(
  db: D1Database,
  userId: string,
  from: string,
  to: string,
): Promise<void> {
  const { results } = await db.prepare(
    `SELECT id, tags FROM attachments WHERE user_id = ?1 AND tags LIKE ?2`,
  ).bind(userId, `%"${from}"%`).all<{ id: string; tags: string }>()
  const stmts: D1PreparedStatement[] = []
  for (const row of results) {
    const updated = parseTags(row.tags).map((tag) => (tag === from ? to : tag))
    stmts.push(
      db.prepare(`UPDATE attachments SET tags = ?1 WHERE id = ?2 AND user_id = ?3`)
        .bind(JSON.stringify(updated), row.id, userId),
    )
  }
  if (stmts.length) await db.batch(stmts)
}
