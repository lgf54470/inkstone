import { escapeLike } from './like'
import { isValidId, isValidSlug } from './id'

/**
 * Published collections (ADR-0005): the address and the access policy are stored, the members are
 * derived. This module owns the two things that must not be stated twice — what counts as a member,
 * and how a page of members is walked — so the public directory and the owner's live count cannot
 * disagree about which shares a collection holds.
 */

export type CollectionTargetType = 'folder' | 'tag'

export interface CollectionTarget {
  type: CollectionTargetType
  value: string
}

/**
 * The membership condition of a collection, as SQL plus the binds it needs. A share belongs to a
 * folder collection by `folder_id` and to a tag collection by the tag id appearing in its JSON tag
 * array — the same two predicates the share list filters by, because a collection that selected
 * differently from the list it was created from would be a bug nobody could see.
 */
export function collectionMemberPredicate(target: CollectionTarget, bindIndex: number): { sql: string; binds: string[] } {
  if (target.type === 'folder') {
    return { sql: `s.folder_id = ?${bindIndex}`, binds: [target.value] }
  }
  return { sql: `s.tags LIKE ?${bindIndex} ESCAPE '\\'`, binds: [`%"${escapeLike(target.value)}"%`] }
}

/**
 * One page of a collection's members, newest first. Pinned notes lead, exactly as they do in the
 * share list: a collection is the same list seen by a visitor, so the order they meet it in is the
 * order the owner arranged.
 */
export function collectionMembersStatement(db: D1Database, params: {
  userId: string
  target: CollectionTarget
  now: number
  cursor: CollectionCursor | null
  limit: number
}): D1PreparedStatement {
  const { userId, target, now, cursor, limit } = params
  // The member value is the third bind, after the account and "now": the same two the count uses,
  // so the listing and the counting cannot disagree about what they are selecting.
  const member = collectionMemberPredicate(target, 3)
  const binds: Array<string | number> = [userId, now, ...member.binds]
  let cursorClause = ''
  if (cursor) {
    binds.push(cursor.isPinned, cursor.updatedAt, cursor.slug)
    const base = binds.length - 2
    cursorClause = ` AND (n.is_pinned < ?${base} OR (n.is_pinned = ?${base} AND
        (n.updated_at < ?${base + 1} OR (n.updated_at = ?${base + 1} AND s.slug < ?${base + 2}))))`
  }
  binds.push(limit)
  return db.prepare(
    `SELECT n.title, n.excerpt, n.is_pinned, n.updated_at, s.slug, s.password_hash
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND s.is_enabled = 1 AND (s.expires_at IS NULL OR s.expires_at > ?2)
        AND n.deleted_at IS NULL AND ${member.sql}${cursorClause}
      ORDER BY n.is_pinned DESC, n.updated_at DESC, s.slug DESC
      LIMIT ?${binds.length}`,
  ).bind(...binds)
}

/** How many members a collection has right now, by the same predicate the page lists with. */
export function collectionMemberCountStatement(db: D1Database, params: {
  userId: string
  target: CollectionTarget
  now: number
}): D1PreparedStatement {
  const { userId, target, now } = params
  const member = collectionMemberPredicate(target, 3)
  return db.prepare(
    `SELECT COUNT(*) AS members
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND s.is_enabled = 1 AND (s.expires_at IS NULL OR s.expires_at > ?2)
        AND n.deleted_at IS NULL AND ${member.sql}`,
  ).bind(userId, now, ...member.binds)
}

export interface CollectionMemberRow {
  title: string
  excerpt: string
  is_pinned: number
  updated_at: number
  slug: string
  password_hash: string | null
}

export interface CollectionCursor {
  isPinned: number
  updatedAt: number
  slug: string
}

/**
 * The cursor names where the last page stopped, in the order the page was sorted by. Opaque because
 * it exposes the owner's arrangement; a client that composed one itself would be reimplementing the
 * ordering rule, and would go on working after that rule changed.
 */
export function nextCollectionCursor(rows: CollectionMemberRow[], limit: number): string | null {
  if (rows.length < limit) return null
  const last = rows[rows.length - 1]
  if (!last) return null
  return encodeCollectionCursor({ isPinned: last.is_pinned, updatedAt: last.updated_at, slug: last.slug })
}

function encodeCollectionCursor(cursor: CollectionCursor): string {
  return btoa(`${cursor.isPinned}|${cursor.updatedAt}|${cursor.slug}`)
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** Null for an absent cursor; a malformed one is an error the caller must answer, not a first page. */
export function decodeCollectionCursor(raw: string | undefined): CollectionCursor | null {
  if (!raw) return null
  const padded = raw.replaceAll('-', '+').replaceAll('_', '/')
  const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const [pinnedText, updatedText, slug] = decoded.split('|')
  const isPinned = Number(pinnedText)
  const updatedAt = Number(updatedText)
  if ((isPinned !== 0 && isPinned !== 1) || !Number.isSafeInteger(updatedAt) || updatedAt < 0 || !slug || !isValidSlug(slug)) {
    throw new Error('invalid collection cursor')
  }
  return { isPinned, updatedAt, slug }
}

/**
 * A collection's title is its folder's or tag's name, read at request time: renaming a folder renames
 * the page it published. The stored record keeps the target value only, so there is no second name to
 * fall out of date.
 */
export async function collectionTitle(db: D1Database, userId: string, target: CollectionTarget): Promise<string> {
  const table = target.type === 'folder' ? 'share_folders' : 'share_tags'
  const row = await db.prepare(
    `SELECT name FROM ${table} WHERE id = ?1 AND user_id = ?2`,
  ).bind(target.value, userId).first<{ name: string }>()
  return row?.name ?? ''
}

export function isCollectionTargetType(value: unknown): value is CollectionTargetType {
  return value === 'folder' || value === 'tag'
}

export function isValidTargetValue(value: unknown): value is string {
  return typeof value === 'string' && isValidId(value)
}
