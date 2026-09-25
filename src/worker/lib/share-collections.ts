import { resolveShareTarget, type ShareTarget, type ShareTargetRecord } from '@shared/share-selection'
import { collectionChannelToken } from '@shared/share-channel'
import { isValidId, isValidSlug } from './id'
import { shareSelectionSql, type ShareSqlConditions } from './share-selection-sql'

/**
 * Published collections (ADR-0005): the address and the access policy are stored, the members are
 * derived. This module owns the two things that must not be stated twice — what counts as a member,
 * and how a page of members is walked — so the public directory and the owner's live count cannot
 * disagree about which shares a collection holds.
 *
 * A collection stores a *record id* and matches by the *stored value*: `shares.folder_id` holds a
 * folder id, a tag array holds tag names. `resolveShareTarget()` is the conversion, and it used to be
 * missing here — a tag collection matched its tag's id against the array of names, so every published
 * tag page was empty while the owner's own count agreed with it. The visibility rule was a second
 * copy too, spelled out in both statements below instead of being the `active` status; identical at
 * the time, which is exactly the kind of copy that stops being identical later.
 */

/**
 * The tag name a record id resolves to, or null when the tag is gone. Reading it is the caller's job
 * (the worker has the row, the demo its map), which is what keeps the rule pure.
 */
export function collectionTarget(
  target: ShareTargetRecord,
  tagName: string | null,
): ShareTarget {
  return resolveShareTarget(target, tagName)
}

/**
 * What a collection page selects: its target, and the visibility rule every visitor-facing list
 * applies — the `active` status itself, not a condition written out here, so the page and the owner's
 * list cannot come to call different shares visible.
 */
export function collectionMemberConditions(params: {
  target: ShareTarget
  now: number
  firstBind: number
}): ShareSqlConditions {
  return shareSelectionSql({ status: 'active', target: params.target }, params)
}

/**
 * The member orders a collection page can list with (audit #13). `default` is the shipped order —
 * pinned notes lead, then newest — and NULL on the row means the same thing; the others are named
 * presets because the members are derived from the shares on every request, so a stored per-member
 * ordering would go stale the moment a share moved.
 */
export const COLLECTION_MEMBER_SORTS = ['default', 'newest', 'oldest', 'title'] as const

export type CollectionMemberSort = (typeof COLLECTION_MEMBER_SORTS)[number]

export function isCollectionMemberSort(value: unknown): value is CollectionMemberSort {
  return typeof value === 'string' && (COLLECTION_MEMBER_SORTS as readonly string[]).includes(value)
}

interface MemberSortSpec {
  order: string
  /** The keyset predicate the cursor must satisfy, phrased against the binds the cursor carries. */
  cursor: string
}

/** The four orders a page can list with, each with its own keyset predicate — paging has to follow sorting. */
const MEMBER_SORT_SPECS: Record<CollectionMemberSort, MemberSortSpec> = {
  default: {
    order: 'n.is_pinned DESC, n.updated_at DESC, s.slug DESC',
    cursor: `(n.is_pinned < ?{p} OR (n.is_pinned = ?{p} AND
        (n.updated_at < ?{u} OR (n.updated_at = ?{u} AND s.slug < ?{s}))))`,
  },
  newest: {
    order: 'n.updated_at DESC, s.slug DESC',
    cursor: `(n.updated_at < ?{u} OR (n.updated_at = ?{u} AND s.slug < ?{s}))`,
  },
  oldest: {
    order: 'n.updated_at ASC, s.slug ASC',
    cursor: `(n.updated_at > ?{u} OR (n.updated_at = ?{u} AND s.slug > ?{s}))`,
  },
  title: {
    order: 'n.title COLLATE NOCASE ASC, s.slug ASC',
    cursor: `(n.title > ?{t} COLLATE NOCASE OR (n.title = ?{t} COLLATE NOCASE AND s.slug > ?{s}))`,
  },
}

function memberSortSpec(sort: string | null | undefined): MemberSortSpec {
  if (sort === 'newest' || sort === 'oldest' || sort === 'title') return MEMBER_SORT_SPECS[sort]
  return MEMBER_SORT_SPECS.default
}

/**
 * One page of a collection's members, newest first unless the collection says otherwise. Pinned
 * notes lead, exactly as they do in the share list: a collection is the same list seen by a
 * visitor, so the order they meet it in is the order the owner arranged.
 */
export function collectionMembersStatement(db: D1Database, params: {
  userId: string
  target: ShareTarget
  now: number
  cursor: CollectionCursor | null
  limit: number
  sort?: string | null
}): D1PreparedStatement {
  const { userId, target, now, cursor, limit, sort } = params
  const spec = memberSortSpec(sort)
  // The member conditions start after the account bind, so the listing and the count below number
  // their placeholders from the same two binds and cannot disagree about what they select.
  const member = collectionMemberConditions({ target, now, firstBind: 2 })
  const binds: Array<string | number> = [userId, ...member.binds]
  let cursorClause = ''
  if (cursor) {
    // The binds follow first appearance in the predicate, not a fixed p/u/s/t sequence: the title
    // order phrases its keyset as title-then-slug. A token the predicate repeats (?{p} twice in
    // the default order) binds once and is reused, like any named placeholder.
    const tokens = [...new Set([...spec.cursor.matchAll(/\?\{(\w)\}/g)].map((match) => match[1]))]
    const parts = tokens.map((token) => token === 'p' ? cursor.isPinned : token === 'u' ? cursor.updatedAt : token === 's' ? cursor.slug : cursor.title ?? '')
    // The cursor's binds are appended after the member binds, so their placeholders start here;
    // each token gets the index its own bind took, wherever the predicate repeats or skips one.
    const first = binds.length + 1
    binds.push(...parts)
    cursorClause = tokens.reduce(
      (sql, token, position) => sql.replaceAll(`?{${token}}`, `?${first + position}`),
      ` AND ${spec.cursor}`,
    )
  }
  binds.push(limit)
  return db.prepare(
    `SELECT n.title, n.excerpt, n.is_pinned, n.updated_at, s.slug, s.password_hash
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND n.deleted_at IS NULL AND ${member.conditions.join(' AND ')}${cursorClause}
      ORDER BY ${spec.order}
      LIMIT ?${binds.length}`,
  ).bind(...binds)
}

/** How many members a collection has right now, by the same conditions the page lists with. */
export function collectionMemberCountStatement(db: D1Database, params: {
  userId: string
  target: ShareTarget
  now: number
}): D1PreparedStatement {
  const { userId, target, now } = params
  const member = collectionMemberConditions({ target, now, firstBind: 2 })
  return db.prepare(
    `SELECT COUNT(*) AS members
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND n.deleted_at IS NULL AND ${member.conditions.join(' AND ')}`,
  ).bind(userId, ...member.binds)
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
  /** Only the title order pages by the note title; absent cursors are the three-field legacy shape. */
  title?: string
}

/**
 * The cursor names where the last page stopped, in the order the page was sorted by. Opaque because
 * it exposes the owner's arrangement; a client that composed one itself would be reimplementing the
 * ordering rule, and would go on working after that rule changed.
 */
export function nextCollectionCursor(rows: CollectionMemberRow[], limit: number, sort?: string | null): string | null {
  if (rows.length < limit) return null
  const last = rows[rows.length - 1]
  if (!last) return null
  const cursor: CollectionCursor = { isPinned: last.is_pinned, updatedAt: last.updated_at, slug: last.slug }
  if (sort === 'title') cursor.title = last.title
  return encodeCollectionCursor(cursor)
}

function encodeCollectionCursor(cursor: CollectionCursor): string {
  // The title is a note title, which may carry the delimiter itself; it travels encoded.
  const raw = cursor.title === undefined
    ? `${cursor.isPinned}|${cursor.updatedAt}|${cursor.slug}`
    : `${cursor.isPinned}|${cursor.updatedAt}|${cursor.slug}|${encodeURIComponent(cursor.title)}`
  return btoa(raw)
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** Null for an absent cursor; a malformed one is an error the caller must answer, not a first page. */
export function decodeCollectionCursor(raw: string | undefined): CollectionCursor | null {
  if (!raw) return null
  const padded = raw.replaceAll('-', '+').replaceAll('_', '/')
  const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const [pinnedText, updatedText, slug, encodedTitle] = decoded.split('|')
  const isPinned = Number(pinnedText)
  const updatedAt = Number(updatedText)
  if ((isPinned !== 0 && isPinned !== 1) || !Number.isSafeInteger(updatedAt) || updatedAt < 0 || !slug || !isValidSlug(slug)) {
    throw new Error('invalid collection cursor')
  }
  const cursor: CollectionCursor = { isPinned, updatedAt, slug }
  if (encodedTitle !== undefined) {
    try {
      cursor.title = decodeURIComponent(encodedTitle)
    } catch {
      throw new Error('invalid collection cursor')
    }
  }
  return cursor
}

/**
 * The name of the folder or tag a collection points at, read at request time: renaming a folder
 * renames the page it published. Null when the record is gone, which is the same fact the member rule
 * needs — a tag collection whose tag was deleted has no name to show and no name to match, so both
 * answers come from this one lookup. The stored record keeps the target's id only, so there is no
 * second name to fall out of date.
 */
export async function collectionTargetName(db: D1Database, userId: string, target: ShareTargetRecord): Promise<string | null> {
  const table = target.type === 'folder' ? 'share_folders' : 'share_tags'
  const row = await db.prepare(
    `SELECT name FROM ${table} WHERE id = ?1 AND user_id = ?2`,
  ).bind(target.value, userId).first<{ name: string }>()
  return row?.name ?? null
}

export function isValidTargetValue(value: unknown): value is string {
  return typeof value === 'string' && isValidId(value)
}

/**
 * The title behind every channel a directory stamps, keyed by the marker itself (ADR-0005). The
 * label is read here rather than stored on the visit: the visit row keeps the marker, the marker
 * keeps the collection's slug, and this lookup turns that slug into the folder/tag name the owner
 * published — so renaming a folder renames what the channel split calls it, with nothing to keep in
 * sync. A paused collection is still listed: pausing a directory does not un-attribute the visits
 * it already brought in.
 */
export function collectionChannelLabelsStatement(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(
    `SELECT c.slug AS slug,
            ${collectionTargetNameSelect()} AS name
       FROM share_collections c ${collectionTargetNameJoin()}
      WHERE c.user_id = ?1`,
  ).bind(userId)
}

/**
 * The joins that resolve a collection's stored target id to its live folder/tag name. One shape,
 * two readers (the channel labels and the owner's list), so a change to how a target resolves
 * cannot land in one query and miss the other.
 */
export function collectionTargetNameJoin(alias = 'c'): string {
  return `LEFT JOIN share_folders f ON ${alias}.target_type = 'folder' AND f.id = ${alias}.target_value AND f.user_id = ${alias}.user_id
          LEFT JOIN share_tags t ON ${alias}.target_type = 'tag' AND t.id = ${alias}.target_value AND t.user_id = ${alias}.user_id`
}

/** The live name the join resolves; null when the folder or tag is gone. */
export function collectionTargetNameSelect(alias = 'c'): string {
  return `CASE ${alias}.target_type WHEN 'folder' THEN f.name ELSE t.name END`
}

export interface CollectionChannelLabelRow {
  slug: string
  name: string | null
}

/**
 * Marker → title, built through `collectionChannelToken` so this lookup cannot name a token the
 * directory does not hand out. A collection whose folder/tag is gone contributes nothing: its
 * historic visits stay in the breakdown under their raw marker rather than under a name that no
 * longer exists to check.
 */
export function collectionChannelLabels(rows: CollectionChannelLabelRow[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const row of rows) {
    if (row.name) labels.set(collectionChannelToken(row.slug), row.name)
  }
  return labels
}
